import type { EditAction } from "tikz-editor/edit/actions";
import type { DragFormatPrecision } from "tikz-editor/edit/format";
import type { NodeAnchorTarget } from "tikz-editor/semantic/types";
import type { WorldPoint } from "../coords/types";

export function resolveHandleDragAction(input: {
  handleId: string;
  newWorld: WorldPoint;
  activeEndpointAnchor?: NodeAnchorTarget | null;
  baselineSource?: string;
  formatPrecision?: DragFormatPrecision;
}): EditAction {
  return {
    kind: "moveHandle",
    handleId: input.handleId,
    newWorld: input.newWorld,
    formatPrecision: input.formatPrecision
  };
}

export function shouldCommitHandleAnchorOnPointerUp(input: {
  snapshotSource: string;
  source: string;
  activeEndpointAnchor: NodeAnchorTarget | null;
}): boolean {
  return input.activeEndpointAnchor != null;
}
