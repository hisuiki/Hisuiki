import { useEffect, useState, type FormEvent } from "react";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import { authClient } from "../../Services/authClient";
import { RETURN_PARAM, useAuth } from "../../Services/auth";
import { Link, useRouter } from "../../Services/router";
import { apiUrl } from "../../Services/config";

export interface SignInProps {
  isJapanese: boolean;
}

const TEXT = {
  en: {
    signIn: "Sign in",
    signUp: "Create an account",
    toggleToSignUp: "Need an account?",
    toggleToSignIn: "Already have an account?",
    withGithub: "Continue with GitHub",
    withGoogle: "Continue with Google",
    githubUnavailable: "GitHub sign-in is unavailable",
    googleUnavailable: "Google sign-in is unavailable",
    or: "or",
    name: "Name",
    email: "Email",
    password: "Password",
    submitSignIn: "Sign in",
    submitSignUp: "Create account",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    home: "Home",
    working: "One moment…",
  },
  ja: {
    signIn: "サインイン",
    signUp: "アカウント作成",
    toggleToSignUp: "アカウントをお持ちでない方",
    toggleToSignIn: "すでにアカウントをお持ちの方",
    withGithub: "GitHub で続ける",
    withGoogle: "Google で続ける",
    githubUnavailable: "GitHub サインインは利用できません",
    googleUnavailable: "Google サインインは利用できません",
    or: "または",
    name: "名前",
    email: "メールアドレス",
    password: "パスワード",
    submitSignIn: "サインイン",
    submitSignUp: "アカウントを作成",
    signedInAs: "サインイン中:",
    signOut: "サインアウト",
    home: "ホーム",
    working: "処理中…",
  },
} as const;

/** Where to send the browser once it is signed in; only same-site paths, never an absolute URL. */
function returnPath(): string {
  const requested = new URLSearchParams(window.location.search).get(RETURN_PARAM) ?? "/";
  // A leading "//" would be a protocol-relative URL to another host, so it is rejected along with
  // anything that is not a plain path.
  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";
}

/** Sign in or create an account: GitHub, Google, or an email and password held by this site. */
export default function SignIn({ isJapanese }: SignInProps) {
  const auth = useAuth();
  const { navigate } = useRouter();
  const text = isJapanese ? TEXT.ja : TEXT.en;

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState({ github: true, google: true });
  const [error, setError] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error");
    if (!oauthError) return null;
    return params.get("error_description") || `Social sign-in failed (${oauthError}).`;
  });

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiUrl("/api/auth/providers"), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as { github?: boolean; google?: boolean };
      })
      .then((available) =>
        setProviders({ github: available.github === true, google: available.google === true })
      )
      .catch((failure: unknown) => {
        if (!(failure instanceof DOMException && failure.name === "AbortError")) {
          // Leave both controls enabled when this optional discovery call fails. The auth endpoint
          // remains authoritative and will return its own actionable error.
        }
      });
    return () => controller.abort();
  }, []);

  const social = async (provider: "github" | "google") => {
    setBusy(true);
    setError(null);

    // Better Auth resolves a relative callback against the API host. Production splits the web and
    // API origins, so both success and failure targets must explicitly name the browser's origin.
    const callbackURL = new URL(returnPath(), window.location.origin).toString();
    const errorURL = new URL(isJapanese ? "/signin/ja" : "/signin", window.location.origin);
    errorURL.searchParams.set(RETURN_PARAM, returnPath());
    const { error: failure } = await authClient.signIn.social({
      provider,
      callbackURL,
      errorCallbackURL: errorURL.toString(),
    });

    if (failure) {
      setError(failure.message ?? "Sign-in failed.");
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result =
      mode === "signup"
        ? await authClient.signUp.email({ name: name.trim() || email, email, password })
        : await authClient.signIn.email({ email, password });

    setBusy(false);

    if (result.error) {
      setError(result.error.message ?? "Sign-in failed.");
      return;
    }

    navigate(returnPath());
  };

  if (auth.isSignedIn) {
    return (
      <div className="signin-panel">
        <h2>{text.signIn}</h2>
        <p className="signin-signed-in">
          {text.signedInAs} <strong>{auth.user!.name || auth.user!.email}</strong>
        </p>
        <div className="editor-actions">
          <Link href={isJapanese ? "/ja" : "/"} className="editor-btn editor-btn-cancel">
            {text.home}
          </Link>
          <button
            type="button"
            className="editor-btn editor-btn-primary"
            onClick={() => void auth.signOut()}
          >
            {text.signOut}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="signin-panel">
      <h2>{mode === "signup" ? text.signUp : text.signIn}</h2>

      {error !== null && <InfoBubble title={error} className="md-component-danger" />}

      <div className="signin-providers">
        <button
          type="button"
          className="editor-btn editor-btn-cancel signin-provider"
          onClick={() => void social("github")}
          disabled={busy || !providers.github}
        >
          {providers.github ? text.withGithub : text.githubUnavailable}
        </button>
        <button
          type="button"
          className="editor-btn editor-btn-cancel signin-provider"
          onClick={() => void social("google")}
          disabled={busy || !providers.google}
        >
          {providers.google ? text.withGoogle : text.googleUnavailable}
        </button>
      </div>

      <p className="signin-separator">{text.or}</p>

      <form className="signin-form" onSubmit={(e) => void submit(e)}>
        {mode === "signup" && (
          <label className="photo-field">
            <span>{text.name}</span>
            <input
              className="editor-commit-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        )}

        <label className="photo-field">
          <span>{text.email}</span>
          <input
            className="editor-commit-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="photo-field">
          <span>{text.password}</span>
          <input
            className="editor-commit-input"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
        </label>

        <div className="editor-actions">
          {busy && <span className="editor-status">{text.working}</span>}
          <button type="submit" className="editor-btn editor-btn-primary" disabled={busy}>
            {mode === "signup" ? text.submitSignUp : text.submitSignIn}
          </button>
        </div>
      </form>

      <button
        type="button"
        className="github-edit-btn signin-toggle"
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError(null);
        }}
      >
        {mode === "signup" ? text.toggleToSignIn : text.toggleToSignUp}
      </button>
    </div>
  );
}
