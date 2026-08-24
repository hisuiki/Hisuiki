import { AppLink } from "../../Services/AppRouter";

export interface AboutProps {
  isJapanese: boolean;
}

/**
 * What Hisuiki is, for someone who has just arrived. A page rather than a tab beside the feed: it is
 * read once, and a permanent tab spent prime space on it every visit.
 */
export default function About({ isJapanese }: AboutProps) {
  if (isJapanese) {
    return (
      <div className="about-page">
        <h1>Hisuikiとは</h1>
        <p className="about-lead">
          Hisuikiはボード体験を共有するプラットフォームです。画像、文章、メディア、
          インタラクティブなウィジェットを自由に配置して、自分だけのページを作れます。
        </p>
        <p>
          アカウントごとに <code>{"{handle}"}.hisuiki.com</code> の専用スペースがあり、
          ページも見た目も自分のものです。複数のボードを作成・管理・公開でき、
          プロフィールに表示するメインの体験も選べます。
        </p>
        <p className="about-cta">
          <AppLink href="/ja">おすすめを見る</AppLink>
        </p>
      </div>
    );
  }

  return (
    <div className="about-page">
      <h1>What Hisuiki is</h1>
      <p className="about-lead">
        Hisuiki is a platform for sharing board experiences. Arrange images, writing, media, and
        interactive widgets into a page that feels like your own place.
      </p>
      <p>
        Every account gets its own space at <code>{"{handle}"}.hisuiki.com</code>, with its own pages
        and its own look. Create and publish several boards, manage them in one place, and choose the
        primary experience that becomes your profile.
      </p>
      <p className="about-cta">
        <AppLink href="/">Go to For You</AppLink>
      </p>
    </div>
  );
}
