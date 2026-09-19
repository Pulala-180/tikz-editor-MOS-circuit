import {
  RiAlignItemBottomLine,
  RiAlignItemHorizontalCenterLine,
  RiAlignItemLeftLine,
  RiAlignItemRightLine,
  RiAlignItemTopLine,
  RiAlignItemVerticalCenterLine,
  RiSplitCellsHorizontal,
  RiSplitCellsVertical
} from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";
import { alignSelection, distributeSelection } from "../editor-commands";

type ArrangeCommandContext = Parameters<typeof alignSelection>[0];

export type MultiArrangeAction = {
  id:
    | "align-left"
    | "align-center"
    | "align-right"
    | "align-top"
    | "align-middle"
    | "align-bottom"
    | "distribute-horizontal"
    | "distribute-vertical";
  group: "align" | "distribute";
  label: string;
  icon: RemixiconComponentType;
  run: (context: ArrangeCommandContext) => void;
};

export const MULTI_ARRANGE_ACTIONS: readonly MultiArrangeAction[] = [
  {
    id: "align-left",
    group: "align",
    label: "左对齐",
    icon: RiAlignItemLeftLine,
    run: (context) => {
      alignSelection(context, "left");
    }
  },
  {
    id: "align-center",
    group: "align",
    label: "水平居中",
    icon: RiAlignItemHorizontalCenterLine,
    run: (context) => {
      alignSelection(context, "center");
    }
  },
  {
    id: "align-right",
    group: "align",
    label: "右对齐",
    icon: RiAlignItemRightLine,
    run: (context) => {
      alignSelection(context, "right");
    }
  },
  {
    id: "align-top",
    group: "align",
    label: "顶对齐",
    icon: RiAlignItemTopLine,
    run: (context) => {
      alignSelection(context, "top");
    }
  },
  {
    id: "align-middle",
    group: "align",
    label: "垂直居中",
    icon: RiAlignItemVerticalCenterLine,
    run: (context) => {
      alignSelection(context, "middle");
    }
  },
  {
    id: "align-bottom",
    group: "align",
    label: "底对齐",
    icon: RiAlignItemBottomLine,
    run: (context) => {
      alignSelection(context, "bottom");
    }
  },
  {
    id: "distribute-horizontal",
    group: "distribute",
    label: "水平等距分布",
    icon: RiSplitCellsHorizontal,
    run: (context) => {
      distributeSelection(context, "horizontal");
    }
  },
  {
    id: "distribute-vertical",
    group: "distribute",
    label: "垂直等距分布",
    icon: RiSplitCellsVertical,
    run: (context) => {
      distributeSelection(context, "vertical");
    }
  }
];
