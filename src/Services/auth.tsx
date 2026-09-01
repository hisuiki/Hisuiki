import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authClient } from "./authClient";
import { apiUrl } from "./config";
import type { AuthUser } from "./types";

/**
 * Sign-in state, over better-auth's session hook.
 *
 * The browser holds nothing: the session is an HttpOnly cookie the server sets, so every call that
 * needs an identity just sends credentials and lets the API resolve it. This context exists to give
 * the app one shape to read rather than to store anything of its own.
 */

interface AuthValue {
  user: AuthUser | null;
  isSignedIn: boolean;
  /** SITE_OWNER_EMAILS membership, resolved by the API rather than trusted from browser state. */
  isAdmin: boolean;
  /** True until the session request has settled, so the UI can avoid flashing a signed-out state. */
  initializing: boolean;
  /** Sends the browser to the sign-in page, returning here afterwards. */
  redirectToLogin: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  isSignedIn: false,
  isAdmin: false,
  initializing: true,
  redirectToLogin: () => {},
  signOut: async () => {},
});

/** Where the sign-in page should return to; read by SignIn from the query string. */
export const RETURN_PARAM = "return";

export const signInHref = (japanese: boolean): string => {
  const here = `${window.location.pathname}${window.location.search}`;
  const base = japanese ? "/signin/ja" : "/signin";
  return `${base}?${RETURN_PARAM}=${encodeURIComponent(here)}`;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const sessionUserId = data?.user?.id;
  const isAdmin = Boolean(sessionUserId && adminUserId === sessionUserId);

  useEffect(() => {
    if (!sessionUserId) return;

    const controller = new AbortController();
    void fetch(apiUrl("/api/admin/status"), {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const result = (await response.json()) as { isAdmin?: boolean };
        return result.isAdmin === true;
      })
      .then((allowed) => setAdminUserId(allowed ? sessionUserId : null))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setAdminUserId(null);
      });

    return () => controller.abort();
  }, [sessionUserId]);

  const value = useMemo<AuthValue>(() => {
    const sessionUser = data?.user;

    return {
      user: sessionUser
        ? {
            id: sessionUser.id,
            name: sessionUser.name ?? "",
            email: sessionUser.email ?? "",
            image: sessionUser.image ?? "",
          }
        : null,
      isSignedIn: sessionUser !== undefined && sessionUser !== null,
      isAdmin,
      initializing: isPending,
      // A full page navigation rather than a client-side one: coming back from a social provider is
      // a fresh document load anyway, so the two paths behave the same.
      redirectToLogin: () => {
        window.location.href = signInHref(window.location.pathname.endsWith("/ja"));
      },
      signOut: async () => {
        await authClient.signOut();
      },
    };
  }, [data, isAdmin, isPending]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthValue => useContext(AuthContext);
