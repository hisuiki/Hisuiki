import { getSiteHandle } from '../../../Services/AppRouter';
import { useCallback, useEffect, useRef, useState } from "react";
import Skeleton from "../Skeleton/Skeleton";
import InfoBubble from "../InfoBubble/InfoBubble";
import MdContentRenderer from "../MdContentRenderer/MdContentRenderer";
import { fetchRawPage, previewMarkdown, savePage } from "../../../Services/ContentApiService";
import { useAuth } from "../../../Services/AuthProvider";
import { loadMonaco, type MonacoEditor, type MonacoRange } from "../../../Services/MonacoService";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NUMBERED_LIST_PREFIX = /^\d+\.\s+/;

type EditorState = "loading" | "editing" | "submitting" | "success";

export interface PageEditorProps {
  slug?: string;
  isHome?: boolean;
  isJapanese?: boolean;
  isNewFile?: boolean;
  onClose: () => void;
}

/**
 * The page editor. Saving writes the markdown straight to the bucket — there is no pull request in
 * the loop any more — but the message field stayed: it is stored on the object and is what labels
 * the revision in the page history, so an edit is still a described change rather than a silent
 * overwrite.
 */
export default function PageEditor({
  slug = "",
  isHome = false,
  isJapanese = false,
  isNewFile = false,
  onClose,
}: PageEditorProps) {
  const auth = useAuth();

  const [state, setState] = useState<EditorState>("loading");
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const [newSlug, setNewSlug] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [description, setDescription] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const rawContent = useRef("");
  const monacoHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditor | null>(null);

  const effectivePath = isNewFile ? `posts/${slug}${isJapanese ? ".ja" : ""}.md` : slug;
  const isSlugValid = SLUG_PATTERN.test(slug);
  const canSave =
    state === "editing" && !loadFailed && commitMessage.trim() !== "" && (!isNewFile || isSlugValid);

  // A new article is stamped with whoever is signed in, not a fixed site-owner name.
  const authorDisplayName = useCallback((): string => {
    const user = auth.user;
    if (!user) return "";
    return user.name || user.email.split("@")[0] || "";
  }, [auth.user]);

  // The exact stored bytes, so the diff is generated against what the patch will apply to.
  useEffect(() => {
    let active = true;

    const load = async () => {
      if (isNewFile) {
        const author = authorDisplayName().replace(/"/g, '\\"');
        rawContent.current = `---\ntitle: ""\ndescription: ""\nauthor: "${author}"\n---\n\n`;
      } else {
        try {
          const raw = await fetchRawPage(slug, isHome, getSiteHandle() || undefined);
          rawContent.current = raw.rawContent ?? "";
        } catch (err: unknown) {
          if (!active) return;
          setError(`Could not load page content (${err instanceof Error ? err.message : String(err)}).`);
          setLoadFailed(true);
        }
      }
      if (active) setState("editing");
    };

    void load();
    return () => {
      active = false;
    };
    // Once per editor session: reloading the seed would discard whatever was already typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceRange = (range: MonacoRange, text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.executeEdits("toolbar", [{ range, text }]);
    editor.focus();
  };

  /**
   * Wraps the selection with prefix/suffix, or strips them when they are already there — inside or
   * outside the selection — so the action toggles. Inserts placeholder text when nothing is
   * selected.
   */
  const wrapSelection = (prefix: string, suffix: string, placeholder: string) => {
    const editor = editorRef.current;
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    if (!editor || !selection || !model) return;

    const hasSelection =
      selection.startLineNumber !== selection.endLineNumber ||
      selection.startColumn !== selection.endColumn;

    if (!hasSelection) {
      replaceRange(selection, `${prefix}${placeholder}${suffix}`);
      return;
    }

    const selected = model.getValueInRange(selection);

    if (
      selected.length >= prefix.length + suffix.length &&
      selected.startsWith(prefix) &&
      selected.endsWith(suffix)
    ) {
      replaceRange(selection, selected.slice(prefix.length, selected.length - suffix.length));
      return;
    }

    const before =
      prefix.length > 0 && selection.startColumn - prefix.length >= 1
        ? model.getValueInRange({
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn - prefix.length,
            endLineNumber: selection.startLineNumber,
            endColumn: selection.startColumn,
          })
        : "";

    const after =
      suffix.length > 0
        ? model.getValueInRange({
            startLineNumber: selection.endLineNumber,
            startColumn: selection.endColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn + suffix.length,
          })
        : "";

    if (before === prefix && after === suffix) {
      replaceRange(
        {
          startLineNumber: selection.startLineNumber,
          startColumn: selection.startColumn - prefix.length,
          endLineNumber: selection.endLineNumber,
          endColumn: selection.endColumn + suffix.length,
        },
        selected
      );
      return;
    }

    replaceRange(selection, `${prefix}${selected}${suffix}`);
  };

  /**
   * Prefixes every touched line, numbering them for ordered lists, and strips the prefix instead
   * when every line already carries it.
   */
  const prefixLines = (marker: string, numbered = false) => {
    const editor = editorRef.current;
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    if (!editor || !selection || !model) return;

    const range: MonacoRange = {
      startLineNumber: selection.startLineNumber,
      startColumn: 1,
      endLineNumber: selection.endLineNumber,
      // Monaco clamps to the real line end; int32 max, since its position model is 32-bit.
      endColumn: 2147483647,
    };

    const lines = model.getValueInRange(range).split("\n");

    let newLines: string[];
    if (numbered) {
      const alreadyNumbered = lines.every((l) => NUMBERED_LIST_PREFIX.test(l));
      newLines = alreadyNumbered
        ? lines.map((l) => l.replace(NUMBERED_LIST_PREFIX, ""))
        : lines.map((l, i) => `${i + 1}. ${l}`);
    } else {
      const alreadyMarked = lines.every((l) => l.startsWith(marker));
      newLines = alreadyMarked
        ? lines.map((l) => l.slice(marker.length))
        : lines.map((l) => `${marker}${l}`);
    }

    replaceRange(range, newLines.join("\n"));
  };
  // Created imperatively once the host div exists, and torn down with the editor.
  useEffect(() => {
    if (state !== "editing" || loadFailed) return;

    let disposed = false;

    void loadMonaco()
      .then((monaco) => {
        const host = monacoHost.current;
        if (disposed || !host || editorRef.current) return;

        const editor = monaco.editor.create(host, {
          value: rawContent.current,
          language: "markdown",
          theme: "vs-dark",
          wordWrap: "on",
          automaticLayout: true,
          minimap: { enabled: false },
        });
        editorRef.current = editor;

        // The toolbar actions, on their usual shortcuts.
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => wrapSelection("**", "**", "bold text"));
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => wrapSelection("*", "*", "italic text"));
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => wrapSelection("[", "](https://)", "link text"));
      })
      .catch((err: unknown) => {
        if (disposed) return;
        setError(`Could not load the editor (${err instanceof Error ? err.message : String(err)}).`);
        setLoadFailed(true);
      });

    return () => {
      disposed = true;
      editorRef.current?.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loadFailed]);


  const refreshPreview = async () => {
    setPreviewHtml(null);
    const markdown = editorRef.current?.getValue() ?? rawContent.current;

    try {
      setPreviewHtml(await previewMarkdown(markdown));
    } catch {
      // Never parse untrusted Markdown directly in the browser: Marked deliberately preserves raw
      // HTML, and this value is rendered with dangerouslySetInnerHTML. The API owns sanitization.
      setPreviewHtml('<p class="editor-status">Preview unavailable.</p>');
    }
  };

  const selectTab = (tab: "write" | "preview") => {
    setActiveTab(tab);
    if (tab === "preview") void refreshPreview();
  };

  const save = async () => {
    if (!canSave || !editorRef.current) return;

    setState("submitting");
    setError(null);

    try {
      await savePage({
        path: effectivePath,
        content: editorRef.current.getValue(),
        commitMessage: commitMessage.trim(),
        description: description.trim(),
      });
      setState("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setState("editing");
    }
  };

  if (state === "loading") {
    return (
      <div className="page-editor">
        <div className="editor-skeleton" aria-hidden="true">
          <div className="editor-skeleton-tabs">
            <Skeleton className="skeleton-tab" width="70px" />
            <Skeleton className="skeleton-tab" width="80px" />
          </div>
          <Skeleton className="skeleton-editor-block" width="100%" />
          <div className="editor-skeleton-fields">
            <Skeleton className="skeleton-field" width="100%" />
            <Skeleton className="skeleton-field-lg" width="100%" />
          </div>
          <div className="editor-skeleton-actions">
            <Skeleton className="skeleton-action" width="90px" />
            <Skeleton className="skeleton-action" width="160px" />
          </div>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="page-editor">
        <div className="editor-success">
          <p>
            Saved. The page is live, and this edit is now the newest entry in its history.
          </p>
          <button type="button" className="editor-btn editor-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-editor">
      {isNewFile && (
        <div className="editor-slug-field">
          <label htmlFor="new-article-slug">URL slug</label>
          <input
            id="new-article-slug"
            className="editor-slug-input"
            placeholder="my-first-post"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            maxLength={80}
          />
          <span className="editor-slug-preview">→ {effectivePath}</span>
          {newSlug !== "" && !isSlugValid && (
            <span className="editor-slug-error">
              Lowercase letters, numbers and hyphens only (e.g. &quot;my-first-post&quot;).
            </span>
          )}
        </div>
      )}

      <div className="editor-tabs">
        <button
          type="button"
          className={`editor-tab ${activeTab === "write" ? "is-active" : ""}`.trim()}
          onClick={() => selectTab("write")}
        >
          Write
        </button>
        <button
          type="button"
          className={`editor-tab ${activeTab === "preview" ? "is-active" : ""}`.trim()}
          onClick={() => selectTab("preview")}
        >
          Preview
        </button>
      </div>

      {/* The Write pane is hidden rather than unmounted: tearing Monaco down and rebuilding it on
          every tab switch would drop undo history and cursor position. */}
      <div className="editor-pane" style={{ display: activeTab === "write" ? undefined : "none" }}>
        <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" className="toolbar-btn toolbar-btn-bold" title="Bold" onClick={() => wrapSelection("**", "**", "bold text")}>B</button>
          <button type="button" className="toolbar-btn toolbar-btn-italic" title="Italic" onClick={() => wrapSelection("*", "*", "italic text")}>I</button>
          <button type="button" className="toolbar-btn" title="Heading" onClick={() => prefixLines("## ")}>H</button>
          <span className="toolbar-sep" />
          <button type="button" className="toolbar-btn" title="AppLink" onClick={() => wrapSelection("[", "](https://)", "link text")}>AppLink</button>
          <button type="button" className="toolbar-btn" title="Image" onClick={() => wrapSelection("![", "](https://)", "alt text")}>Image</button>
          <button type="button" className="toolbar-btn toolbar-btn-code" title="Inline code" onClick={() => wrapSelection("`", "`", "code")}>Code</button>
          <span className="toolbar-sep" />
          <button type="button" className="toolbar-btn" title="Quote" onClick={() => prefixLines("> ")}>Quote</button>
          <button type="button" className="toolbar-btn" title="Bulleted list" onClick={() => prefixLines("- ")}>List</button>
          <button type="button" className="toolbar-btn" title="Numbered list" onClick={() => prefixLines("", true)}>1. List</button>
        </div>
        <div id="page-editor-monaco" className="page-editor-monaco" ref={monacoHost} />
      </div>

      {activeTab === "preview" && (
        <div className="editor-pane editor-preview">
          {previewHtml === null ? (
            <div aria-hidden="true">
              <Skeleton className="skeleton-title" width="55%" />
              <Skeleton className="skeleton-line" width="100%" />
              <Skeleton className="skeleton-line" width="92%" />
              <Skeleton className="skeleton-line" width="97%" />
              <Skeleton className="skeleton-line" width="70%" />
            </div>
          ) : (
            <MdContentRenderer html={previewHtml} isJapanese={isJapanese} />
          )}
        </div>
      )}

      <div className="editor-fields">
        <input
          className="editor-commit-input"
          placeholder="Commit message (required)"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          maxLength={120}
        />
        <textarea
          className="editor-description-input"
          placeholder="Description (optional)"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {error !== null && <InfoBubble title={`Could not save: ${error}`} />}

      <div className="editor-actions">
        <button
          type="button"
          className="editor-btn editor-btn-cancel"
          onClick={onClose}
          disabled={state === "submitting"}
        >
          Cancel
        </button>
        <button type="button" className="editor-btn editor-btn-primary" onClick={() => void save()} disabled={!canSave}>
          {state === "submitting" ? "Saving…" : isNewFile ? "Publish" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
