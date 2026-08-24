import { useEffect, useMemo, useState } from "react";
import Skeleton from "../Skeleton/Skeleton";
import PageEditor from "../PageEditor/PageEditor";
import { AppLink } from "../../../Services/AppRouter";
import { useAuth } from "../../../Services/AuthProvider";
import { fetchArticles } from "../../../Services/ContentApiService";
import { articleRoute, postsFor } from "../../../Services/PathUtils";
import type { ArticleMetadata } from "../../../Types/TypeRegistry";

export interface PostsIndexProps {
  isJapanese?: boolean;
}

/** The article list rendered in place of a `<PostsIndex />` tag, plus the "Add new article" entry. */
export default function PostsIndex({ isJapanese = false }: PostsIndexProps) {
  const auth = useAuth();

  const [allArticles, setAllArticles] = useState<ArticleMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    let active = true;

    fetchArticles()
      .then((articles) => {
        if (active) setAllArticles(articles);
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

  const articles = useMemo(
    () => postsFor(allArticles, isJapanese),
    [allArticles, isJapanese]
  );

  const startCreating = () => {
    if (!auth.isSignedIn) {
      auth.redirectToLogin();
      return;
    }
    setIsCreating(true);
  };

  return (
    <div className="posts-index-container">
      <div className="posts-index-header">
        <h2>Articles</h2>
        {!isCreating && (
          <button type="button" className="editor-btn editor-btn-primary" onClick={startCreating}>
            + Add new article
          </button>
        )}
      </div>

      {isCreating ? (
        <PageEditor isNewFile isJapanese={isJapanese} onClose={() => setIsCreating(false)} />
      ) : loading ? (
        <div className="posts-index-list" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div className="posts-index-card" key={i}>
              <Skeleton className="skeleton-title" width="55%" />
              <Skeleton className="skeleton-line" width="80%" />
              <Skeleton className="skeleton-meta" width="100px" />
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="loading-text" style={{ color: "red" }}>
          Error loading articles: {error}
        </p>
      ) : articles.length === 0 ? (
        <p className="loading-text">No articles found.</p>
      ) : (
        <div className="posts-index-list">
          {articles.map((art) => (
            <article className="posts-index-card" key={art.slug}>
              <h3 className="posts-card-title">
                <AppLink href={articleRoute(art.slug)}>{art.title}</AppLink>
              </h3>
              {art.description && <p className="posts-card-desc">{art.description}</p>}
              <div className="posts-card-meta">
                {art.author && <span className="posts-card-author">By {art.author}</span>}
                {art.lastEdited && (
                  <span
                    className="posts-card-last-edited"
                    title={`Created: ${art.created || art.lastEdited}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {art.lastEdited}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
