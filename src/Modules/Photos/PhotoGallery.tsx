import { useEffect, useState } from "react";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import PhotoComposer from "../../Common/Components/PhotoComposer/PhotoComposer";
import { AppLink } from "../../Services/AppRouter";
import { useAuth } from "../../Services/AuthProvider";
import { fetchPhotos, photoRoute } from "../../Services/PhotoService";
import type { PhotoPost } from "../../Types/TypeRegistry";

export interface PhotoGalleryProps {
  isJapanese: boolean;
}

const TEXT = {
  en: {
    heading: "Photos",
    add: "+ New photo",
    empty: "No photos yet.",
    emptyOwn: "No photos yet — post the first one.",
    error: "Error loading photos: ",
  },
  ja: {
    heading: "フォト",
    add: "+ 新しい写真",
    empty: "写真はまだありません。",
    emptyOwn: "写真はまだありません。最初の一枚を投稿しましょう。",
    error: "写真を読み込めませんでした: ",
  },
} as const;

/** The square-tile grid. One tile per post, newest first, linking to that photo's own page. */
export default function PhotoGallery({ isJapanese }: PhotoGalleryProps) {
  const auth = useAuth();
  const text = isJapanese ? TEXT.ja : TEXT.en;

  const [posts, setPosts] = useState<PhotoPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    let active = true;

    fetchPhotos()
      .then((loaded) => {
        if (active) setPosts(loaded);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const startComposing = () => {
    if (!auth.isSignedIn) {
      auth.redirectToLogin();
      return;
    }
    setIsComposing(true);
  };

  const onPosted = (post: PhotoPost) => {
    setIsComposing(false);
    // Prepended rather than refetched: the manifest read is cached per instance for a few seconds,
    // so a refetch here can come back without the post that was just created.
    setPosts((current) => [post, ...current]);
  };

  return (
    <div className="photo-gallery">
      <div className="posts-index-header">
        <h2>{text.heading}</h2>
        {!isComposing && (
          <button type="button" className="editor-btn editor-btn-primary" onClick={startComposing}>
            {text.add}
          </button>
        )}
      </div>

      {isComposing ? (
        <PhotoComposer
          isJapanese={isJapanese}
          onPosted={onPosted}
          onClose={() => setIsComposing(false)}
        />
      ) : loading ? (
        <div className="photo-grid" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton className="photo-tile-skeleton" key={i} />
          ))}
        </div>
      ) : error ? (
        <InfoBubble title={`${text.error}${error}`} className="md-component-danger" />
      ) : posts.length === 0 ? (
        <p className="loading-text">{auth.isSignedIn ? text.emptyOwn : text.empty}</p>
      ) : (
        <div className="photo-grid">
          {posts.map((post) => (
            <AppLink
              key={post.id}
              href={photoRoute(post.id, isJapanese)}
              className="photo-tile"
              aria-label={post.alt || post.caption || "Photo"}
            >
              <img
                className="photo-tile-image"
                src={post.thumbUrl}
                alt={post.alt}
                loading="lazy"
                decoding="async"
              />
              <span className="photo-tile-overlay" aria-hidden="true">
                <span className="photo-tile-stat">
                  <HeartIcon filled={post.likedByViewer} />
                  {post.likeCount}
                </span>
                <span className="photo-tile-stat">
                  <CommentIcon />
                  {post.commentCount}
                </span>
              </span>
            </AppLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 000-7.8z" />
    </svg>
  );
}

export function CommentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9 9 0 01-4.2-1L3 20l1.2-4.6A8.4 8.4 0 0121 11.5z" />
    </svg>
  );
}
