import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import {
  deleteAdminUser,
  fetchAdminDashboard,
  revokeAdminUserSessions,
} from "../../Services/admin";
import { signInHref, useAuth } from "../../Services/auth";
import { Link } from "../../Services/router";
import type { AdminDashboard } from "../../Services/types";

export interface AdminProps {
  isJapanese: boolean;
}

const TEXT = {
  en: {
    title: "Control panel",
    subtitle: "Accounts and active sessions",
    users: "Accounts",
    sessions: "Active sessions",
    providers: "Provider links",
    search: "Search name or email",
    searchAction: "Search",
    clear: "Clear",
    loading: "Loading control panel…",
    signIn: "Sign in with a site-owner account to continue.",
    signInAction: "Sign in",
    noUsers: "No accounts match this search.",
    owner: "owner",
    current: "you",
    joined: "Joined",
    activeSessions: "active sessions",
    revoke: "Revoke sessions",
    remove: "Delete account",
    truncated: "Showing the newest 200 matching accounts.",
    revokeConfirm: "Sign this account out on every device?",
    deleteConfirm: "Permanently delete this account and all of its sign-in methods?",
  },
  ja: {
    title: "コントロール パネル",
    subtitle: "アカウントとアクティブ セッション",
    users: "アカウント",
    sessions: "アクティブ セッション",
    providers: "プロバイダー接続",
    search: "名前またはメールを検索",
    searchAction: "検索",
    clear: "クリア",
    loading: "コントロール パネルを読み込み中…",
    signIn: "サイト所有者のアカウントでサインインしてください。",
    signInAction: "サインイン",
    noUsers: "一致するアカウントはありません。",
    owner: "所有者",
    current: "自分",
    joined: "登録日",
    activeSessions: "件のアクティブ セッション",
    revoke: "セッションを無効化",
    remove: "アカウントを削除",
    truncated: "最新の一致するアカウント 200 件を表示しています。",
    revokeConfirm: "このアカウントをすべての端末からサインアウトしますか？",
    deleteConfirm: "このアカウントとすべてのサインイン方法を完全に削除しますか？",
  },
} as const;

function providerTotal(dashboard: AdminDashboard): number {
  return Object.values(dashboard.totals.providers).reduce((sum, count) => sum + count, 0);
}

/** Owner-only account and session administration. Authorization is repeated by every API action. */
export default function Admin({ isJapanese }: AdminProps) {
  const auth = useAuth();
  const text = isJapanese ? TEXT.ja : TEXT.en;
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [draftQuery, setDraftQuery] = useState("");
  const [query, setQuery] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDashboard(await fetchAdminDashboard(query));
    } catch (failure) {
      setDashboard(null);
      setError(failure instanceof Error ? failure.message : "Could not load the control panel.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (auth.initializing) return;
    let cancelled = false;

    void fetchAdminDashboard(query)
      .then((result) => {
        if (!cancelled) {
          setDashboard(result);
          setError(null);
        }
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setDashboard(null);
          setError(failure instanceof Error ? failure.message : "Could not load the control panel.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auth.initializing, query]);

  const providerSummary = useMemo(() => {
    if (!dashboard) return "";
    return Object.entries(dashboard.totals.providers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, count]) => `${provider} ${count}`)
      .join(" · ");
  }, [dashboard]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = draftQuery.trim();
    if (nextQuery === query) {
      void load();
      return;
    }
    setLoading(true);
    setQuery(nextQuery);
  };

  const revokeSessions = async (userId: string) => {
    if (!window.confirm(text.revokeConfirm)) return;
    setBusyUserId(userId);
    setError(null);
    try {
      const signedOutCurrentAccount = await revokeAdminUserSessions(userId);
      if (signedOutCurrentAccount) {
        window.location.assign(signInHref(isJapanese));
        return;
      }
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not revoke sessions.");
    } finally {
      setBusyUserId(null);
    }
  };

  const removeUser = async (userId: string) => {
    if (!window.confirm(text.deleteConfirm)) return;
    setBusyUserId(userId);
    setError(null);
    try {
      await deleteAdminUser(userId);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not delete the account.");
    } finally {
      setBusyUserId(null);
    }
  };

  if ((auth.initializing || loading) && dashboard === null && error === null) {
    return <p className="admin-loading">{text.loading}</p>;
  }

  if (!auth.isSignedIn) {
    return (
      <section className="admin-panel">
        <h2>{text.title}</h2>
        <p className="admin-subtitle">{text.signIn}</p>
        <Link className="editor-btn editor-btn-primary admin-inline-action" href={signInHref(isJapanese)}>
          {text.signInAction}
        </Link>
      </section>
    );
  }

  return (
    <section className="admin-panel">
      <div className="admin-heading">
        <div>
          <h2>{text.title}</h2>
          <p className="admin-subtitle">{text.subtitle}</p>
        </div>
        <button type="button" className="github-edit-btn" onClick={() => void load()} disabled={loading}>
          ↻
        </button>
      </div>

      {error !== null && <InfoBubble title={error} className="md-component-danger" />}

      {dashboard !== null && (
        <>
          <div className="admin-stats" aria-label={text.subtitle}>
            <div className="admin-stat">
              <strong>{dashboard.totals.users}</strong>
              <span>{text.users}</span>
            </div>
            <div className="admin-stat">
              <strong>{dashboard.totals.activeSessions}</strong>
              <span>{text.sessions}</span>
            </div>
            <div className="admin-stat" title={providerSummary}>
              <strong>{providerTotal(dashboard)}</strong>
              <span>{text.providers}</span>
            </div>
          </div>

          <form className="admin-search" onSubmit={submitSearch}>
            <input
              className="editor-commit-input"
              type="search"
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={text.search}
              aria-label={text.search}
            />
            {query && (
              <button
                type="button"
                className="editor-btn editor-btn-cancel"
                onClick={() => {
                  setDraftQuery("");
                  setLoading(true);
                  setQuery("");
                }}
              >
                {text.clear}
              </button>
            )}
            <button type="submit" className="editor-btn editor-btn-primary">
              {text.searchAction}
            </button>
          </form>

          {dashboard.users.length === 0 ? (
            <p className="admin-empty">{text.noUsers}</p>
          ) : (
            <ul className="admin-users">
              {dashboard.users.map((user) => {
                const isCurrent = user.id === dashboard.viewerId;
                const disabled = busyUserId !== null;
                return (
                  <li className="admin-user" key={user.id}>
                    <div className="admin-user-main">
                      {user.image ? (
                        <img className="admin-avatar" src={user.image} alt="" width="42" height="42" />
                      ) : (
                        <span className="admin-avatar admin-avatar-fallback" aria-hidden="true">
                          {(user.name || user.email).slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="admin-user-identity">
                        <div className="admin-user-name">
                          <strong>{user.name || user.email.split("@")[0]}</strong>
                          {user.isOwner && <span className="admin-badge">{text.owner}</span>}
                          {isCurrent && <span className="admin-badge">{text.current}</span>}
                        </div>
                        <span>{user.email}</span>
                        <span className="admin-user-meta">
                          {user.providers.join(" · ") || "—"} · {user.activeSessions} {text.activeSessions}
                        </span>
                        <span className="admin-user-meta">
                          {text.joined} {new Date(user.createdAt).toLocaleDateString(isJapanese ? "ja-JP" : undefined)}
                        </span>
                      </div>
                    </div>
                    <div className="admin-user-actions">
                      <button
                        type="button"
                        className="editor-btn editor-btn-cancel"
                        disabled={disabled || user.activeSessions === 0}
                        onClick={() => void revokeSessions(user.id)}
                      >
                        {text.revoke}
                      </button>
                      {!user.isOwner && !isCurrent && (
                        <button
                          type="button"
                          className="editor-btn admin-danger-btn"
                          disabled={disabled}
                          onClick={() => void removeUser(user.id)}
                        >
                          {text.remove}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {dashboard.truncated && <p className="admin-limit">{text.truncated}</p>}
        </>
      )}
    </section>
  );
}
