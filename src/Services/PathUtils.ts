const JA_SUFFIX = ".ja";

export const isJapanesePath = (slug: string): boolean => slug.endsWith(JA_SUFFIX);

export const isPostsIndexPath = (slug: string): boolean =>
  slug === "posts-index" || slug === "posts-index.ja";

export const isPostArticlePath = (slug: string, isHome: boolean): boolean =>
  !isHome && !isPostsIndexPath(slug);

export function articleRoute(slug: string): string {
  const ja = isJapanesePath(slug);
  const coreSlug = ja ? slug.slice(0, -JA_SUFFIX.length) : slug;
  return `/posts/${coreSlug}${ja ? "/ja" : ""}`;
}

export function postsFor<T extends { slug: string; isHome?: boolean }>(
  articles: T[],
  japanese: boolean
): T[] {
  return articles.filter(
    (a) => isPostArticlePath(a.slug, a.isHome ?? false) && isJapanesePath(a.slug) === japanese
  );
}
