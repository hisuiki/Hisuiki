import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import { useAuth } from "../../Services/AuthProvider";
import { boardHref, AppLink } from "../../Services/AppRouter";
import { createBoard, deleteBoard, fetchMyBoards, updateBoard } from "../../Services/BoardService";
import type { BoardSummary } from "../../Types/TypeRegistry";

const TEXT = {
  en: {
    title: "Your boards",
    lead: "Create experiences, publish them, and choose which one becomes your profile.",
    newBoard: "New board",
    name: "Title",
    slug: "Address",
    description: "Description",
    create: "Create board",
    creating: "Creating…",
    edit: "Edit layout",
    view: "View",
    save: "Save details",
    publish: "Publish",
    unpublish: "Unpublish",
    primary: "Profile board",
    makePrimary: "Make profile board",
    draft: "Draft",
    published: "Published",
    remove: "Delete",
    removeConfirm: "Delete this board and its widget layout? This cannot be undone.",
    empty: "You do not have a board yet. Make the first one below.",
    handle: "Set a profile handle in Settings before sharing a board.",
  },
  ja: {
    title: "ボード",
    lead: "体験を作成・公開し、プロフィールに表示するボードを選べます。",
    newBoard: "新しいボード",
    name: "タイトル",
    slug: "アドレス",
    description: "説明",
    create: "ボードを作成",
    creating: "作成中…",
    edit: "レイアウトを編集",
    view: "表示",
    save: "詳細を保存",
    publish: "公開",
    unpublish: "非公開",
    primary: "プロフィールボード",
    makePrimary: "プロフィールボードにする",
    draft: "下書き",
    published: "公開中",
    remove: "削除",
    removeConfirm: "このボードとウィジェットのレイアウトを削除しますか？元に戻せません。",
    empty: "ボードはまだありません。最初のボードを作成しましょう。",
    handle: "共有する前に設定でプロフィールハンドルを設定してください。",
  },
} as const;

function BoardRow({
  board,
  text,
  onChanged,
  onRemoved,
}: {
  board: BoardSummary;
  text: typeof TEXT.en | typeof TEXT.ja;
  onChanged: (board: BoardSummary) => void;
  onRemoved: (id: string) => void;
}) {
  const [title, setTitle] = useState(board.title);
  const [slug, setSlug] = useState(board.slug);
  const [description, setDescription] = useState(board.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handle = board.owner.profile?.handle;

  const change = async (data: Parameters<typeof updateBoard>[1]) => {
    setBusy(true);
    setError(null);
    try {
      const next = await updateBoard(board.id, data);
      onChanged(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(text.removeConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteBoard(board.id);
      onRemoved(board.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <article className="board-manager-card">
      <header className="board-manager-card-head">
        <div>
          <h2>{board.title}</h2>
          <span className="board-state">{board.publishedAt ? text.published : text.draft}</span>
          {board.isPrimary && <span className="board-state is-primary">{text.primary}</span>}
        </div>
        <div className="board-manager-actions">
          {handle && board.publishedAt && <AppLink href={boardHref(handle, board.slug)}>{text.view}</AppLink>}
          <AppLink href={`/boards/${board.id}/edit`}>{text.edit}</AppLink>
        </div>
      </header>

      {error && <InfoBubble title={error} className="md-component-danger" />}

      <div className="board-manager-fields">
        <label className="photo-field">
          <span>{text.name}</span>
          <input value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="photo-field">
          <span>{text.slug}</span>
          <input
            value={slug}
            maxLength={50}
            pattern="^[a-z0-9][a-z0-9\-]*$"
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
          />
        </label>
        <label className="photo-field is-wide">
          <span>{text.description}</span>
          <textarea value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} />
        </label>
      </div>

      {!handle && <p className="board-manager-hint">{text.handle}</p>}

      <footer className="board-manager-actions">
        <button type="button" disabled={busy} onClick={() => void change({ title, slug, description })}>
          {text.save}
        </button>
        <button type="button" disabled={busy} onClick={() => void change({ published: !board.publishedAt })}>
          {board.publishedAt ? text.unpublish : text.publish}
        </button>
        {!board.isPrimary && (
          <button type="button" disabled={busy} onClick={() => void change({ isPrimary: true })}>
            {text.makePrimary}
          </button>
        )}
        <button type="button" className="is-danger" disabled={busy} onClick={() => void remove()}>
          {text.remove}
        </button>
      </footer>
    </article>
  );
}

export default function BoardManager() {
  const auth = useAuth();
  const { i18n } = useTranslation();
  const text = i18n.language === "ja" ? TEXT.ja : TEXT.en;
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!auth.initializing && !auth.isSignedIn) auth.redirectToLogin();
  }, [auth]);

  useEffect(() => {
    if (!auth.isSignedIn) return;
    let active = true;
    fetchMyBoards()
      .then((next) => active && setBoards(next))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => { active = false; };
  }, [auth.isSignedIn]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const board = await createBoard({ title, slug, description });
      setBoards((current) => [board, ...(current ?? [])]);
      setTitle("");
      setSlug("");
      setDescription("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="file-content board-manager" data-phase="ready">
      <h1>{text.title}</h1>
      <p className="board-manager-lead">{text.lead}</p>
      {error && <InfoBubble title={error} className="md-component-danger" />}

      {boards === null ? (
        <Skeleton width="100%" height="220px" />
      ) : boards.length === 0 ? (
        <p>{text.empty}</p>
      ) : (
        <div className="board-manager-list">
          {boards.map((board) => (
            <BoardRow
              key={board.id}
              board={board}
              text={text}
              onChanged={(next) => setBoards((current) => (current ?? []).map((item) =>
                item.id === next.id ? next : next.isPrimary ? { ...item, isPrimary: false } : item,
              ))}
              onRemoved={(id) => setBoards((current) => (current ?? []).filter((item) => item.id !== id))}
            />
          ))}
        </div>
      )}

      <form className="board-create" onSubmit={(event) => void create(event)}>
        <h2>{text.newBoard}</h2>
        <div className="board-manager-fields">
          <label className="photo-field">
            <span>{text.name}</span>
            <input required value={title} maxLength={100} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="photo-field">
            <span>{text.slug}</span>
            <input
              required
              value={slug}
              maxLength={50}
              pattern="^[a-z0-9][a-z0-9\-]*$"
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
            />
          </label>
          <label className="photo-field is-wide">
            <span>{text.description}</span>
            <textarea value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
        <button type="submit" className="editor-btn editor-btn-primary" disabled={creating}>
          {creating ? text.creating : text.create}
        </button>
      </form>
    </div>
  );
}
