import { useEffect, useState, type ReactNode } from "react";
import { fetchFeed } from "../../../Services/ContentApiService";
import { fetchMyProfile, fetchProfile } from "../../../Services/ProfileService";
import { usePageLayout } from "../../../Services/PageLayoutProvider";
import { resolveRoute } from "../../../Services/AppRouter";
import { useAuth } from "../../../Services/AuthProvider";
import type { ProfileScope } from "../../../Types/TypeRegistry";
import { ProfileScopeProvider } from "../../../Widgets/WidgetRegistry";

/**
 * The profile the page is about, in scope for every widget on it.
 *
 * Hoisted to the shell rather than living inside a profile component: widgets are placed by their
 * owner, so a bio or a heatmap can end up in a sidebar, and it should still have something to show.
 * Also decides whether the page is being arranged, which is a property of the route and the viewer
 * rather than of any one widget.
 */
export default function PageScope({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { setEditing, board, displayPathname } = usePageLayout();
  const route = resolveRoute(displayPathname);

  const wanted =
    route?.kind === "profile" || route?.kind === "board"
      ? route.handle
      : route?.kind === "board-edit"
        ? board?.owner.profile?.handle ?? null
        : null;

  // Tagged with what it was loaded for, so leaving a profile clears the scope by derivation rather
  // than by writing state from an effect.
  const [loaded, setLoaded] = useState<{ for: string; scope: ProfileScope } | null>(null);
  const scope = loaded && loaded.for === wanted ? loaded.scope : null;

  useEffect(() => {
    if (!wanted) return;

    let active = true;

    void (async () => {
      try {
        const handle = wanted === "@me" ? (await fetchMyProfile()).handle : wanted;
        if (!handle) return;

        const [profile, posts] = await Promise.all([
          fetchProfile(handle),
          fetchFeed({ author: handle, sort: "recent" }),
        ]);
        if (!active) return;

        const readme = posts.find((p) => p.slug === "README" || p.title === "README") ?? null;
        setLoaded({
          for: wanted,
          scope: {
            profile,
            posts,
            readme,
            timeline: posts.filter((p) => p.id !== readme?.id),
            handle,
          },
        });
      } catch {
        // No profile to put in scope; the widgets that need one render nothing.
      }
    })();

    return () => {
      active = false;
    };
  }, [wanted]);

  const canEdit =
    route?.kind === "board-edit" &&
    auth.isSignedIn &&
    board !== null;

  useEffect(() => {
    setEditing(Boolean(canEdit));
    return () => setEditing(false);
  }, [canEdit, setEditing]);

  if (!scope) return <>{children}</>;

  return <ProfileScopeProvider value={scope}>{children}</ProfileScopeProvider>;
}
