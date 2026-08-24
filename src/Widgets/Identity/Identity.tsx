import { useTranslation } from "react-i18next";
import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import SmartImage from "../../Common/Components/SmartImage/SmartImage";
import { assetUrl } from "../../Services/AppConfig";
import { useProfileScope } from "../ProfileScopeProvider";

/** Who this is: avatar, name, handle, headline, and the few facts that were filled in. */
export default function Identity() {
  const { t } = useTranslation();
  const scope = useProfileScope();
  if (!scope) return null;

  const { profile, handle } = scope;
  const displayName = profile.user?.name || profile.handle || handle;

  return (
    <header className="profile-head">
      <div className="profile-identity">
        {profile.avatarPath || profile.user?.image ? (
          <SmartImage
            src={profile.avatarPath ? assetUrl(profile.avatarPath) : profile.user!.image!}
            alt=""
            width="96px"
            height="96px"
            style={{ borderRadius: "50%" }}
          />
        ) : (
          <div className="profile-avatar-fallback" aria-hidden="true">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="profile-names">
          <h1 className="profile-name">{displayName}</h1>
          <p className="profile-handle">@{profile.handle ?? handle}</p>
          {profile.headline && <p className="profile-headline">{profile.headline}</p>}
        </div>
      </div>

      {/* Only the fields that were filled in: a row of empty labels tells a visitor nothing and
          makes every sparse profile look unfinished. */}
      <dl className="profile-facts">
        {profile.pronouns && (
          <div className="profile-fact">
            <dt>{t("profile.pronouns")}</dt>
            <dd>{profile.pronouns}</dd>
          </div>
        )}
        {profile.location && (
          <div className="profile-fact">
            <dt>{t("profile.location")}</dt>
            <dd>{profile.location}</dd>
          </div>
        )}
        {profile.publicEmail && (
          <div className="profile-fact">
            <dt>{t("profile.email")}</dt>
            <dd>
              <a href={`mailto:${profile.publicEmail}`}>{profile.publicEmail}</a>
            </dd>
          </div>
        )}
      </dl>

      {profile.profileLinks.length > 0 && (
        <ul className="profile-links">
          {profile.profileLinks.map((link) => (
            <li key={link.href}>
              <ExternalLink href={link.href} label={link.label}>
                {link.label}
              </ExternalLink>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
