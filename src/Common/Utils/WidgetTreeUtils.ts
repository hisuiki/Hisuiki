import { findInTree, isContainer, newId, removeFromTree } from "../../Services/LayoutUtils";
import type { Widget } from "../../Types/TypeRegistry";

export interface WidgetTreeLocation {
  parentId: string;
  index: number;
  widget: Widget;
}

/** Locates a widget in its parent's ordered child list. The root itself has no location. */
export function findWidgetTreeLocation(root: Widget, id: string): WidgetTreeLocation | null {
  const visit = (parent: Widget): WidgetTreeLocation | null => {
    const children = parent.children ?? [];
    for (let index = 0; index < children.length; index += 1) {
      const widget = children[index]!;
      if (widget.id === id) return { parentId: parent.id, index, widget };
      const nested = visit(widget);
      if (nested) return nested;
    }
    return null;
  };

  return visit(root);
}

const insertAt = (root: Widget, parentId: string, index: number, widget: Widget): Widget => {
  if (root.id === parentId) {
    const children = [...(root.children ?? [])];
    children.splice(Math.min(children.length, Math.max(0, index)), 0, widget);
    return { ...root, children };
  }

  return {
    ...root,
    children: (root.children ?? []).map((child) =>
      findInTree(child, parentId) === null ? child : insertAt(child, parentId, index, widget),
    ),
  };
};

/** Whether a layer can move into the requested parent without creating a recursive tree. */
export function canMoveWidgetInTree(root: Widget, id: string, parentId: string): boolean {
  if (id === root.id || id === parentId) return false;
  const source = findInTree(root, id);
  const parent = findInTree(root, parentId);
  if (!source || !parent || (!isContainer(parent) && parent.id !== root.id)) return false;
  return findInTree(source, parentId) === null;
}

/**
 * Moves a layer to an exact place in a parent's ordered child list.
 *
 * Grid coordinates are removed from the moved layer: keeping its former cell would make changing
 * its order in Layers appear to do nothing, and coordinates from a different parent are invalid.
 */
export function moveWidgetInTree(root: Widget, id: string, parentId: string, index: number): Widget {
  if (!canMoveWidgetInTree(root, id, parentId)) return root;

  const source = findWidgetTreeLocation(root, id);
  if (!source) return root;

  const without = removeFromTree(root, id);
  const target = findInTree(without, parentId);
  if (!target) return root;

  const adjustedIndex = source.parentId === parentId && source.index < index ? index - 1 : index;
  const insertionIndex = Math.max(0, Math.min(adjustedIndex, target.children?.length ?? 0));

  const props = { ...(source.widget.props ?? {}) };
  delete props.col;
  delete props.row;
  if (source.parentId !== parentId && parentId !== root.id) delete props.anchor;

  return insertAt(without, parentId, insertionIndex, { ...source.widget, props });
}

/** Inserts a new layer at an exact location, refusing duplicate ids and non-container parents. */
export function insertWidgetInTree(root: Widget, parentId: string, index: number, widget: Widget): Widget {
  if (findInTree(root, widget.id)) return root;
  const parent = findInTree(root, parentId);
  if (!parent || (!isContainer(parent) && parent.id !== root.id)) return root;
  return insertAt(root, parentId, index, widget);
}

const copyWidget = (source: Widget): Widget => ({
  ...source,
  id: newId(),
  props: source.props ? { ...source.props } : undefined,
  style: source.style ? { ...source.style } : undefined,
  children: source.children?.map(copyWidget),
});

/** Duplicates a complete subtree beside its source without overlapping the source grid cell. */
export function duplicateWidgetInTree(root: Widget, id: string): Widget {
  const source = findWidgetTreeLocation(root, id);
  if (!source) return root;

  const duplicate = copyWidget(source.widget);
  const props = { ...(duplicate.props ?? {}) };
  delete props.col;
  delete props.row;
  return insertAt(root, source.parentId, source.index + 1, { ...duplicate, props });
}
