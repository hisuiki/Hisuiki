import ExternalLink from "../../Common/Components/ExternalLink/ExternalLink";
import { useProfileScope } from "../ProfileScopeProvider";

/** The links listed on this profile. */
export default function Links() {
  const scope = useProfileScope();
  if (!scope || scope.profile.profileLinks.length === 0) return null;

  return (
    <ul className="profile-links">
      {scope.profile.profileLinks.map((link) => (
        <li key={link.href}>
          <ExternalLink href={link.href} label={link.label}>
            {link.label}
          </ExternalLink>
        </li>
      ))}
    </ul>
  );
}
