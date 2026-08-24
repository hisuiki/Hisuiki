import { useProfileScope } from "../ProfileScopeProvider";

/**
 * The README post, shown as the bio.
 *
 * It is a post rather than a text column so it is written with the same editor, sanitised by the
 * same pipeline and versioned the same way as anything else. The HTML is sanitised on the server,
 * with the post's own stylesheet scoped to this container.
 */
export default function Bio() {
  const scope = useProfileScope();
  const readme = scope?.readme;
  if (!readme?.renderedHtml) return null;

  return (
    <section
      className="profile-bio"
      data-post={readme.id}
      dangerouslySetInnerHTML={{ __html: readme.renderedHtml }}
    />
  );
}
