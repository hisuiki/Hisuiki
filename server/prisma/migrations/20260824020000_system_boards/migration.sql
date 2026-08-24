-- Every standalone route has a protected CMS board. `sitePage` remains the optional override;
-- `systemPage` identifies the canonical board used when no override is assigned.
ALTER TABLE "board" ADD COLUMN "systemPage" TEXT;
CREATE UNIQUE INDEX "board_systemPage_key" ON "board"("systemPage");
