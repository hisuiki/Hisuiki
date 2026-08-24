import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Anchored from "../../Common/Components/Anchored/Anchored";
import HeadlineLogo from "../../Common/Components/HeadlineLogo/HeadlineLogo";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { apexHref, AppLink, profileHref } from "../../Services/AppRouter";
import { fetchMyProfile } from "../../Services/ProfileService";
import { signInHref, useAuth } from "../../Services/AuthProvider";
import { fetchSite } from "../../Services/SiteService";

/**
 * The account tile, and the menu behind it.
 *
 * The menu is portalled out of the page rather than positioned inside it: this widget can be placed
 * anywhere, including inside a container that clips or one that establishes its own stacking
 * context, and a menu that disappears depending on where its tile was dragged is worse than no menu.
 */
export default function Account() {
  const { t } = useTranslation();
  const auth = useAuth();

  const [open, setOpen] = useState(false);
  const tileRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    if (!auth.isSignedIn) return;

    let active = true;
    Promise.all([fetchMyProfile(), fetchSite()])
      .then(([profile, site]) => {
        if (!active) return;
        if (profile.handle) setHandle(profile.handle);
        setIsOwner(site.isOwner);
      })
      .catch(() => {
        // Without a handle the menu still works; only the profile link is unavailable.
      });

    return () => {
      active = false;
    };
  }, [auth.isSignedIn]);

  // The panel is portalled to <body>, so containment has to be tested against it as well as against
  // the tile it hangs from.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if ((target as Element)?.closest?.(".metro-dropdown-menu")) return;
      setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const name = auth.isSignedIn && auth.user ? auth.user.name || "Hisuiki" : "Hisuiki";

  return (
    <div className="metro-avatar-container" ref={wrapRef}>
      <button
        className="metro-avatar-tile"
        ref={tileRef}
        aria-label={t("account.menu")}
        aria-expanded={open}
        title={name}
        onClick={() => setOpen(!open)}
      >
        {auth.isSignedIn && auth.user?.image ? (
          <SmartImage
            src={auth.user.image}
            alt={name}
            width="100%"
            height="100%"
            style={{ objectFit: "cover", display: "block" }}
          />
        ) : (
          <HeadlineLogo />
        )}
      </button>

      {open && (
        <Anchored anchor={tileRef} align="right" className="metro-dropdown-menu" gap={4}>
          {auth.isSignedIn ? (
            <>
              <div className="metro-dropdown-identity">
                <div className="metro-dropdown-name">{auth.user?.name || "User"}</div>
                <div className="metro-dropdown-email">{auth.user?.email}</div>
              </div>

              <a
                href={handle ? profileHref(handle) : "#"}
                className="metro-dropdown-item"
                onClick={(e) => {
                  if (!handle) {
                    e.preventDefault();
                    alert(t("account.needHandle"));
                  } else setOpen(false);
                }}
              >
                {t("account.profile")}
              </a>

              <AppLink href={apexHref("/boards")} className="metro-dropdown-item" onClick={() => setOpen(false)}>
                {t("account.boards", { defaultValue: "Boards" })}
              </AppLink>

              {(isOwner || import.meta.env.DEV) && (
                <AppLink href={apexHref("/admin")} className="metro-dropdown-item" onClick={() => setOpen(false)}>
                  {t("account.admin", { defaultValue: "Admin" })}
                </AppLink>
              )}

              <AppLink href="/settings" className="metro-dropdown-item" onClick={() => setOpen(false)}>
                {t("account.settings")}
              </AppLink>

              <button
                className="metro-dropdown-item"
                onClick={() => {
                  setOpen(false);
                  void auth.signOut();
                }}
              >
                {t("account.signOut")}
              </button>
            </>
          ) : (
            <a
              href={signInHref(false)}
              className="metro-dropdown-item"
              onClick={() => setOpen(false)}
            >
              {t("account.signIn")}
            </a>
          )}
        </Anchored>
      )}
    </div>
  );
}
