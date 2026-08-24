-- Boards turn the one layout stored on a profile into a first-class, shareable CMS document.
CREATE TABLE "board" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "layout" JSONB NOT NULL DEFAULT '{}',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "board_ownerId_slug_key" ON "board"("ownerId", "slug");
CREATE INDEX "board_ownerId_isPrimary_idx" ON "board"("ownerId", "isPrimary");
CREATE INDEX "board_publishedAt_viewCount_idx" ON "board"("publishedAt", "viewCount");

ALTER TABLE "board" ADD CONSTRAINT "board_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve every existing profile experience as that person's first board. gen_random_uuid() is
-- built into supported PostgreSQL versions and is cast to text because application ids are opaque.
INSERT INTO "board" (
  "id", "ownerId", "slug", "title", "layout", "isPrimary", "publishedAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  p."userId",
  'home',
  CASE WHEN trim(u."name") = '' THEN 'My board' ELSE u."name" || '''s board' END,
  p."layout",
  true,
  CURRENT_TIMESTAMP,
  p."createdAt",
  p."updatedAt"
FROM "profile" p
JOIN "user" u ON u."id" = p."userId";
