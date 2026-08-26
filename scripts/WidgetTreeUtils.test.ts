import type { Widget } from "../src/Types/TypeRegistry";
import {
  canMoveWidgetInTree,
  duplicateWidgetInTree,
  findWidgetTreeLocation,
  insertWidgetInTree,
  moveWidgetInTree,
} from "../src/Common/Utils/WidgetTreeUtils";

const widget = (id: string, kind: Widget["kind"] = "text", children?: Widget[]): Widget => ({
  id,
  kind,
  size: "small",
  props: {},
  ...(children ? { children } : {}),
});

const root = widget("root", "container", [
  widget("one"),
  widget("box", "container", [widget("nested"), widget("nested-two")]),
  widget("three"),
]);

const checks: [string, boolean][] = [];
const check = (name: string, pass: boolean) => checks.push([name, pass]);

const reordered = moveWidgetInTree(root, "three", "root", 0);
check("reorders siblings", reordered.children?.map((item) => item.id).join(",") === "three,one,box");

const movedDown = moveWidgetInTree(root, "one", "root", 2);
check("adjusts the insertion index after removing a preceding sibling", movedDown.children?.map((item) => item.id).join(",") === "box,one,three");

const movedInside = moveWidgetInTree(root, "one", "box", 1);
check(
  "reparents at an exact child index",
  movedInside.children?.map((item) => item.id).join(",") === "box,three" &&
    movedInside.children?.[0]?.children?.map((item) => item.id).join(",") === "nested,one,nested-two",
);

const movedOut = moveWidgetInTree(root, "nested", "root", 2);
check(
  "moves a nested layer out",
  movedOut.children?.map((item) => item.id).join(",") === "one,box,nested,three",
);

check("refuses moving a container into itself", !canMoveWidgetInTree(root, "box", "box"));
check("refuses moving a container into a descendant", !canMoveWidgetInTree(root, "box", "nested"));
check("refuses moving the root", !canMoveWidgetInTree(root, "root", "box"));

const inserted = insertWidgetInTree(root, "box", 1, widget("new"));
check(
  "inserts a new widget into a container",
  findWidgetTreeLocation(inserted, "new")?.parentId === "box" &&
    findWidgetTreeLocation(inserted, "new")?.index === 1,
);

const duplicate = duplicateWidgetInTree(root, "box");
const copiedBox = duplicate.children?.[2];
check(
  "duplicates a subtree with fresh ids",
  copiedBox?.kind === "container" &&
    copiedBox.id !== "box" &&
    copiedBox.children?.[0]?.id !== "nested",
);

let failed = 0;
for (const [name, pass] of checks) {
  if (!pass) failed += 1;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
}
console.log(failed === 0 ? `\nAll ${checks.length} checks passed` : `\n${failed} of ${checks.length} FAILED`);
process.exit(failed === 0 ? 0 : 1);
