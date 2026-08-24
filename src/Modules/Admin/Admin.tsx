import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import MetroSelect from "../../Common/Components/MetroSelect/MetroSelect";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import {
  deleteAdminBoard,
  deleteAdminUser,
  fetchAdmin,
  updateAdminBoard,
  type AdminBoard,
  type AdminSnapshot,
} from "../../Services/AdminService";
import { useAuth } from "../../Services/AuthProvider";
import { AppLink } from "../../Services/AppRouter";
import type { SitePageName } from "../../Services/SiteService";

const PAGES: SitePageName[] = ["home", "explore", "about"];

const TEXT = {
  en: {
    title: "App administration",
    lead: "Manage the people, experiences, and standalone boards that make up Hisuiki.",
    users: "Users",
    boards: "Boards",
    posts: "Posts",
    pages: "Website pages",
    pagesHint: "Each route has a protected system board. You can edit it directly or temporarily replace it with any published board.",
    unassigned: "Use the system board",
    systemBoard: "System board",
    editSystem: "Edit system board",
    override: "Override",
    allBoards: "All boards",
    allUsers: "Users",
    search: "Search",
    owner: "Owner",
    published: "Published",
    draft: "Draft",
    profile: "Profile",
    edit: "Edit layout",
    delete: "Delete",
    deleteBoard: "Permanently delete this board?",
    deleteUser: "Permanently delete this user and all of their boards and content?",
    restricted: "This page requires a site-owner account.",
    create: "Create a board",
  },
  ja: {
    title: "アプリ管理",
    lead: "Hisuikiのユーザー、体験、スタンドアロンボードを管理します。",
    users: "ユーザー",
    boards: "ボード",
    posts: "投稿",
    pages: "ウェブサイトのページ",
    pagesHint: "各ルートには保護されたシステムボードがあります。直接編集するか、公開済みボードで一時的に置き換えられます。",
    unassigned: "システムボードを使用",
    systemBoard: "システムボード",
    editSystem: "システムボードを編集",
    override: "上書き",
    allBoards: "すべてのボード",
    allUsers: "ユーザー",
    search: "検索",
    owner: "オーナー",
    published: "公開中",
    draft: "下書き",
    profile: "プロフィール",
    edit: "レイアウトを編集",
    delete: "削除",
    deleteBoard: "このボードを完全に削除しますか？",
    deleteUser: "このユーザーとすべてのボード・コンテンツを完全に削除しますか？",
    restricted: "このページにはサイトオーナー権限が必要です。",
    create: "ボードを作成",
  },
} as const;

export default function Admin() {
  const auth = useAuth();
  const { i18n } = useTranslation();
  const text = i18n.language === "ja" ? TEXT.ja : TEXT.en;
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.initializing && !auth.isSignedIn) auth.redirectToLogin();
  }, [auth]);

  useEffect(() => {
    if (!auth.isSignedIn) return;
    let active = true;
    fetchAdmin()
      .then((data) => active && setSnapshot(data))
      .catch((err: unknown) => active && setError(err instanceof Error ? err.message : String(err)));
    return () => { active = false; };
  }, [auth.isSignedIn]);

  const filteredBoards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot?.boards ?? [];
    return (snapshot?.boards ?? []).filter((board) =>
      [board.title, board.slug, board.systemPage, board.sitePage, board.owner.name, board.owner.email, board.owner.profile?.handle]
        .some((value) => value?.toLowerCase().includes(needle)),
    );
  }, [snapshot?.boards, query]);

  const replaceBoard = (next: AdminBoard) => {
    setSnapshot((current) => current ? {
      ...current,
      boards: current.boards.map((board) => board.id === next.id
        ? next
        : next.sitePage && board.sitePage === next.sitePage ? { ...board, sitePage: null } : board),
    } : current);
  };

  const assignPage = async (page: SitePageName, id: string) => {
    setBusy(`page:${page}`);
    setError(null);
    try {
      const current = snapshot?.boards.find((board) => board.sitePage === page);
      if (!id && current) replaceBoard(await updateAdminBoard(current.id, { sitePage: null }));
      if (id) replaceBoard(await updateAdminBoard(id, { sitePage: page }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const moderate = async (board: AdminBoard, action: "publish" | "delete") => {
    if (action === "delete" && !window.confirm(text.deleteBoard)) return;
    setBusy(board.id);
    setError(null);
    try {
      if (action === "delete") {
        await deleteAdminBoard(board.id);
        setSnapshot((current) => current ? {
          ...current,
          boards: current.boards.filter((item) => item.id !== board.id),
          stats: { ...current.stats, boards: current.stats.boards - 1 },
        } : current);
      } else {
        replaceBoard(await updateAdminBoard(board.id, { published: !board.publishedAt }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const removeUser = async (id: string) => {
    if (!window.confirm(text.deleteUser)) return;
    setBusy(id);
    setError(null);
    try {
      await deleteAdminUser(id);
      setSnapshot((current) => {
        if (!current) return current;
        const removed = current.users.find((user) => user.id === id);
        return {
          ...current,
          users: current.users.filter((user) => user.id !== id),
          boards: current.boards.filter((board) => board.owner.id !== id),
          stats: {
            users: current.stats.users - 1,
            boards: Math.max(0, current.stats.boards - (removed?._count.boards ?? 0)),
            posts: Math.max(0, current.stats.posts - (removed?._count.posts ?? 0)),
          },
        };
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (!snapshot && !error) {
    return <div className="file-content admin-page"><Skeleton width="100%" height="420px" /></div>;
  }

  return (
    <div className="file-content admin-page" data-phase="ready">
      <header className="admin-head">
        <div><h1>{text.title}</h1><p>{text.lead}</p></div>
        <AppLink href="/boards" className="editor-btn editor-btn-primary">{text.create}</AppLink>
      </header>
      {error && <InfoBubble title={error || text.restricted} className="md-component-danger" />}

      {snapshot && (
        <>
          <section className="admin-stats" aria-label="Statistics">
            <div><strong>{snapshot.stats.users}</strong><span>{text.users}</span></div>
            <div><strong>{snapshot.stats.boards}</strong><span>{text.boards}</span></div>
            <div><strong>{snapshot.stats.posts}</strong><span>{text.posts}</span></div>
          </section>

          <section className="admin-section">
            <h2>{text.pages}</h2>
            <p>{text.pagesHint}</p>
            <div className="admin-page-assignments">
              {PAGES.map((page) => {
                const system = snapshot.boards.find((board) => board.systemPage === page);
                return (
                  <article className="admin-page-assignment" key={page}>
                    <header>
                      <div><strong>{page}</strong><small>{text.systemBoard}</small></div>
                      {system && <AppLink href={`/boards/${system.id}/edit`}>{text.editSystem}</AppLink>}
                    </header>
                    <div className="admin-assignment-field">
                      <span>{text.override}</span>
                      <MetroSelect
                        label={`${text.override}: ${page}`}
                        value={snapshot.boards.find((board) => board.sitePage === page)?.id ?? ""}
                        disabled={busy === `page:${page}`}
                        options={[
                          { value: "", label: text.unassigned },
                          ...snapshot.boards
                            .filter((board) => !board.systemPage)
                            .map((board) => ({ value: board.id, label: `${board.title} — ${board.owner.name}` })),
                        ]}
                        onChange={(id) => void assignPage(page, id)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="admin-section">
            <div className="admin-section-head">
              <h2>{text.allBoards}</h2>
              <input aria-label={text.search} placeholder={text.search} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>{text.boards}</th><th>{text.owner}</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {filteredBoards.map((board) => (
                    <tr key={board.id}>
                      <td><strong>{board.title}</strong><small>/{board.slug}{board.systemPage ? ` · ${text.systemBoard}: ${board.systemPage}` : board.sitePage ? ` · ${text.override}: ${board.sitePage}` : ""}</small></td>
                      <td>{board.owner.name}<small>{board.owner.email}</small></td>
                      <td>{board.publishedAt ? text.published : text.draft}{board.isPrimary ? ` · ${text.profile}` : ""}</td>
                      <td>
                        <div className="admin-row-actions">
                          <AppLink href={`/boards/${board.id}/edit`}>{text.edit}</AppLink>
                          {!board.sitePage && !board.systemPage && <button disabled={busy === board.id} onClick={() => void moderate(board, "publish")}>{board.publishedAt ? text.draft : text.published}</button>}
                          {!board.systemPage && <button className="is-danger" disabled={busy === board.id} onClick={() => void moderate(board, "delete")}>{text.delete}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="admin-section">
            <h2>{text.allUsers}</h2>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>{text.users}</th><th>{text.boards}</th><th>{text.posts}</th><th /></tr></thead>
                <tbody>
                  {snapshot.users.map((user) => (
                    <tr key={user.id}>
                      <td><strong>{user.name || user.email}</strong><small>{user.email}{user.profile?.handle ? ` · @${user.profile.handle}` : ""}</small></td>
                      <td>{user._count.boards}</td>
                      <td>{user._count.posts}</td>
                      <td>
                        <div className="admin-row-actions">
                          {user.isOwner ? <span>{text.owner}</span> : (
                            <button className="is-danger" disabled={busy === user.id} onClick={() => void removeUser(user.id)}>{text.delete}</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
