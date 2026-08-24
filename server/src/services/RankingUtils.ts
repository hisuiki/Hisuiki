/**
 * Ranking for the "for you" feed.
 *
 * The shape is borrowed from Twitter's open-sourced recommendation algorithm, minus the parts that
 * need machine learning and a social graph neither of which exists here. What is worth borrowing is
 * their finding about *relative* engagement value: in their heavy ranker a reply is worth far more
 * than a like, and a repost roughly twenty times a like. The reasoning generalises — a like costs a
 * tap, a comment costs a sentence — so the weights below keep those proportions without pretending
 * to their precision.
 *
 * Also borrowed, from their post-selection stage rather than the ranker: author diversity. A feed
 * sorted purely by score turns into one prolific account, so consecutive posts by the same author
 * are pushed apart afterwards.
 *
 * @see https://github.com/twitter/the-algorithm
 */
import type { Post } from "../generated/prisma/client.js";

/** Relative to a like at 1. Proportions from the heavy ranker, not its absolute values. */
const WEIGHT = {
  like: 1,
  repost: 20,
  comment: 40,
};

/**
 * Hours before a post's score halves. Short, because this is a feed and not an archive: a day-old
 * post needs real engagement to still outrank something posted an hour ago.
 */
const HALF_LIFE_HOURS = 8;

/** How far a viewer's own post is lifted, so they can see what they just published. */
const OWN_POST_BOOST = 1.6;

/** Only recent enough posts get that lift; older ones rank on their merits like anything else. */
const OWN_POST_BOOST_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface RankablePost extends Post {
  authorId: string;
  _count: { likes: number; comments: number; reposts: number };
}

/**
 * Engagement, decayed by age. Log-scaled because the difference between 0 and 10 likes says much
 * more about a post than the difference between 500 and 510, and linear scoring lets one popular
 * post dominate every page of the feed for a day.
 */
export function scorePost(post: RankablePost, viewerId?: string): number {
  const engagement =
    post._count.likes * WEIGHT.like +
    post._count.reposts * WEIGHT.repost +
    post._count.comments * WEIGHT.comment;

  const published = (post.publishedAt ?? post.createdAt).getTime();
  const ageHours = Math.max(0, (Date.now() - published) / 3_600_000);
  const decay = Math.pow(0.5, ageHours / HALF_LIFE_HOURS);

  // +1 so a post with no engagement still scores on recency alone rather than zeroing out.
  const base = Math.log1p(engagement) + 1;

  const isOwnAndRecent =
    viewerId !== undefined &&
    post.authorId === viewerId &&
    Date.now() - published < OWN_POST_BOOST_WINDOW_MS;

  return base * decay * (isOwnAndRecent ? OWN_POST_BOOST : 1);
}

/**
 * Reorders so no two consecutive posts share an author, without otherwise disturbing the ranking.
 * A post that cannot be separated stays where it is rather than being dropped — this thins out a
 * run, it does not hide anyone.
 */
export function spreadAuthors<T extends { authorId: string }>(posts: T[]): T[] {
  const result: T[] = [];
  const held: T[] = [];

  for (const post of posts) {
    if (result.length > 0 && result[result.length - 1]!.authorId === post.authorId) {
      held.push(post);
      continue;
    }

    result.push(post);

    // Once a different author has broken the run, the held-back post can follow.
    const releasable = held.findIndex((candidate) => candidate.authorId !== post.authorId);
    if (releasable >= 0) result.push(...held.splice(releasable, 1));
  }

  return [...result, ...held];
}

/** The feed: scored, sorted, then spread so one author cannot occupy a whole screen. */
export function rankFeed<T extends RankablePost>(posts: T[], viewerId?: string): T[] {
  const scored = posts
    .map((post) => ({ post, score: scorePost(post, viewerId) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.post);

  return spreadAuthors(scored);
}
