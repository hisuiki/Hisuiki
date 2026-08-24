// Mirrors the API's response contracts in server/src.
import type { ProfileLayout } from "./WidgetTypes";

export interface PageMeta {
  title: string;
  description: string;
  author: string;
  lastEdited: string;
}

export interface Page {
  path: string;
  content: string;
  renderedHtml: string;
  contentType: string;
  found: boolean;
  meta: PageMeta;
}

export interface PageRaw {
  path: string;
  rawContent: string;
  found: boolean;
}

/** One stored generation of a page, as the history view lists it. */
export interface PageRevision {
  generation: string;
  date: string;
  message: string;
  description: string;
  /** Empty for revisions written before the editor recorded one. */
  authorName: string;
  sizeBytes: number;
}

export interface ArticleMetadata {
  slug: string;
  isHome: boolean;
  title: string;
  description: string;
  author: string;
  lastEdited: string;
  lastEditedIso: string;
  created: string;
}

export interface AuthUser {
  id: string;
  /** Empty when the account has not set one; fall back to the email's local part. */
  name: string;
  email: string;
  /** Avatar URL, empty for accounts without one. */
  image: string;
}

export interface BingWallpaper {
  imageUrl: string;
  title: string;
  copyright: string;
  date: string;
}


export interface PhotoAuthor {
  id: string;
  name: string;
  image: string;
}

export interface PhotoPost {
  id: string;
  /** Logical blob paths, kept alongside the absolute URLs so an edit can round-trip them. */
  full: string;
  thumb: string;
  fullUrl: string;
  thumbUrl: string;
  /** Intrinsic pixel size of the stored image; the grid uses it to reserve the right box. */
  width: number;
  height: number;
  caption: string;
  alt: string;
  tags: string[];
  author: PhotoAuthor;
  postedAt: string;
  editedAt: string;
  likeCount: number;
  commentCount: number;
  likedByViewer: boolean;
  editableByViewer: boolean;
}

export interface PhotoComment {
  id: string;
  author: PhotoAuthor;
  body: string;
  postedAt: string;
  deletableByViewer: boolean;
}

export interface PhotoDetail extends PhotoPost {
  comments: PhotoComment[];
}

/** A link a profile adds to the header. Stored as JSON on the profile, always read and written whole. */
export interface HeaderLink {
  label: string;
  href: string;
}

/** One image attached to a post. */
export interface PostMediaSummary {
  id: string;
  path: string;
  thumbPath: string | null;
  width: number;
  height: number;
  alt: string;
}

/**
 * A post as the feed and profile routes return it. `author`, `media` and `_count` are not optional:
 * every route that serves this shape includes them, and typing them as optional pushed a null check
 * into each call site instead.
 */
export interface PostSummary {
  id: string;
  slug: string | null;
  title: string | null;
  body: string;
  renderedHtml: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    image: string | null;
    profile: { handle: string | null } | null;
  };
  media: PostMediaSummary[];
  _count: { likes: number; comments: number; reposts: number };
}

/** A page a profile writes for itself, as listed in settings. */
export interface ProfilePageSummary {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
  inNav: boolean;
  position: number;
}

/** A widget experience as returned by discovery, profile, and management APIs. */
export interface BoardSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  layout: ProfileLayout;
  isPrimary: boolean;
  sitePage: "home" | "explore" | "about" | null;
  systemPage: "home" | "explore" | "about" | null;
  publishedAt: string | null;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string;
    image: string | null;
    profile: { handle: string | null } | null;
  };
}
