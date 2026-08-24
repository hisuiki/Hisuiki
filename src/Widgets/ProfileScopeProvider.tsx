import { createContext, useContext, type ReactNode } from "react";
import type { ProfileData } from "../Types/TypeRegistry";
import type { PostSummary } from "../Types/TypeRegistry";

export interface ProfileScope {
  profile: ProfileData;
  /** Everything this person has posted, newest first. */
  posts: PostSummary[];
  /** The bio post, pulled out so it is not also shown in the timeline below. */
  readme: PostSummary | null;
  /** Everything except the bio. */
  timeline: PostSummary[];
  handle: string;
  /** What the activity grid should plot, when that is not simply each post's publication date. */
  activityDates?: string[];
}

const ProfileScopeContext = createContext<ProfileScope | null>(null);

/**
 * The profile a widget is being rendered for, if any.
 *
 * Widgets are placed by their owner, not by the app, so a timeline can end up in the top bar and a
 * navigation link in the middle of a profile. Passing profile data down as props would mean every
 * surface that renders widgets had to have it — the header does not. So it comes through context,
 * and the widgets that need it return null when there is none rather than refusing to render.
 */
export function ProfileScopeProvider({
  value,
  children,
}: {
  value: ProfileScope | null;
  children: ReactNode;
}) {
  return <ProfileScopeContext.Provider value={value}>{children}</ProfileScopeContext.Provider>;
}

export const useProfileScope = (): ProfileScope | null => useContext(ProfileScopeContext);
