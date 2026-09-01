// Mirrors the API's response contracts in server/src.

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
  filePath: string;
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

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  image: string;
  createdAt: string;
  updatedAt: string;
  providers: string[];
  activeSessions: number;
  isOwner: boolean;
}

export interface AdminDashboard {
  viewerId: string;
  totals: {
    users: number;
    activeSessions: number;
    providers: Record<string, number>;
  };
  users: AdminUser[];
  truncated: boolean;
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
