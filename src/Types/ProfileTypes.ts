import type { HeaderLink } from "./ContentTypes";

export interface ProfileData {
  userId: string;
  handle: string | null;
  headline: string | null;
  bio: string | null;
  avatarPath: string | null;
  /** Shown on the profile itself, separate from the header's navigation links. */
  profileLinks: HeaderLink[];
  publicEmail: string | null;
  location: string | null;
  pronouns: string | null;
  /** Present on a public lookup, which joins the account for its display name and avatar. */
  user?: { id: string; name: string; image: string | null };
}
