import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { fetchBoards } from "../../Services/BoardService";
import { boardHref, AppLink } from "../../Services/AppRouter";
import type { BoardSummary } from "../../Types/TypeRegistry";
import BoardPreview from "../../Common/Components/BoardPreview/BoardPreview";

export interface LandingProps {
  tab: "home" | "explore";
  config?: {
    sort?: "trending" | "recent" | "random";
    limit?: number;
    heading?: string;
    showHeading?: boolean;
    showControls?: boolean;
  };
}

const TEXT = {
  en: {
    title: "Boards for you",
    explore: "Explore boards",
    lead: "Open an experience made from images, words, media, and widgets.",
    trending: "Trending",
    random: "Surprise me",
    empty: "No published boards yet.",
    error: "Could not load boards: ",
    views: "views",
    by: "by",
  },
  ja: {
    title: "おすすめのボード",
    explore: "ボードを見つける",
    lead: "画像、言葉、メディア、ウィジェットで作られた体験を開きましょう。",
    trending: "トレンド",
    random: "ランダム",
    empty: "公開されたボードはまだありません。",
    error: "ボードを読み込めませんでした: ",
    views: "閲覧",
    by: "作成",
  },
} as const;

/** The front page discovers experiences, never a stream of tweet-shaped posts. */
export default function Landing({ tab, config }: LandingProps) {
  const { i18n } = useTranslation();
  const text = i18n.language === "ja" ? TEXT.ja : TEXT.en;
  const [selectedSort, setSelectedSort] = useState<"trending" | "random">(
    config?.sort === "random" ? "random" : "trending",
  );
  const [randomRun, setRandomRun] = useState(0);
  const showHeading = config?.showHeading !== false;
  const showControls = config?.showControls ?? (config?.sort === undefined && tab === "explore");
  const activeSort = showControls
    ? selectedSort
    : (config?.sort ?? (tab === "home" ? "trending" : selectedSort));
  const limit = Math.min(50, Math.max(1, Math.round(config?.limit ?? 24)));
  const requestKey = `${tab}:${activeSort}:${limit}:${randomRun}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    boards: BoardSummary[] | null;
    error: string | null;
  }>({ key: "", boards: null, error: null });
  const { boards, error } = loaded.key === requestKey
    ? loaded
    : { boards: null, error: null };

  useEffect(() => {
    if (config?.sort === "trending" || config?.sort === "random") {
      setSelectedSort(config.sort);
    }
  }, [config?.sort]);

  useEffect(() => {
    let active = true;
    fetchBoards({ feed: tab, sort: activeSort, limit })
      .then((next) => {
        if (active) setLoaded({ key: requestKey, boards: next, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setLoaded({
            key: requestKey,
            boards: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => { active = false; };
  }, [tab, activeSort, limit, randomRun, requestKey]);

  const heading = config?.heading?.trim() || (tab === "home" ? text.title : text.explore);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "medium",
  });

  return (
    <div className="file-content landing board-feed" data-phase="ready">
      {(showHeading || showControls) && (
        <header className="board-feed-head">
          {showHeading && (
            <div>
              <h1>{heading}</h1>
              <p>{text.lead}</p>
            </div>
          )}
          {showControls && (
            <div className="board-feed-modes" role="group" aria-label={text.explore}>
              <button
                type="button"
                className={activeSort === "trending" ? "is-active" : ""}
                onClick={() => setSelectedSort("trending")}
              >
                {text.trending}
              </button>
              <button
                type="button"
                className={activeSort === "random" ? "is-active" : ""}
                onClick={() => {
                  setSelectedSort("random");
                  setRandomRun((value) => value + 1);
                }}
              >
                {text.random}
              </button>
            </div>
          )}
        </header>
      )}

      {error ? (
        <InfoBubble title={`${text.error}${error}`} className="md-component-danger" />
      ) : boards === null ? (
        <div className="board-feed-grid" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} width="100%" height="220px" />)}
        </div>
      ) : boards.length === 0 ? (
        <p className="loading-text">{text.empty}</p>
      ) : (
        <div className="board-feed-grid">
          {boards.map((board, index) => {
            const handle = board.owner.profile?.handle;
            if (!handle) return null;
            const dateValue = board.publishedAt ?? board.updatedAt;
            const date = new Date(dateValue);
            const formattedDate = Number.isNaN(date.valueOf()) ? null : dateFormatter.format(date);
            return (
              <AppLink
                key={board.id}
                href={boardHref(handle, board.slug)}
                className="board-discovery-card"
                style={{ "--board-order": index } as React.CSSProperties}
              >
                <BoardPreview layout={board.layout} owner={board.owner} />
                <span className="board-discovery-copy">
                  <strong>{board.title}</strong>
                  <span className="board-discovery-author">
                    {board.owner.image && <SmartImage src={board.owner.image} alt="" width="24" height="24" />}
                    <span>{text.by} @{handle}</span>
                  </span>
                  {formattedDate && (
                    <time className="board-discovery-date" dateTime={date.toISOString()}>{formattedDate}</time>
                  )}
                  <span className="board-discovery-views">{board.viewCount} {text.views}</span>
                  {board.description && <span className="board-discovery-description">{board.description}</span>}
                </span>
              </AppLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
