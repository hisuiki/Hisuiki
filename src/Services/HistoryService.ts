/**
 * A page's edit history, read from the assets bucket's own object versions.
 *
 * This replaced reconstructing history from the repository's patches/ folder: the editor now writes
 * markdown straight to the bucket with the author and message in custom metadata, so each stored
 * generation *is* a revision. The diff between one generation and the one before it is computed
 * here, in the browser — the two revisions are already being fetched, and diffing two short markdown
 * files is not worth a server round trip or a dependency.
 */
import { fetchPageHistory, fetchPageVersion } from "./ContentApiService";
import type { PageRevision } from "../Types/TypeRegistry";

export type { PageRevision } from "../Types/TypeRegistry";

export type DiffLineType = "context" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  text: string;
}

/** One `@@ ... @@` hunk, in the shape the history view renders. */
export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

/** The markdown as it stood before this hunk — context + removed lines. */
export const hunkOldText = (hunk: DiffHunk): string =>
  hunk.lines.filter((l) => l.type !== "added").map((l) => l.text).join("\n");

/** The markdown as it stands after this hunk — context + added lines. */
export const hunkNewText = (hunk: DiffHunk): string =>
  hunk.lines.filter((l) => l.type !== "removed").map((l) => l.text).join("\n");

/** Unchanged lines kept either side of a change, so a hunk reads in context. */
const CONTEXT_LINES = 3;

/**
 * Above this, the quadratic table below costs more memory than the result is worth. A page that
 * large is not something anyone reads a line diff of anyway.
 */
const MAX_DIFFABLE_LINES = 4000;

export async function getRevisions(filePath: string): Promise<PageRevision[]> {
  return fetchPageHistory(filePath);
}

/**
 * The diff introduced by `generation`. The base is the generation stored immediately before it;
 * the oldest revision has none, so it renders as an addition of the whole file.
 */
export async function getRevisionDiff(
  filePath: string,
  generation: string,
  previousGeneration: string | null
): Promise<DiffHunk[]> {
  const [after, before] = await Promise.all([
    fetchPageVersion(filePath, generation),
    previousGeneration ? fetchPageVersion(filePath, previousGeneration) : Promise.resolve(""),
  ]);

  return diffLines(before, after);
}

/** Longest common subsequence over lines, then the two files walked against it. */
function diffLines(before: string, after: string): DiffHunk[] {
  const oldLines = before === "" ? [] : before.replace(/\r\n/g, "\n").split("\n");
  const newLines = after === "" ? [] : after.replace(/\r\n/g, "\n").split("\n");

  if (oldLines.length > MAX_DIFFABLE_LINES || newLines.length > MAX_DIFFABLE_LINES) {
    return [
      {
        header: "@@ whole file @@",
        lines: newLines.map((text) => ({ type: "added" as const, text })),
      },
    ];
  }

  const lengths = lcsTable(oldLines, newLines);
  const changes: DiffLine[] = [];

  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      changes.push({ type: "context", text: oldLines[i]! });
      i++;
      j++;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      changes.push({ type: "removed", text: oldLines[i]! });
      i++;
    } else {
      changes.push({ type: "added", text: newLines[j]! });
      j++;
    }
  }
  while (i < oldLines.length) changes.push({ type: "removed", text: oldLines[i++]! });
  while (j < newLines.length) changes.push({ type: "added", text: newLines[j++]! });

  return groupIntoHunks(changes);
}

function lcsTable(oldLines: string[], newLines: string[]): number[][] {
  // lengths[i][j] is the LCS length of oldLines[i..] and newLines[j..], so the walk above can read
  // it forwards without reconstructing the sequence itself.
  const lengths: number[][] = Array.from({ length: oldLines.length + 1 }, () =>
    new Array<number>(newLines.length + 1).fill(0)
  );

  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        oldLines[i] === newLines[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }

  return lengths;
}

/** Runs of change, each padded with context and labelled with its line range in the new file. */
function groupIntoHunks(changes: DiffLine[]): DiffHunk[] {
  const changedAt = changes
    .map((line, index) => (line.type === "context" ? -1 : index))
    .filter((index) => index >= 0);

  if (changedAt.length === 0) return [];

  const hunks: DiffHunk[] = [];
  let start = Math.max(0, changedAt[0]! - CONTEXT_LINES);
  let end = Math.min(changes.length - 1, changedAt[0]! + CONTEXT_LINES);

  for (const index of changedAt.slice(1)) {
    // Close enough that their context windows touch: one hunk reads better than two.
    if (index - CONTEXT_LINES <= end + 1) {
      end = Math.min(changes.length - 1, index + CONTEXT_LINES);
      continue;
    }

    hunks.push(makeHunk(changes, start, end));
    start = Math.max(0, index - CONTEXT_LINES);
    end = Math.min(changes.length - 1, index + CONTEXT_LINES);
  }

  hunks.push(makeHunk(changes, start, end));
  return hunks;
}

function makeHunk(changes: DiffLine[], start: number, end: number): DiffHunk {
  const lines = changes.slice(start, end + 1);
  const added = lines.filter((l) => l.type !== "removed").length;
  const removed = lines.filter((l) => l.type !== "added").length;

  return { header: `@@ -${start + 1},${removed} +${start + 1},${added} @@`, lines };
}
