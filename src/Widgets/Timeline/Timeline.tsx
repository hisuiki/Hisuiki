import { useState } from "react";
import { useTranslation } from "react-i18next";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { assetUrl } from "../../Services/AppConfig";
import { useProfileScope } from "../ProfileScopeProvider";

/** Everything posted, in two tabs. */
export default function Timeline() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"posts" | "media">("posts");
  const scope = useProfileScope();
  if (!scope) return null;

  const shown =
    tab === "media" ? scope.timeline.filter((post) => post.media.length > 0) : scope.timeline;

  return (
    <div>
      <nav className="profile-tabs">
        <button
          type="button"
          className={`landing-tab ${tab === "posts" ? "is-active" : ""}`.trim()}
          onClick={() => setTab("posts")}
        >
          {t("profile.posts")}
        </button>
        <button
          type="button"
          className={`landing-tab ${tab === "media" ? "is-active" : ""}`.trim()}
          onClick={() => setTab("media")}
        >
          {t("profile.media")}
        </button>
      </nav>

      {shown.length === 0 ? (
        <p className="loading-text">{t("profile.empty")}</p>
      ) : (
        <div className="feed">
          {shown.map((post) => (
            <article className="feed-post" key={post.id} data-post={post.id}>
              {post.title && <h3 className="feed-title">{post.title}</h3>}
              {post.media[0] && (
                <SmartImage
                  src={assetUrl(post.media[0].thumbPath ?? post.media[0].path)}
                  alt={post.media[0].alt}
                  block
                />
              )}
              {/* Sanitised on the server, with the post's stylesheet scoped to its own container. */}
              <div className="feed-body" dangerouslySetInnerHTML={{ __html: post.renderedHtml ?? "" }} />
              <footer className="feed-post-foot">
                <span>{post._count.likes}</span>
                <span>{post._count.comments}</span>
                <span>{post._count.reposts}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
