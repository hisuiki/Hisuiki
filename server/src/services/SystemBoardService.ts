import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "./PrismaService.js";

export const SITE_PAGES = ["home", "explore", "about"] as const;
export type SitePage = (typeof SITE_PAGES)[number];

const TITLES: Record<SitePage, string> = {
  home: "Home",
  explore: "Explore",
  about: "About",
};

/**
 * Creates the three protected site boards once an owner exists to administer them.
 *
 * Board ownership is retained so the existing editor and audit trail keep one authorization model.
 * Site-owner authorization still allows another configured owner to edit them later. Existing
 * published defaults are copied as a migration bridge; an empty document renders the app's shipped
 * widget layout and becomes a complete stored layout on the first edit.
 */
export async function ensureSystemBoards(ownerId: string): Promise<void> {
  const [existing, publishedDefault] = await Promise.all([
    prisma.board.findMany({ where: { systemPage: { in: [...SITE_PAGES] } }, select: { systemPage: true } }),
    prisma.siteSetting.findUnique({ where: { key: "defaultLayout" } }),
  ]);
  const present = new Set(existing.map((board) => board.systemPage));
  const missing = SITE_PAGES.filter((page) => !present.has(page));
  if (missing.length === 0) return;

  const layout = (publishedDefault?.value ?? {}) as Prisma.InputJsonValue;
  try {
    await prisma.$transaction(
      missing.map((page) => prisma.board.create({
        data: {
          id: randomUUID(),
          ownerId,
          slug: `system-${page}-${randomUUID().slice(0, 8)}`,
          title: TITLES[page],
          description: `System board for the ${TITLES[page]} page.`,
          layout,
          systemPage: page,
          publishedAt: new Date(),
        },
      })),
    );
  } catch (error) {
    // Two owner requests may bootstrap at the same instant. The unique systemPage index makes one
    // transaction the winner; once every page now exists, the other request is also successful.
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002" ||
      (await prisma.board.count({ where: { systemPage: { in: [...SITE_PAGES] } } })) !== SITE_PAGES.length
    ) {
      throw error;
    }
  }
}
