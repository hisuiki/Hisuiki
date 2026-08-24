import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import { AppLink } from "../../Services/AppRouter";

interface VersionInfo {
  version: string;
  build: number;
}

/** Used if version.json is missing or malformed. */
const FALLBACK_VERSION = "2.1";

/** Copyright, the build this is, and the way to the About page. */
export default function Colophon() {
  const { t } = useTranslation();
  const [version, setVersion] = useState(FALLBACK_VERSION);

  // The deploy workflow bumps version.json's "build" on every push to main, so this tracks the
  // deployed build rather than a hand-edited constant.
  useEffect(() => {
    let active = true;

    fetch("/version.json")
      .then((r) => (r.ok ? (r.json() as Promise<VersionInfo>) : null))
      .then((info) => {
        if (active && info) setVersion(`${info.version}.${info.build}`);
      })
      .catch(() => {
        // Keep the static fallback.
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="projAbout">
      <p>{t("footer.rights", { year: new Date().getUTCFullYear() })}</p>
      <AppLink href="/about" className="footer-about-link">
        {t("footer.about")}
      </AppLink>
      <ExternalLink
        href="https://github.com/powerm1nt/Hisuiki"
        label="Hisuiki on GitHub"
        className="buildinfo"
      >
        hisuiki<span>@</span>
        {version}
      </ExternalLink>
    </div>
  );
}
