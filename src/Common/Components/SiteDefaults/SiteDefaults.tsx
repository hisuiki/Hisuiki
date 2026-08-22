import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { writeLayout } from "../../../Services/layout";
import { usePageLayout } from "../../../Services/pageLayout";
import {
  clearSiteDefaults,
  fetchSite,
  fetchSiteDefaults,
  publishSiteDefaults,
} from "../../../Services/site";
import ConfirmDialog from "../ConfirmDialog/ConfirmDialog";
import { Note } from "../Inspector/fields";

/**
 * Publishing this page as the one new accounts start from.
 *
 * Site owners only, and hidden entirely for everyone else — it is not a control most people should
 * see, let alone one that fails when pressed.
 */
export default function SiteDefaults() {
  const { t } = useTranslation();
  const { root, page } = usePageLayout();

  const [owner, setOwner] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"publish" | "clear" | null>(null);

  useEffect(() => {
    let active = true;

    void fetchSite()
      .then((site) => {
        if (!active || !site.isOwner) return;
        setOwner(true);
        return fetchSiteDefaults();
      })
      .then((defaults) => {
        if (active && defaults) setPublishedAt(defaults.publishedAt);
      })
      .catch(() => {
        // Not an owner, or the endpoint is unreachable; the section stays hidden.
      });

    return () => {
      active = false;
    };
  }, []);

  if (!owner) return null;

  const run = async (what: "publish" | "clear") => {
    setBusy(true);
    setError(null);
    try {
      const next =
        what === "publish" ? await publishSiteDefaults(writeLayout(root, page)) : await clearSiteDefaults();
      setPublishedAt(next.publishedAt);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <div className="site-defaults">
      <p className="site-defaults-title">{t("siteDefaults.title")}</p>
      <Note>
        {publishedAt
          ? t("siteDefaults.published", { when: new Date(publishedAt).toLocaleDateString() })
          : t("siteDefaults.none")}
      </Note>

      {error !== null && <p className="editor-status is-error">{error}</p>}

      <div className="site-defaults-actions">
        <button
          type="button"
          className="widget-btn"
          disabled={busy}
          onClick={() => setConfirming("publish")}
        >
          {t("siteDefaults.publish")}
        </button>
        {publishedAt && (
          <button
            type="button"
            className="widget-btn is-danger"
            disabled={busy}
            onClick={() => setConfirming("clear")}
          >
            {t("siteDefaults.clear")}
          </button>
        )}
      </div>

      {confirming !== null && (
        <ConfirmDialog
          title={t(`siteDefaults.${confirming}Title`)}
          message={t(`siteDefaults.${confirming}Message`)}
          confirmLabel={t(`siteDefaults.${confirming}`)}
          cancelLabel={t("board.cancel")}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void run(confirming)}
        />
      )}
    </div>
  );
}
