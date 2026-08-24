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
} from "./layout";
import { fetchMyProfile, updateMyProfile } from "./profile";
import type { PageSettings, Widget, WidgetKind } from "../Types";
import type { WidgetDrag } from "./widgetDrag";
import { useAuth } from "./auth";

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

  const [root, setRootState] = useState<Widget>(defaultRoot);
  const [page, setPageState] = useState<PageSettings>(() => readPage(undefined));
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dragging, setDragging] = useState<WidgetDrag | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const previewId = useRef<string | null>(null);

  useEffect(() => {
    if (!auth.isSignedIn) return;

    let active = true;
    fetchMyProfile()
      .then((profile) => {
        // A layout arriving after the first edit would throw that edit away.
        if (!active || dirty) return;
        setRootState(readLayout(profile.layout));
        setPageState(readPage(profile.layout?.page));
      })
      .catch(() => {
        // The default page is a working page.
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isSignedIn]);

  useEffect(() => {
    if (!dirty || !auth.isSignedIn) return;

    const timer = window.setTimeout(() => {
      setSaveState("saving");
      updateMyProfile({ layout: writeLayout(root, page) })
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
  }, [dirty, root, page, auth.isSignedIn]);

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
