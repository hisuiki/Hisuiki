import { useEffect, useState, type FormEvent } from "react";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import { authClient } from "../../Services/AuthClient";
import { RETURN_PARAM, useAuth } from "../../Services/AuthProvider";
import { AppLink, useRouter } from "../../Services/AppRouter";
import { apiUrl } from "../../Services/AppConfig";

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
  const [error, setError] = useState<string | null>(null);
  // Empty until the server says otherwise, so a slow answer shows no social buttons rather than
  // flashing up two that might not work.
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

    fetch(apiUrl("/api/site"), { credentials: "include" })
      .then((res) => (res.ok ? (res.json() as Promise<{ socialProviders?: string[] }>) : null))
      .then((site) => {
        if (active && Array.isArray(site?.socialProviders)) setProviders(site.socialProviders);
      })
      .catch(() => {
        // Email and password still work, which is the part that never depends on a third party.
      });

    return () => {
      active = false;
    };
  }, []);

  const social = async (provider: "github" | "google") => {
    setBusy(true);
    setError(null);

    // A full redirect out to the provider and back; callbackURL is where it lands afterwards.
    const { error: failure } = await authClient.signIn.social({
      provider,
      callbackURL: returnPath(),
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
          <AppLink href={isJapanese ? "/ja" : "/"} className="editor-btn editor-btn-cancel">
            {text.home}
          </AppLink>
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

      {/* Only what this deployment is configured for. A development stack has no OAuth application
          of its own, and a button that always fails is worse than no button. */}
      {providers.length > 0 && (
        <>
          <div className="signin-providers">
            {providers.includes("github") && (
              <button
                type="button"
                className="editor-btn editor-btn-cancel signin-provider"
                onClick={() => void social("github")}
                disabled={busy}
              >
                {text.withGithub}
              </button>
            )}
            {providers.includes("google") && (
              <button
                type="button"
                className="editor-btn editor-btn-cancel signin-provider"
                onClick={() => void social("google")}
                disabled={busy}
              >
                {text.withGoogle}
              </button>
            )}
          </div>

          <p className="signin-separator">{text.or}</p>
        </>
      )}

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
