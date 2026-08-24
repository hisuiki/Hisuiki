import { useEffect, useState, type FormEvent } from "react";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import { CommentIcon, HeartIcon } from "./PhotoGallery";
import { AppLink, useRouter } from "../../Services/AppRouter";
import { useAuth } from "../../Services/AuthProvider";
import {
  addComment,
  deleteComment,
  deletePhoto,
  fetchPhoto,
  fetchPhotos,
  formatPhotoDate,
  photoRoute,
  toggleLike,
  updatePhoto,
} from "../../Services/PhotoService";
import type { PhotoDetail as PhotoDetailData, PhotoPost } from "../../Types/TypeRegistry";

export interface PhotoDetailProps {
  id: string;
  isJapanese: boolean;
}

const TEXT = {
  en: {
    back: "All photos",
    like: "Like",
    liked: "Liked",
    comments: "Comments",
    noComments: "No comments yet.",
    commentPlaceholder: "Add a comment…",
    post: "Post",
    signInToComment: "Sign in with GitHub to comment.",
    edit: "Edit",
    remove: "Delete",
    save: "Save",
    cancel: "Cancel",
    confirmDelete: "Delete this photo for good?",
    caption: "Caption",
    alt: "Alt text",
    altHint: "Describes the photo for screen readers.",
    tags: "Tags",
    tagsHint: "Comma separated.",
    notFound: "That photo does not exist.",
    edited: "edited",
  },
  ja: {
    back: "すべての写真",
    like: "いいね",
    liked: "いいね済み",
    comments: "コメント",
    noComments: "コメントはまだありません。",
    commentPlaceholder: "コメントを追加…",
    post: "送信",
    signInToComment: "コメントするには GitHub でサインインしてください。",
    edit: "編集",
    remove: "削除",
    save: "保存",
    cancel: "キャンセル",
    confirmDelete: "この写真を完全に削除しますか？",
    caption: "キャプション",
    alt: "代替テキスト",
    altHint: "スクリーンリーダー向けの説明です。",
    tags: "タグ",
    tagsHint: "カンマ区切り。",
    notFound: "その写真は存在しません。",
    edited: "編集済み",
  },
} as const;

const parseTags = (value: string): string[] =>
  value
    .split(",")
    .map((tag) => tag.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean);

/** One photo, its caption, and the like and comment activity on it. */
export default function PhotoDetail({ id, isJapanese }: PhotoDetailProps) {
  const auth = useAuth();
  const { navigate } = useRouter();
  const text = isJapanese ? TEXT.ja : TEXT.en;

  const [photo, setPhoto] = useState<PhotoDetailData | null>(null);
  const [neighbours, setNeighbours] = useState<PhotoPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({ caption: "", alt: "", tags: "" });
  const [saving, setSaving] = useState(false);

  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    let active = true;

    fetchPhoto(id)
      .then((loaded) => {
        if (!active) return;
        setPhoto(loaded);
        setDraft({ caption: loaded.caption, alt: loaded.alt, tags: loaded.tags.join(", ") });
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      active = false;
    };
  }, [id]);

  // Only for the prev/next links, so a failure here leaves the photo itself perfectly usable.
  useEffect(() => {
    let active = true;

    fetchPhotos()
      .then((all) => {
        if (active) setNeighbours(all);
      })
      .catch(() => {
        if (active) setNeighbours([]);
      });

    return () => {
      active = false;
    };
  }, []);

  const index = neighbours.findIndex((post) => post.id === id);
  // The gallery is newest first, so the *previous* photo in reading order is the newer neighbour.
  const newer = index > 0 ? neighbours[index - 1]! : null;
  const older = index >= 0 && index < neighbours.length - 1 ? neighbours[index + 1]! : null;

  const onLike = async () => {
    if (!auth.isSignedIn) {
      auth.redirectToLogin();
      return;
    }
    if (!photo) return;

    // Optimistic: the round trip is a write to the bucket, and a like that lags behind the click
    // reads as a broken button.
    const previous = { likeCount: photo.likeCount, likedByViewer: photo.likedByViewer };
    setPhoto({
      ...photo,
      likedByViewer: !previous.likedByViewer,
      likeCount: previous.likeCount + (previous.likedByViewer ? -1 : 1),
    });

    try {
      const result = await toggleLike(id);
      setPhoto((current) => (current ? { ...current, ...result } : current));
    } catch (err: unknown) {
      setPhoto((current) => (current ? { ...current, ...previous } : current));
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSubmitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!photo || !commentBody.trim()) return;

    setPostingComment(true);
    setActionError(null);

    try {
      const { comment, commentCount } = await addComment(id, commentBody.trim());
      setPhoto((current) =>
        current ? { ...current, comments: [...current.comments, comment], commentCount } : current
      );
      setCommentBody("");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setPostingComment(false);
    }
  };

  const onDeleteComment = async (commentId: string) => {
    setActionError(null);

    try {
      const { commentCount } = await deleteComment(id, commentId);
      setPhoto((current) =>
        current
          ? {
              ...current,
              comments: current.comments.filter((comment) => comment.id !== commentId),
              commentCount,
            }
          : current
      );
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const onSave = async () => {
    setSaving(true);
    setActionError(null);

    try {
      const updated = await updatePhoto(id, {
        caption: draft.caption,
        alt: draft.alt,
        tags: parseTags(draft.tags),
      });
      setPhoto((current) => (current ? { ...current, ...updated } : current));
      setIsEditing(false);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm(text.confirmDelete)) return;
    setActionError(null);

    try {
      await deletePhoto(id);
      navigate(isJapanese ? "/photos/ja" : "/photos");
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  if (error !== null) {
    return <InfoBubble title={error} className="md-component-danger" />;
  }

  if (photo === null) {
    return (
      <div className="photo-detail" aria-hidden="true">
        <Skeleton className="photo-detail-skeleton" />
        <Skeleton className="skeleton-meta" width="180px" />
        <Skeleton className="skeleton-line" width="90%" />
        <Skeleton className="skeleton-line" width="70%" />
      </div>
    );
  }

  const authorName = photo.author.name;

  return (
    <div className="photo-detail">
      <figure className="photo-detail-figure">
        <img
          className="photo-detail-image"
          src={photo.fullUrl}
          alt={photo.alt}
          // Reserving the real box stops the caption below from jumping as the photo decodes.
          width={photo.width || undefined}
          height={photo.height || undefined}
        />
      </figure>

      <div className="photo-detail-byline">
        {photo.author.image && (
          <img className="photo-author-avatar" src={photo.author.image} alt="" width={32} height={32} />
        )}
        <div className="photo-byline-text">
          <span className="photo-author-name">{authorName}</span>
          <span className="photo-posted-at">
            {formatPhotoDate(photo.postedAt, isJapanese)}
            {photo.editedAt !== photo.postedAt && ` · ${text.edited}`}
          </span>
        </div>

        {photo.editableByViewer && !isEditing && (
          <div className="photo-owner-actions">
            <button type="button" className="github-edit-btn" onClick={() => setIsEditing(true)}>
              {text.edit}
            </button>
            <button type="button" className="github-edit-btn photo-delete-btn" onClick={() => void onDelete()}>
              {text.remove}
            </button>
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="photo-edit-form">
          <label className="photo-field">
            <span>{text.caption}</span>
            <textarea
              className="editor-description-input"
              rows={3}
              value={draft.caption}
              onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
            />
          </label>

          <label className="photo-field">
            <span>{text.alt}</span>
            <input
              className="editor-commit-input"
              value={draft.alt}
              onChange={(e) => setDraft({ ...draft, alt: e.target.value })}
            />
            <small className="photo-field-hint">{text.altHint}</small>
          </label>

          <label className="photo-field">
            <span>{text.tags}</span>
            <input
              className="editor-commit-input"
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
            />
            <small className="photo-field-hint">{text.tagsHint}</small>
          </label>

          <div className="editor-actions">
            <button
              type="button"
              className="editor-btn editor-btn-cancel"
              onClick={() => setIsEditing(false)}
              disabled={saving}
            >
              {text.cancel}
            </button>
            <button
              type="button"
              className="editor-btn editor-btn-primary"
              onClick={() => void onSave()}
              disabled={saving}
            >
              {text.save}
            </button>
          </div>
        </div>
      ) : (
        <>
          {photo.caption && <p className="photo-caption">{photo.caption}</p>}
          {photo.tags.length > 0 && (
            <p className="photo-tags">
              {photo.tags.map((tag) => (
                <span className="photo-tag" key={tag}>
                  #{tag}
                </span>
              ))}
            </p>
          )}
        </>
      )}

      <div className="photo-actions">
        <button
          type="button"
          className={`photo-like-btn ${photo.likedByViewer ? "is-liked" : ""}`.trim()}
          onClick={() => void onLike()}
          aria-pressed={photo.likedByViewer}
        >
          <HeartIcon filled={photo.likedByViewer} />
          <span>{photo.likedByViewer ? text.liked : text.like}</span>
          <span className="photo-action-count">{photo.likeCount}</span>
        </button>
        <span className="photo-action-stat">
          <CommentIcon />
          <span className="photo-action-count">{photo.commentCount}</span>
        </span>
      </div>

      {actionError !== null && <InfoBubble title={actionError} className="md-component-danger" />}

      <section className="photo-comments">
        <h3>{text.comments}</h3>

        {photo.comments.length === 0 ? (
          <p className="loading-text">{text.noComments}</p>
        ) : (
          <ul className="photo-comment-list">
            {photo.comments.map((comment) => (
              <li className="photo-comment" key={comment.id}>
                {comment.author.image && (
                  <img className="photo-author-avatar" src={comment.author.image} alt="" width={28} height={28} />
                )}
                <div className="photo-comment-body">
                  <span className="photo-comment-head">
                    <span className="photo-author-name">{comment.author.name}</span>
                    <span className="photo-posted-at">{formatPhotoDate(comment.postedAt, isJapanese)}</span>
                  </span>
                  <p className="photo-comment-text">{comment.body}</p>
                </div>
                {comment.deletableByViewer && (
                  <button
                    type="button"
                    className="photo-comment-delete"
                    onClick={() => void onDeleteComment(comment.id)}
                    aria-label={text.remove}
                    title={text.remove}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {auth.isSignedIn ? (
          <form className="photo-comment-form" onSubmit={(e) => void onSubmitComment(e)}>
            <input
              className="editor-commit-input"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder={text.commentPlaceholder}
              maxLength={1000}
            />
            <button
              type="submit"
              className="editor-btn editor-btn-primary"
              disabled={postingComment || !commentBody.trim()}
            >
              {text.post}
            </button>
          </form>
        ) : (
          <button type="button" className="github-edit-btn" onClick={() => auth.redirectToLogin()}>
            {text.signInToComment}
          </button>
        )}
      </section>

      <footer className="article-footer-nav">
        <div className="article-nav-row">
          <div className="nav-cell nav-cell-prev">
            {newer && (
              <AppLink href={photoRoute(newer.id, isJapanese)} className="nav-link prev-link">
                ← {newer.caption || newer.alt || newer.id}
              </AppLink>
            )}
          </div>

          <div className="nav-cell nav-cell-middle">
            <AppLink href={isJapanese ? "/photos/ja" : "/photos"} className="breadcrumb-link">
              {text.back}
            </AppLink>
          </div>

          <div className="nav-cell nav-cell-next">
            {older && (
              <AppLink href={photoRoute(older.id, isJapanese)} className="nav-link next-link">
                {older.caption || older.alt || older.id} →
              </AppLink>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
