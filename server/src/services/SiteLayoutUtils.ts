/**
 * Widget inheritance for the three standalone website pages.
 *
 * Page boards remain complete documents so each one can be edited and restored on its own. Widgets
 * marked `site` are copied between those documents when one is saved; widgets marked `page` are
 * deliberate local overrides and are never replaced by that synchronization.
 */

type Inheritance = "site" | "page";

interface LayoutWidget {
  id?: unknown;
  props?: Record<string, unknown>;
  children?: unknown;
  [key: string]: unknown;
}

interface LayoutDocument {
  root?: unknown;
  [key: string]: unknown;
}

const asWidget = (value: unknown): LayoutWidget | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as LayoutWidget)
    : null;

const childrenOf = (widget: LayoutWidget): LayoutWidget[] =>
  Array.isArray(widget.children)
    ? widget.children.map(asWidget).filter((child): child is LayoutWidget => child !== null)
    : [];

const explicitInheritance = (widget: LayoutWidget): Inheritance | null => {
  const value = widget.props?.inheritance;
  return value === "site" || value === "page" ? value : null;
};

const isShared = (widget: LayoutWidget, parentShared = false): boolean => {
  const explicit = explicitInheritance(widget);
  if (explicit) return explicit === "site";
  if (parentShared) return true;

  const role = widget.props?.role;
  const anchor = widget.props?.anchor;
  return role === "header" || role === "footer" || anchor === "top" || anchor === "bottom";
};

/** A structural slot lets older documents with different generated ids still share their chrome. */
const slotOf = (widget: LayoutWidget): string => {
  const anchor = widget.props?.anchor;
  if (typeof anchor === "string") return `anchor:${anchor}`;
  const role = widget.props?.role;
  if (typeof role === "string") return `role:${role}`;
  return typeof widget.id === "string" ? `id:${widget.id}` : "";
};

const sameSlot = (left: LayoutWidget, right: LayoutWidget): boolean => {
  if (typeof left.id === "string" && left.id === right.id) return true;
  const leftSlot = slotOf(left);
  return leftSlot !== "" && leftSlot === slotOf(right);
};

const cloneWidget = (widget: LayoutWidget): LayoutWidget => ({
  ...widget,
  props: widget.props ? { ...widget.props } : undefined,
  ...(Array.isArray(widget.children) ? { children: childrenOf(widget).map(cloneWidget) } : {}),
});

/** Copies one shared subtree while retaining every explicit page-level override below it. */
function mergeSharedWidget(source: LayoutWidget, target: LayoutWidget | null): LayoutWidget {
  if (target && explicitInheritance(target) === "page") return cloneWidget(target);

  const sourceChildren = childrenOf(source);
  const targetChildren = target ? childrenOf(target) : [];
  if (!Array.isArray(source.children)) return cloneWidget(source);

  const mergedChildren: LayoutWidget[] = [];
  const consumedTargets = new Set<LayoutWidget>();

  for (const sourceChild of sourceChildren) {
    const targetChild = targetChildren.find((candidate) => sameSlot(sourceChild, candidate)) ?? null;
    if (targetChild) consumedTargets.add(targetChild);

    if (explicitInheritance(sourceChild) === "page") {
      // This child belongs only to the page being saved. Other pages retain their own version.
      if (targetChild) mergedChildren.push(cloneWidget(targetChild));
      continue;
    }

    mergedChildren.push(mergeSharedWidget(sourceChild, targetChild));
  }

  // A page can add local children to a shared header/footer. They survive global edits even when
  // the source page does not contain a widget in the same slot.
  for (const targetChild of targetChildren) {
    if (!consumedTargets.has(targetChild) && explicitInheritance(targetChild) === "page") {
      mergedChildren.push(cloneWidget(targetChild));
    }
  }

  return {
    ...target,
    ...source,
    props: source.props ? { ...source.props } : undefined,
    children: mergedChildren,
  };
}

/** Synchronizes explicitly site-wide widgets nested inside otherwise page-local structure. */
function synchronizeNestedShared(
  source: LayoutWidget,
  target: LayoutWidget,
  previous: LayoutWidget | null,
): LayoutWidget {
  const sourceChildren = childrenOf(source);
  const previousChildren = previous ? childrenOf(previous) : [];
  let targetChildren = childrenOf(target);

  for (const previousChild of previousChildren.filter((child) => explicitInheritance(child) === "site")) {
    if (sourceChildren.some((child) => sameSlot(previousChild, child))) continue;
    targetChildren = targetChildren.filter(
      (candidate) => !sameSlot(previousChild, candidate) || explicitInheritance(candidate) === "page",
    );
  }

  for (const sourceChild of sourceChildren) {
    const index = targetChildren.findIndex((candidate) => sameSlot(sourceChild, candidate));
    const targetChild = index === -1 ? null : targetChildren[index]!;
    const previousChild = previousChildren.find((candidate) => sameSlot(sourceChild, candidate)) ?? null;

    if (explicitInheritance(sourceChild) === "site") {
      if (targetChild && explicitInheritance(targetChild) === "page") continue;
      const next = mergeSharedWidget(sourceChild, targetChild);
      if (index === -1) targetChildren.push(next);
      else targetChildren = [...targetChildren.slice(0, index), next, ...targetChildren.slice(index + 1)];
      continue;
    }

    // Header/footer branches and their inherited descendants were handled by mergeSharedWidget.
    if (isShared(sourceChild)) continue;

    if (targetChild && Array.isArray(sourceChild.children)) {
      const next = synchronizeNestedShared(sourceChild, targetChild, previousChild);
      targetChildren = [...targetChildren.slice(0, index), next, ...targetChildren.slice(index + 1)];
    }
  }

  return { ...target, children: targetChildren };
}

/**
 * Applies the shared widgets from a saved system page to another system page.
 *
 * `previousSourceLayout` distinguishes a globally deleted widget from a page that merely changed
 * its copy to `page`. In the latter case the other pages keep the last shared version.
 */
export function synchronizeSiteLayout(
  sourceLayout: unknown,
  targetLayout: unknown,
  previousSourceLayout?: unknown,
): unknown {
  const sourceDocument = asWidget(sourceLayout) as LayoutDocument | null;
  const targetDocument = asWidget(targetLayout) as LayoutDocument | null;
  const previousDocument = asWidget(previousSourceLayout) as LayoutDocument | null;
  const sourceRoot = asWidget(sourceDocument?.root);
  const targetRoot = asWidget(targetDocument?.root);
  const previousRoot = asWidget(previousDocument?.root);

  if (!sourceDocument || !sourceRoot) return targetLayout;
  // Empty system-board documents all render the same shipped default. Once one is edited, copying
  // its complete document gives untouched peers a concrete version of that same layout.
  if (!targetDocument || !targetRoot) return { ...sourceDocument, root: cloneWidget(sourceRoot) };

  const sourceChildren = childrenOf(sourceRoot);
  const previousChildren = previousRoot ? childrenOf(previousRoot) : [];
  let targetChildren = childrenOf(targetRoot);

  // A shared top-level widget that vanished altogether was deleted globally. A same-slot local
  // widget is an override, so it deliberately does not trigger this removal.
  for (const previousChild of previousChildren.filter((child) => isShared(child))) {
    if (sourceChildren.some((child) => sameSlot(previousChild, child))) continue;
    targetChildren = targetChildren.filter(
      (candidate) => !sameSlot(previousChild, candidate) || explicitInheritance(candidate) === "page",
    );
  }

  for (const sourceChild of sourceChildren.filter((child) => isShared(child))) {
    const index = targetChildren.findIndex((candidate) => sameSlot(sourceChild, candidate));
    if (index === -1) {
      targetChildren.push(mergeSharedWidget(sourceChild, null));
      continue;
    }

    const targetChild = targetChildren[index]!;
    if (explicitInheritance(targetChild) === "page") continue;
    targetChildren = [
      ...targetChildren.slice(0, index),
      mergeSharedWidget(sourceChild, targetChild),
      ...targetChildren.slice(index + 1),
    ];
  }

  const withTopLevel = { ...targetRoot, children: targetChildren };
  return {
    ...targetDocument,
    root: synchronizeNestedShared(sourceRoot, withTopLevel, previousRoot),
  };
}
