import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import InfoBubble from "../InfoBubble/InfoBubble";
import { createPhoto, uploadMedia } from "../../../Services/PhotoService";
import { prepareVariants, type PreparedImage } from "../../../Services/ImageResizeUtils";
import type { PhotoPost } from "../../../Types/TypeRegistry";

export interface PhotoComposerProps {
  isJapanese: boolean;
  onPosted: (post: PhotoPost) => void;
  onClose: () => void;
}

const TEXT = {
  en: {
    heading: "New photo",
    drop: "Drop a photo here, or choose a file",
    choose: "Choose a file",
    replace: "Choose a different photo",
    caption: "Caption",
    captionPlaceholder: "Say something about it…",
    alt: "Alt text",
    altHint: "Describes the photo for screen readers. Worth the ten seconds.",
    tags: "Tags",
    tagsHint: "Comma separated, e.g. tokyo, film, night.",
    post: "Post",
    cancel: "Cancel",
    preparing: "Resizing…",
    uploading: "Uploading…",
    publishing: "Publishing…",
    notAnImage: "That file is not an image.",
  },
  ja: {
    heading: "新しい写真",
    drop: "ここに写真をドロップ、またはファイルを選択",
    choose: "ファイルを選択",
    replace: "別の写真を選ぶ",
    caption: "キャプション",
    captionPlaceholder: "この写真について一言…",
    alt: "代替テキスト",
    altHint: "スクリーンリーダー向けの説明です。",
    tags: "タグ",
    tagsHint: "カンマ区切り（例: tokyo, film, night）。",
    post: "投稿",
    cancel: "キャンセル",
    preparing: "リサイズ中…",
    uploading: "アップロード中…",
    publishing: "公開中…",
    notAnImage: "画像ファイルではありません。",
  },
} as const;

type Phase = "idle" | "preparing" | "uploading" | "publishing";

const parseTags = (value: string): string[] =>
  value
    .split(",")
    .map((tag) => tag.trim().toLowerCase().replace(/^#/, ""))
    .filter(Boolean);

/**
 * Picks a photo, resizes it in the browser, and publishes it.
 *
 * Two objects go up per post — a full-size image and a grid thumbnail — because the alternative is
 * an image library on the API resizing what the browser has already decoded anyway.
 */
export default function PhotoComposer({ isJapanese, onPosted, onClose }: PhotoComposerProps) {
  const text = isJapanese ? TEXT.ja : TEXT.en;

  const fileInput = useRef<HTMLInputElement>(null);

  const [variants, setVariants] = useState<{ full: PreparedImage; thumb: PreparedImage } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  const [tags, setTags] = useState("");

  // The preview is an object URL over the resized blob; without this the browser holds every photo
  // the composer has touched until the page is left.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const accept = async (file: File | undefined) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError(text.notAnImage);
      return;
    }

    setError(null);
    setPhase("preparing");

    try {
      const prepared = await prepareVariants(file);
      setVariants(prepared);
      setPreviewUrl(URL.createObjectURL(prepared.full.blob));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPhase("idle");
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void accept(event.dataTransfer.files[0]);
  };

  const onChoose = (event: ChangeEvent<HTMLInputElement>) => {
    void accept(event.target.files?.[0]);
    // Cleared so choosing the same file twice still fires a change event.
    event.target.value = "";
  };

  const onSubmit = async () => {
    if (!variants) return;

    setError(null);
    setPhase("uploading");

    try {
      const full = await uploadMedia(variants.full.blob, "full");
      const thumb = await uploadMedia(variants.thumb.blob, "thumb", full.id);

      setPhase("publishing");

      const post = await createPhoto({
        id: full.id,
        full: full.path,
        thumb: thumb.path,
        width: variants.full.width,
        height: variants.full.height,
        caption: caption.trim(),
        alt: alt.trim(),
        tags: parseTags(tags),
      });

      onPosted(post);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  const busyLabel =
    phase === "preparing" ? text.preparing : phase === "uploading" ? text.uploading : text.publishing;

  return (
    <div className="photo-composer">
      <h3 className="photo-composer-heading">{text.heading}</h3>

      {error !== null && <InfoBubble title={error} className="md-component-danger" />}

      <div
        className={`photo-dropzone ${isDragging ? "is-dragging" : ""} ${previewUrl ? "has-photo" : ""}`.trim()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        {previewUrl ? (
          <img className="photo-composer-preview" src={previewUrl} alt="" />
        ) : (
          <p className="photo-dropzone-hint">{text.drop}</p>
        )}

        <button
          type="button"
          className="editor-btn editor-btn-cancel"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          {previewUrl ? text.replace : text.choose}
        </button>

        <input
          ref={fileInput}
          className="photo-file-input"
          type="file"
          accept="image/*"
          onChange={onChoose}
        />
      </div>

      <div className="editor-fields">
        <label className="photo-field">
          <span>{text.caption}</span>
          <textarea
            className="editor-description-input"
            rows={3}
            maxLength={2200}
            value={caption}
            placeholder={text.captionPlaceholder}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>

        <label className="photo-field">
          <span>{text.alt}</span>
          <input
            className="editor-commit-input"
            maxLength={300}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
          />
          <small className="photo-field-hint">{text.altHint}</small>
        </label>

        <label className="photo-field">
          <span>{text.tags}</span>
          <input
            className="editor-commit-input"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <small className="photo-field-hint">{text.tagsHint}</small>
        </label>
      </div>

      <div className="editor-actions">
        {busy && <span className="editor-status">{busyLabel}</span>}
        <button type="button" className="editor-btn editor-btn-cancel" onClick={onClose} disabled={busy}>
          {text.cancel}
        </button>
        <button
          type="button"
          className="editor-btn editor-btn-primary"
          onClick={() => void onSubmit()}
          disabled={busy || variants === null}
        >
          {text.post}
        </button>
      </div>
    </div>
  );
}
