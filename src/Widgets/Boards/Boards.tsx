import Landing from "../../Modules/Landing/Landing";
import type { WidgetProps } from "../../Types/TypeRegistry";

/** A configurable feed of published boards, using only API data returned for the selected feed. */
export default function Boards({ widget }: WidgetProps) {
  const feed = widget.props?.feed === "explore" ? "explore" : "home";
  const rawSort = widget.props?.sort;
  const sort = rawSort === "recent" || rawSort === "random" ? rawSort : "trending";
  const rawLimit = widget.props?.limit;
  const limit = typeof rawLimit === "number" ? Math.min(50, Math.max(1, Math.round(rawLimit))) : 12;

  return (
    <Landing
      tab={feed}
      config={{
        sort,
        limit,
        heading: String(widget.props?.heading ?? ""),
        showHeading: widget.props?.showHeading !== false,
        showControls: widget.props?.showControls === true,
      }}
    />
  );
}
