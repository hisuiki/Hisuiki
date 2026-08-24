import { flowOf } from "../../Services/LayoutUtils";
import type { WidgetProps } from "../../Types/TypeRegistry";

/**
 * A widget that holds other widgets.
 *
 * This is what makes the header a header: a container at the top anchor whose children run in a row.
 * Nothing about it is specific to being a header, which is the point — the same widget makes a
 * footer, a sidebar, or a two-column strip in the middle of a profile, depending only on where it
 * sits and which flow it is set to.
 *
 * The children arrive already rendered as a board, so dragging, nesting and the gallery stay the
 * board's business rather than being reimplemented here.
 */
export default function Container({ widget, preview, children }: WidgetProps) {

  // In a gallery tile there is nothing inside to show, and an empty box demonstrates nothing. This
  // stands in for the arrangement a container makes, laid out the way this one would lay it out.
  if (preview) {
    return (
      <div className="container-preview" data-flow={flowOf(widget)}>
        {[1, 2, 3].map((n) => (
          <span className="container-preview-slot" key={n} />
        ))}
      </div>
    );
  }

  return <>{children}</>;
}
