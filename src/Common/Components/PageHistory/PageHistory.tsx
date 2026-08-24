import { useEffect, useState } from "react";
import Skeleton from "../Skeleton/Skeleton";
import InfoBubble from "../InfoBubble/InfoBubble";
import MdContentRenderer from "../MdContentRenderer/MdContentRenderer";
import { previewMarkdown } from "../../../Services/ContentApiService";
import {
  getRevisionDiff,
  getRevisions,
  hunkNewText,
  hunkOldText,
  type DiffHunk,
  type DiffLineType,
  type PageRevision,
} from "../../../Services/HistoryService";

export interface PageHistoryProps {
  slug: string;
  isHome: boolean;
  isJapanese?: boolean;
  onClose: () => void;
}

const lineClass = (type: DiffLineType): string =>
  type === "added"
    ? "history-diff-line history-diff-added"
    : type === "removed"
      ? "history-diff-line history-diff-removed"
      : "history-diff-line";

const linePrefix = (type: DiffLineType): string =>
  type === "added" ? "+ " : type === "removed" ? "- " : "  ";

const firstLine = (message: string): string => message.split("\n")[0] ?? "";

const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

async function renderMarkdown(markdown: string): Promise<string> {
  try {
    return await previewMarkdown(markdown);
  } catch {
    return '<p class="editor-status">Preview unavailable.</p>';
  }
}

/**
 * A page's edit history: one entry per stored object generation, newest first, each labelled with
 * the message its author wrote in the editor. Selecting one shows what that save changed.
 */
export default function PageHistory({ slug, isJapanese = false, onClose }: PageHistoryProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<PageRevision[]>([]);

  const [selected, setSelected] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [tab, setTab] = useState<"text" | "preview">("text");
  const [previews, setPreviews] = useState<Record<number, { before: string; after: string }>>({});

  useEffect(() => {
    let active = true;

    getRevisions(slug)
      .then((revs) => {
        if (active) setRevisions(revs);
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
  }, [slug]);

  const select = async (rev: PageRevision, index: number) => {
    if (selected === rev.generation) {
      setSelected(null);
      return;
    }

    setSelected(rev.generation);
    setTab("text");
    setDetailLoading(true);
    setHunks([]);
    setPreviews({});

    try {
      // Newest first, so the revision that came before this one is the next entry in the list.
      const previous = revisions[index + 1]?.generation ?? null;
      setHunks(await getRevisionDiff(slug, rev.generation, previous));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  };

  const selectTab = async (next: "text" | "preview") => {
    setTab(next);
    if (next !== "preview" || hunks.length === 0) return;

    const rendered = await Promise.all(
      hunks.map(async (hunk) => ({
        before: await renderMarkdown(hunkOldText(hunk)),
        after: await renderMarkdown(hunkNewText(hunk)),
      }))
    );
    setPreviews(Object.fromEntries(rendered.map((entry, i) => [i, entry])));
  };

  return (
    <div className="page-history">
      <div className="history-header">
        <h3>History</h3>
        <button type="button" className="editor-btn editor-btn-cancel" onClick={onClose}>
          Close
        </button>
      </div>

      {loading ? (
        <div className="history-skeleton" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton className="skeleton-card" width="100%" key={i} />
          ))}
        </div>
      ) : error !== null ? (
        <InfoBubble title={`Could not load history: ${error}`} />
      ) : revisions.length === 0 ? (
        <p className="loading-text">This page has not been edited since versions started being kept.</p>
      ) : (
        <ul className="history-list">
          {revisions.map((rev, index) => (
            <li className="history-item" key={rev.generation}>
              <button
                type="button"
                className={`history-entry ${rev.generation === selected ? "is-active" : ""}`.trim()}
                onClick={() => void select(rev, index)}
              >
                <span className="history-entry-body">
                  <span className="history-message">
                    {firstLine(rev.message) || "Saved without a message"}
                  </span>
                  <span className="history-meta">
                    {rev.authorName || "unknown"} · {formatDate(rev.date)}
                  </span>
                </span>
              </button>

              {rev.generation === selected && (
                <div className="history-detail">
                  <div className="editor-tabs">
                    <button
                      type="button"
                      className={`editor-tab ${tab === "text" ? "is-active" : ""}`.trim()}
                      onClick={() => void selectTab("text")}
                    >
                      Text
                    </button>
                    <button
                      type="button"
                      className={`editor-tab ${tab === "preview" ? "is-active" : ""}`.trim()}
                      onClick={() => void selectTab("preview")}
                    >
                      Preview
                    </button>
                    {rev.description && (
                      <span className="history-view-commit" title={rev.description}>
                        {firstLine(rev.description)}
                      </span>
                    )}
                  </div>

                  {detailLoading ? (
                    <div className="history-diff-hunk history-diff-skeleton" aria-hidden="true">
                      {["40%", "85%", "65%", "90%", "55%", "75%"].map((w) => (
                        <Skeleton className="skeleton-line" width={w} key={w} />
                      ))}
                    </div>
                  ) : hunks.length === 0 ? (
                    <p className="loading-text">No diff available for this revision.</p>
                  ) : tab === "text" ? (
                    hunks.map((hunk, i) => (
                      <div className="history-diff-hunk" key={i}>
                        <div className="history-diff-line history-diff-header">{hunk.header}</div>
                        {hunk.lines.map((line, j) => (
                          <div className={lineClass(line.type)} key={j}>
                            {linePrefix(line.type)}
                            {line.text}
                          </div>
                        ))}
                      </div>
                    ))
                  ) : (
                    hunks.map((_hunk, i) => (
                      <div className="history-compare" key={i}>
                        <div className="history-compare-pane">
                          <h4>Before</h4>
                          {previews[i] ? (
                            <MdContentRenderer html={previews[i]!.before} isJapanese={isJapanese} />
                          ) : (
                            <div aria-hidden="true">
                              <Skeleton className="skeleton-title" width="55%" />
                              <Skeleton className="skeleton-line" width="100%" />
                              <Skeleton className="skeleton-line" width="92%" />
                              <Skeleton className="skeleton-line" width="70%" />
                            </div>
                          )}
                        </div>
                        <div className="history-compare-pane">
                          <h4>After</h4>
                          {previews[i] ? (
                            <MdContentRenderer html={previews[i]!.after} isJapanese={isJapanese} />
                          ) : (
                            <div aria-hidden="true">
                              <Skeleton className="skeleton-title" width="55%" />
                              <Skeleton className="skeleton-line" width="100%" />
                              <Skeleton className="skeleton-line" width="92%" />
                              <Skeleton className="skeleton-line" width="70%" />
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
