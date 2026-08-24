-- A site page is a board selected by an owner, not a static component or a second layout system.
ALTER TABLE "board" ADD COLUMN "sitePage" TEXT;
CREATE UNIQUE INDEX "board_sitePage_key" ON "board"("sitePage");
