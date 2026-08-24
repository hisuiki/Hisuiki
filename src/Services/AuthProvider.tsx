import { createContext, useContext, useMemo, type ReactNode } from "react";
import { authClient } from "./AuthClient";
import type { AuthUser } from "../Types/TypeRegistry";

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
  /** True until the session request has settled, so the UI can avoid flashing a signed-out state. */
  initializing: boolean;
  /** Sends the browser to the sign-in page, returning here afterwards. */
  redirectToLogin: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  isSignedIn: false,
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
  }, [data, isPending]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthValue => useContext(AuthContext);
