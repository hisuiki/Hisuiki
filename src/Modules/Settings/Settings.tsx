import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import InfoBubble from "../../Common/Components/InfoBubble/InfoBubble";
import Skeleton from "../../Common/Components/Skeleton/Skeleton";
import { useAuth } from "../../Services/AuthProvider";
import { apiUrl } from "../../Services/AppConfig";
import { fetchMyProfile, updateMyProfile } from "../../Services/ProfileService";
import type { ProfileData } from "../../Types/TypeRegistry";

/** The account. How a page looks is decided on the page, in the Inspector. */
export default function Settings() {
  const { t } = useTranslation();
  const auth = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [handle, setHandle] = useState("");
  const [headline, setHeadline] = useState("");
  const [bio, setBio] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [location, setLocation] = useState("");
  const [publicEmail, setPublicEmail] = useState("");

  useEffect(() => {
    if (!auth.initializing && !auth.isSignedIn) auth.redirectToLogin();
  }, [auth.isSignedIn, auth.initializing, auth]);

  const load = (data: ProfileData) => {
    setHandle(data.handle ?? "");
    setHeadline(data.headline ?? "");
    setBio(data.bio ?? "");
    setPronouns(data.pronouns ?? "");
    setLocation(data.location ?? "");
    setPublicEmail(data.publicEmail ?? "");
  };

  useEffect(() => {
    if (!auth.isSignedIn) return;

    let active = true;
    fetchMyProfile()
      .then((data) => {
        if (!active) return;
        load(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [auth.isSignedIn]);

  if (auth.initializing || (!auth.isSignedIn && loading)) {
    return (
      <div className="file-content" data-phase="loading">
        <Skeleton width="100%" height="200px" />
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const data = await updateMyProfile({
        handle: handle.trim() || null,
        headline: headline.trim() || null,
        bio: bio.trim() || null,
        pronouns: pronouns.trim() || null,
        location: location.trim() || null,
        publicEmail: publicEmail.trim() || null,
      });
      load(data);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t("settings.deleteConfirm"))) return;

    try {
      await fetch(apiUrl("/api/profile/me"), { method: "DELETE", credentials: "include" });
      window.location.href = "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="file-content" data-phase="ready">
      <h1>{t("settings.title")}</h1>
      {error !== null && <InfoBubble title={error} className="md-component-danger" />}

      {loading ? (
        <Skeleton width="100%" height="200px" />
      ) : (
        <form className="settings-form" onSubmit={(e) => void submit(e)}>
          <label className="photo-field">
            <span>{t("settings.handle")}</span>
            <input
              className="editor-commit-input"
              value={handle}
              onChange={(e) => {
                setHandle(e.target.value);
                setSaved(false);
              }}
              // The dash is escaped because browsers compile this with the `v` flag now, under which
              // a bare dash is reserved anywhere in a character class — not only at the end. Left
              // unescaped the pattern never compiles and the field validates nothing.
              pattern="^[a-z0-9\-]+$"
              title={t("settings.handleHint")}
              minLength={3}
              maxLength={30}
            />
            <small>{t("settings.handleHint")}</small>
          </label>

          <label className="photo-field">
            <span>{t("settings.headline")}</span>
            <input
              className="editor-commit-input"
              value={headline}
              maxLength={100}
              onChange={(e) => {
                setHeadline(e.target.value);
                setSaved(false);
              }}
            />
          </label>

          <label className="photo-field">
            <span>{t("settings.bio")}</span>
            <textarea
              className="editor-commit-input"
              value={bio}
              maxLength={500}
              style={{ minHeight: "100px", resize: "vertical" }}
              onChange={(e) => {
                setBio(e.target.value);
                setSaved(false);
              }}
            />
          </label>

          <label className="photo-field">
            <span>{t("settings.pronouns")}</span>
            <input
              className="editor-commit-input"
              value={pronouns}
              maxLength={40}
              onChange={(e) => {
                setPronouns(e.target.value);
                setSaved(false);
              }}
            />
          </label>

          <label className="photo-field">
            <span>{t("settings.location")}</span>
            <input
              className="editor-commit-input"
              value={location}
              maxLength={80}
              onChange={(e) => {
                setLocation(e.target.value);
                setSaved(false);
              }}
            />
          </label>

          <label className="photo-field">
            <span>{t("settings.publicEmail")}</span>
            <input
              className="editor-commit-input"
              type="email"
              value={publicEmail}
              maxLength={120}
              onChange={(e) => {
                setPublicEmail(e.target.value);
                setSaved(false);
              }}
            />
            <small>{t("settings.publicEmailHint")}</small>
          </label>

          <div className="editor-actions">
            {saved && <span className="editor-status">{t("save.saved")}</span>}
            <button type="submit" className="editor-btn editor-btn-primary" disabled={saving}>
              {saving ? t("save.saving") : t("settings.save")}
            </button>
          </div>

          <hr className="settings-rule" />

          <h2 className="settings-danger-title">{t("settings.advanced")}</h2>
          <div className="settings-danger">
            <p>{t("settings.deleteWarning")}</p>
            <button type="button" className="editor-btn settings-delete" onClick={() => void remove()}>
              {t("settings.delete")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
