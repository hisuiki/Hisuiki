export type InspectorAlignment =
  | "left"
  | "horizontalCenter"
  | "right"
  | "top"
  | "verticalCenter"
  | "bottom";

export type InspectorDistribution = "horizontal" | "vertical";

export type InspectorLayoutAction =
  | { kind: "align"; alignment: InspectorAlignment }
  | { kind: "distribute"; axis: InspectorDistribution };

/** A widget's resolved grid footprint, whether it was persisted or auto-placed by the browser. */
export interface InspectorGridItem {
  id: string;
  col: number;
  row: number;
  span: number;
  rows: number;
}
