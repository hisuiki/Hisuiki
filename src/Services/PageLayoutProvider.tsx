import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  defaultRoot,
  insertInTree,
  makeWidget,
  moveIntoContainer,
  readLayout,
  readPage,
  removeFromTree,
  treeHasChild,
  updateInTree,
  writeLayout,
} from "./LayoutUtils";
import type { BoardSummary, PageSettings, ProfileLayout, Widget, WidgetKind } from "../Types/TypeRegistry";
import type { WidgetDrag } from "./WidgetDragUtils";
import { useAuth } from "./AuthProvider";
import { fetchBoard, fetchMyBoard, fetchPrimaryBoard, updateBoard } from "./BoardService";
import { fetchSiteDefaults, fetchSitePage, type SitePageName } from "./SiteService";
import { resolveRoute, useRouter } from "./AppRouter";

interface PageLayoutValue {
  /** The page: one container holding everything. */
  root: Widget;
  setRoot: (next: Widget | ((prev: Widget) => Widget)) => void;
  /** Replaces one widget anywhere in the tree. */
  replaceWidget: (id: string, next: Widget) => void;
  /** Moves a widget into a container, from wherever in the tree it currently is. */
  moveWidgetToContainer: (
    id: string,
    containerId: string,
    targetCell?: { col?: number; row?: number },
  ) => void;
  page: PageSettings;
  setPage: (page: PageSettings) => void;
  /** What is being dragged, so any container can offer itself as a target. */
  dragging: WidgetDrag | null;
  announceDrag: (drag: WidgetDrag | null) => void;
  /** Puts the widget being dragged from the gallery where it would land, live. */
  insertPreview: (id: string, kind: WidgetKind, containerId: string) => void;
  cancelPreview: () => void;
  finalizePreview: () => void;
  inspectingId: string | null;
  inspect: (id: string | null, anchor?: HTMLElement | null) => void;
  inspectorAnchor: HTMLElement | null;
  reset: () => void;
  editing: boolean;
  setEditing: (editing: boolean) => void;
  /** The persisted board being viewed or edited; null on standalone app pages. */
  board: BoardSummary | null;
  /** Remounts the surface when one experience replaces another. */
  layoutKey: string;
  /** Route currently painted by the loaded layout; it changes between leave and enter. */
  displayPathname: string;
  transition: "idle" | "leaving" | "entering";
}

interface SaveStatusValue {
  saveState: "idle" | "saving" | "saved";
  saveError: string | null;
}

const noop = () => {};

const PageLayoutContext = createContext<PageLayoutValue>({
  root: defaultRoot(),
  setRoot: noop,
  replaceWidget: noop,
  moveWidgetToContainer: noop,
  page: { wallpaper: { source: "bing" } },
  setPage: noop,
  dragging: null,
  announceDrag: noop,
  insertPreview: noop,
  cancelPreview: noop,
  finalizePreview: noop,
  inspectingId: null,
  inspect: noop,
  inspectorAnchor: null,
  reset: noop,
  editing: false,
  setEditing: noop,
  board: null,
  layoutKey: "site",
  displayPathname: "/",
  transition: "idle",
});

/** Save status is its own context: it changes twice per save and no board reads it. */
const SaveStatusContext = createContext<SaveStatusValue>({ saveState: "idle", saveError: null });

/**
 * The one layout document.
 *
 * The whole page is a single container, so there is one tree to load, one to write, and one set of
 * settings for all of it — rather than five boards each holding a slice and each able to overwrite
 * the others on save.
 */
export function PageLayoutProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { pathname } = useRouter();
  const route = resolveRoute(pathname);
  const routeKind = route?.kind;
  const routeHandle = routeKind === "board" || routeKind === "profile" ? route.handle : null;
  const routeSlug = routeKind === "board" ? route.slug : null;
  const routeId = routeKind === "board-edit" ? route.id : null;
  const sitePage: SitePageName | null =
    routeKind === "landing" ? route.tab : routeKind === "about" ? "about" : null;

  const [root, setRootState] = useState<Widget>(defaultRoot);
  const [page, setPageState] = useState<PageSettings>(() => readPage(undefined));
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragging, setDragging] = useState<WidgetDrag | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const previewId = useRef<string | null>(null);
  const currentKey = useRef("");
  const [layoutKey, setLayoutKey] = useState("site");
  const [displayPathname, setDisplayPathname] = useState(pathname);
  const [transition, setTransition] = useState<"idle" | "leaving" | "entering">("idle");
  const [board, setBoard] = useState<BoardSummary | null>(null);

  useEffect(() => {
    let active = true;
    let enterTimer = 0;

    const target =
      routeKind === "board"
        ? `board:${routeHandle}:${routeSlug}`
        : routeKind === "profile"
          ? `profile:${routeHandle}`
          : routeKind === "board-edit"
            ? `edit:${routeId}`
            : sitePage
                ? `site:${sitePage}`
                : "site";

    const load = async (): Promise<{ layout: ProfileLayout | null; board: BoardSummary | null }> => {
      if (routeKind === "board" && routeHandle && routeSlug) {
        const next = await fetchBoard(routeHandle, routeSlug);
        return { layout: next.layout, board: next };
      }
      if (routeKind === "profile" && routeHandle) {
        const next = await fetchPrimaryBoard(routeHandle);
        return { layout: next.layout, board: next };
      }
      if (routeKind === "board-edit" && routeId) {
        const next = await fetchMyBoard(routeId);
        return { layout: next.layout, board: next };
      }
      const standalone = sitePage ? await fetchSitePage(sitePage) : await fetchSiteDefaults();
      return { layout: standalone.layout, board: null };
    };

    const changing = currentKey.current !== "" && currentKey.current !== target;
    if (changing) setTransition("leaving");

    void load()
      .then(async (loaded) => {
        if (changing) await new Promise((resolve) => window.setTimeout(resolve, 170));
        if (!active) return;

        const nextLayout = loaded.layout;
        setRootState(readLayout(nextLayout));
        setPageState(readPage(nextLayout?.page));
        setBoard(loaded.board);
        setDirty(false);
        setSaveError(null);
        currentKey.current = target;
        // Content reads this staged route, not the URL directly. The outgoing page therefore stays
        // painted for the entire leave animation and the incoming page appears with its own layout
        // at the start of enter.
        setDisplayPathname(pathname);
        setLayoutKey(target);
        setTransition("entering");
        enterTimer = window.setTimeout(() => setTransition("idle"), 480);
      })
      .catch((error: unknown) => {
        if (!active) return;
        // A failed experience does not strand the app on the outgoing board. Its shipped default is
        // a complete, navigable board and the error remains visible to an editor through save state.
        setRootState(defaultRoot());
        setPageState(readPage(undefined));
        setBoard(null);
        setSaveError(error instanceof Error ? error.message : String(error));
        currentKey.current = target;
        setDisplayPathname(pathname);
        setLayoutKey(target);
        setTransition("entering");
        enterTimer = window.setTimeout(() => setTransition("idle"), 480);
      });

    return () => {
      active = false;
      window.clearTimeout(enterTimer);
    };
  }, [routeKind, routeHandle, routeSlug, routeId, sitePage, pathname, auth.isSignedIn]);

  useEffect(() => {
    if (!dirty || !auth.isSignedIn) return;

    const timer = window.setTimeout(() => {
      setSaveState("saving");
      const save = board
        ? updateBoard(board.id, { layout: writeLayout(root, page) })
        : Promise.reject(new Error("This layout is not an editable board."));

      save
        .then(() => {
          setSaveState("saved");
          setSaveError(null);
        })
        .catch((err: unknown) => {
          setSaveState("idle");
          setSaveError(err instanceof Error ? err.message : String(err));
        });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [dirty, root, page, board, auth.isSignedIn]);

  const setRoot = useCallback((next: Widget | ((prev: Widget) => Widget)) => {
    setRootState((current) => (typeof next === "function" ? next(current) : next));
    setDirty(true);
  }, []);

  const replaceWidget = useCallback((id: string, next: Widget) => {
    setRootState((current) => updateInTree(current, id, () => next));
    setDirty(true);
  }, []);

  const moveWidgetToContainer = useCallback(
    (id: string, containerId: string, targetCell?: { col?: number; row?: number }) => {
      setRootState((current) => moveIntoContainer(current, id, containerId, targetCell));
      setDirty(true);
      setDragging(null);
    },
    [],
  );

  const insertPreview = useCallback((id: string, kind: WidgetKind, containerId: string) => {
    previewId.current = id;
    setRootState((current) => {
      // dragover fires continuously; returning a new tree each time would re-render the page.
      if (treeHasChild(current, containerId, id)) return current;

      const without = removeFromTree(current, id);
      const next = insertInTree(without, containerId, makeWidget(kind, { id }));
      return next === without && without === current ? current : next;
    });
  }, []);

  const finalizePreview = useCallback(() => {
    previewId.current = null;
    setDirty(true);
    setDragging(null);
  }, []);

  const cancelPreview = useCallback(() => {
    const id = previewId.current;
    previewId.current = null;
    if (id) setRootState((current) => removeFromTree(current, id));
    setDragging(null);
  }, []);

  const setPage = useCallback((next: PageSettings) => {
    setPageState((current) => ({ ...current, ...next }));
    setDirty(true);
  }, []);

  const reset = useCallback(() => {
    setRootState(defaultRoot());
    setPageState(readPage(undefined));
    setDirty(true);
  }, []);

  const announceDrag = useCallback((drag: WidgetDrag | null) => setDragging(drag), []);

  const [inspectingId, setInspectingId] = useState<string | null>(null);
  const [inspectorAnchor, setInspectorAnchor] = useState<HTMLElement | null>(null);

  const inspect = useCallback((id: string | null, anchor?: HTMLElement | null) => {
    setInspectorAnchor(anchor ?? null);
    setInspectingId(id);
  }, []);

  const layout = useMemo(
    () => ({
      root,
      setRoot,
      replaceWidget,
      moveWidgetToContainer,
      page,
      setPage,
      dragging,
      announceDrag,
      insertPreview,
      cancelPreview,
      finalizePreview,
      inspectingId,
      inspect,
      inspectorAnchor,
      reset,
      editing,
      setEditing,
      board,
      layoutKey,
      displayPathname,
      transition,
    }),
    [
      root,
      setRoot,
      replaceWidget,
      moveWidgetToContainer,
      page,
      setPage,
      dragging,
      announceDrag,
      insertPreview,
      cancelPreview,
      finalizePreview,
      inspectingId,
      inspect,
      inspectorAnchor,
      reset,
      editing,
      board,
      layoutKey,
      displayPathname,
      transition,
    ],
  );

  const status = useMemo(() => ({ saveState, saveError }), [saveState, saveError]);

  return (
    <PageLayoutContext.Provider value={layout}>
      <SaveStatusContext.Provider value={status}>{children}</SaveStatusContext.Provider>
    </PageLayoutContext.Provider>
  );
}

export const usePageLayout = (): PageLayoutValue => useContext(PageLayoutContext);
export const useSaveStatus = (): SaveStatusValue => useContext(SaveStatusContext);
