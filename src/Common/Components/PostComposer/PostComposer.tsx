import { useRef, useState, type FormEvent } from "react";
import { createPost } from "../../../Services/ContentApiService";
import { useAuth } from "../../../Services/AuthProvider";
import type { PostSummary } from "../../../Types/TypeRegistry";

export interface PostComposerProps {
  isJapanese: boolean;
  onPosted: (post: PostSummary) => void;
}

const TEXT = {
  en: {
    placeholder: "What's happening?",
    post: "Post",
    posting: "Posting…",
    signIn: "Sign in to post",
    bold: "Bold",
    italic: "Italic",
    link: "AppLink",
    remaining: (n: number) => `${n} left`,
  },
  ja: {
    placeholder: "いま何してる？",
    post: "投稿",
    posting: "投稿中…",
    signIn: "投稿するにはサインイン",
    bold: "太字",
    italic: "斜体",
    link: "リンク",
    remaining: (n: number) => `残り ${n}`,
  },
} as const;

/** Soft limit: long-form belongs in an article, and a feed of essays is not a feed. */
const MAX_LENGTH = 2000;

/**
 * The composer at the top of the feed. Deliberately small — a textarea, three formatting buttons,
 * and a submit — because the full editor exists for articles and a quick post should not feel like
 * opening one.
 */
export default function PostComposer({ isJapanese, onPosted }: PostComposerProps) {
  const auth = useAuth();
  const text = isJapanese ? TEXT.ja : TEXT.en;
  const field = useRef<HTMLTextAreaElement>(null);

  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auth.isSignedIn) {
    return (
      <div className="composer composer-signed-out">
        <button type="button" className="editor-btn editor-btn-primary" onClick={() => auth.redirectToLogin()}>
          {text.signIn}
        </button>
      </div>
    );
  }

  /** Wraps the selection, or inserts the markers at the caret when nothing is selected. */
  const wrap = (before: string, after: string) => {
    const input = field.current;
    if (!input) return;

    const { selectionStart: start, selectionEnd: end } = input;
    const selected = body.slice(start, end);
    setBody(`${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`);

    // The caret goes back inside the markers rather than after them, so typing continues where the
    // author expects it to.
    queueMicrotask(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim() || posting) return;

    setPosting(true);
    setError(null);

    try {
      const post = await createPost({ body: body.trim() });
      setBody("");
      onPosted(post);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  };

  const remaining = MAX_LENGTH - body.length;

  return (
    <form className="composer" onSubmit={(e) => void submit(e)}>
      <textarea
        ref={field}
        className="composer-input"
        value={body}
        maxLength={MAX_LENGTH}
        rows={3}
        placeholder={text.placeholder}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="composer-actions">
        <div className="composer-tools">
          <button type="button" className="toolbar-btn toolbar-btn-bold" onClick={() => wrap("**", "**")} title={text.bold}>
            B
          </button>
          <button type="button" className="toolbar-btn toolbar-btn-italic" onClick={() => wrap("_", "_")} title={text.italic}>
            I
          </button>
          <button type="button" className="toolbar-btn" onClick={() => wrap("[", "](https://)")} title={text.link}>
            🔗
          </button>
        </div>

        <div className="composer-submit">
          {/* Shown only once it is close enough to matter, so the count is not permanent noise. */}
          {remaining < 200 && <span className="composer-count">{text.remaining(remaining)}</span>}
          <button type="submit" className="editor-btn editor-btn-primary" disabled={posting || !body.trim()}>
            {posting ? text.posting : text.post}
          </button>
        </div>
      </div>

      {error !== null && <p className="composer-error">{error}</p>}
    </form>
  );
}
