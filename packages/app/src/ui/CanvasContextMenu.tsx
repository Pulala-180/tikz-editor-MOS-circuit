import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  CANVAS_CONTEXT_MENU_DEFINITION,
  type CanvasContextMenuDefinition,
  type CanvasContextMenuTarget
} from "../context-menu";
import type { AppMenuCommandId, AppMenuItem } from "../app-menu";
import type { CommandOrigin, CommandBindings } from "./editor-command-runtime";
import { clampContextMenuAnchor, type ContextMenuAnchor } from "./canvas-panel/context-menu-target";
import css from "./CanvasContextMenu.module.css";

const IS_MAC_PLATFORM =
  typeof navigator !== "undefined" &&
  /(mac|iphone|ipad)/i.test(navigator.platform);

type ContextMenuInheritedStyle = CSSProperties & {
  "--app-ui-font-size"?: string;
  "--app-ui-scale"?: string;
};

function formatAccelerator(accelerator: string | undefined): string {
  if (!accelerator) {
    return "";
  }

  return accelerator
    .split("+")
    .map((part) => {
      if (part === "CmdOrCtrl") {
        return IS_MAC_PLATFORM ? "Cmd" : "Ctrl";
      }
      return part;
    })
    .join(IS_MAC_PLATFORM ? " " : "+");
}

const MENU_LABEL_TRANSLATIONS: Record<string, string> = {
  // Clipboard & Editing
  "Cut": "剪切",
  "Copy": "复制",
  "Paste": "粘贴",
  "Duplicate": "创建副本",
  "Delete": "删除",
  "Undo": "撤销",
  "Redo": "重做",
  "Repeat...": "重复...",

  // Layer Ordering
  "Bring to Front": "置于顶层",
  "Send to Back": "置于底层",
  "Bring Forward": "上移一层",
  "Send Backward": "下移一层",
  "Reorder": "调整层级",

  // Grouping
  "Group": "编组",
  "Ungroup": "解散编组",

  // Transform & Rotation & Flip
  "Transform": "变换",
  "Flip Horizontal": "水平翻转",
  "Flip Horizontally": "水平翻转",
  "Flip Vertical": "垂直翻转",
  "Flip Vertically": "垂直翻转",
  "Rotate 90°": "顺时针旋转 90°",
  "Rotate Right 90°": "顺时针旋转 90°",
  "Rotate Left 90°": "逆时针旋转 90°",

  // View & Canvas
  "Fit to Content": "适应内容",
  "Grid": "网格",
  "Rulers": "标尺",
  "Guide Lines": "参考线",
  "Snapping": "吸附",
  "Snap to Grid": "吸附到网格",
  "Snap to Guides": "吸附到参考线",
  "Snap to Object Points": "吸附到对象顶点",
  "Snap to Object Gaps": "吸附到对象间隙",

  // Alignment
  "Align": "对齐",
  "Left": "左对齐",
  "Center": "水平居中",
  "Right": "右对齐",
  "Top": "顶端对齐",
  "Middle": "垂直居中",
  "Bottom": "底端对齐",

  // Distribution
  "Distribute": "分布",
  "Horizontal": "水平分布",
  "Vertical": "垂直分布",

  // Node Actions
  "Add Label": "添加标签",
  "Add Pin": "添加引脚",
  "Position Relative To...": "相对定位到...",
  "Convert to Absolute Position": "转换为绝对坐标",
  "Edit Equation...": "编辑公式...",

  // Tree Actions
  "Add Child": "添加子节点",
  "Add Sibling Before": "在前方添加同级节点",
  "Add Sibling After": "在后方添加同级节点",

  // Matrix Actions
  "Add Row at End": "在末尾添加行",
  "Add Column at End": "在末尾添加列",
  "Transpose Matrix": "矩阵转置",
  "Insert Row Above": "在上方插入行",
  "Insert Row Below": "在下方插入行",
  "Remove Row": "删除行",
  "Insert Column Left": "在左侧插入列",
  "Insert Column Right": "在右侧插入列",
  "Remove Column": "删除列",

  // Path Actions
  "Path": "路径",
  "Delete Point": "删除锚点",
  "Point to Corner": "转换为尖角",
  "Point to Smooth": "转换为平滑点",
  "Split at Point": "在锚点处断开",
  "Split Path": "分割路径",
  "Join Paths": "连接路径",
  "Reverse Path": "反转路径",
  "Close Path": "闭合路径",
  "Open Path": "开放路径"
};

function localizeMenuLabel(label: string): string {
  return MENU_LABEL_TRANSLATIONS[label] ?? label;
}

function ContextMenuPopup({
  items,
  path,
  bindings,
  origin,
  onCommandRun
}: {
  items: readonly AppMenuItem[];
  path: string;
  bindings: CommandBindings;
  origin: CommandOrigin;
  onCommandRun: (commandId: AppMenuCommandId, origin: CommandOrigin) => void;
}) {
  const hasCheckItems = items.some(
    (item) => item.kind === "command" && bindings[item.commandId].checked != null
  );

  return (
    <div className={css.menu} role="menu">
      {items.map((item, index) => {
        const itemKey = `${path}-${index}`;
        if (item.kind === "separator") {
          return <div key={`${itemKey}-separator`} className={css.separator} role="separator" />;
        }

        if (item.kind === "submenu") {
          return (
            <div key={`${itemKey}-submenu`} className={css.submenu}>
              <div
                className={[css.item, css.submenuTrigger, hasCheckItems ? "" : css.itemNoCheck]
                  .filter(Boolean)
                  .join(" ")}
                role="menuitem"
                aria-haspopup="menu"
              >
                {hasCheckItems ? <span className={css.check} /> : null}
                <span className={css.label}>{localizeMenuLabel(item.label)}</span>
                <span className={css.submenuArrow}>›</span>
              </div>

              <div className={css.submenuPopup}>
                <ContextMenuPopup
                  items={item.items}
                  path={`${itemKey}-submenu`}
                  bindings={bindings}
                  origin={origin}
                  onCommandRun={onCommandRun}
                />
              </div>
            </div>
          );
        }
        if (item.kind === "recent-files" || item.kind === "workspace-list") {
          return null;
        }

        const binding = bindings[item.commandId];
        const role = binding.checked == null ? "menuitem" : "menuitemcheckbox";
        return (
          <button
            key={`${itemKey}-${item.commandId}`}
            type="button"
            role={role}
            aria-checked={binding.checked}
            disabled={!binding.enabled}
            className={[css.item, hasCheckItems ? "" : css.itemNoCheck].filter(Boolean).join(" ")}
            data-testid={`canvas-context-cmd-${item.commandId}`}
            onClick={() => {
              if (!binding.enabled) {
                return;
              }
              onCommandRun(item.commandId, origin);
            }}
          >
            {hasCheckItems ? <span className={css.check}>{binding.checked ? "✓" : ""}</span> : null}
            <span className={css.label}>{localizeMenuLabel(item.label)}</span>
            <span className={css.shortcut}>{formatAccelerator(item.accelerator)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function CanvasContextMenu({
  open,
  anchor,
  target,
  bindings,
  onClose,
  onCommandRun,
  containerRef,
  origin = "context-menu",
  definition = CANVAS_CONTEXT_MENU_DEFINITION
}: {
  open: boolean;
  anchor: ContextMenuAnchor;
  target: CanvasContextMenuTarget;
  bindings: CommandBindings;
  onClose: () => void;
  onCommandRun: (commandId: AppMenuCommandId, origin: CommandOrigin) => void;
  containerRef: RefObject<HTMLElement | null>;
  origin?: CommandOrigin;
  definition?: CanvasContextMenuDefinition;
}) {
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<ContextMenuAnchor>(anchor);
  const [inheritedStyle, setInheritedStyle] = useState<ContextMenuInheritedStyle>({});

  useEffect(() => {
    if (!open) {
      return;
    }
    setPosition((current) =>
      current.x === anchor.x && current.y === anchor.y ? current : anchor
    );
  }, [anchor, open, target]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const menuRoot = menuRootRef.current;
    const container = containerRef.current;
    if (!menuRoot || !container) {
      return;
    }

    const nextPosition = clampContextMenuAnchor(
      anchor,
      {
        width: menuRoot.offsetWidth,
        height: menuRoot.offsetHeight
      },
      {
        width: container.clientWidth,
        height: container.clientHeight
      }
    );

    setPosition((current) =>
      current.x === nextPosition.x && current.y === nextPosition.y
        ? current
        : nextPosition
    );

    const computedStyle = getComputedStyle(container);
    const nextInheritedStyle: ContextMenuInheritedStyle = {
      "--app-ui-font-size": computedStyle.getPropertyValue("--app-ui-font-size").trim() || undefined,
      "--app-ui-scale": computedStyle.getPropertyValue("--app-ui-scale").trim() || undefined
    };
    setInheritedStyle((current) =>
      current["--app-ui-font-size"] === nextInheritedStyle["--app-ui-font-size"] &&
      current["--app-ui-scale"] === nextInheritedStyle["--app-ui-scale"]
        ? current
        : nextInheritedStyle
    );
  }, [anchor, containerRef, open, target]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }
      if (!menuRootRef.current?.contains(targetNode)) {
        onClose();
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    return () => { window.removeEventListener("pointerdown", onPointerDown); };
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const items = definition[target];

  const containerRect = containerRef.current?.getBoundingClientRect();
  const viewportPosition = containerRect
    ? {
        x: containerRect.left + position.x,
        y: containerRect.top + position.y
      }
    : position;
  const menu = (
    <div
      ref={menuRootRef}
      className={css.root}
      style={{
        ...inheritedStyle,
        left: `${viewportPosition.x}px`,
        top: `${viewportPosition.y}px`
      }}
      role="menu"
      data-testid="canvas-context-menu"
    >
      <ContextMenuPopup
        items={items}
        path={target}
        bindings={bindings}
        origin={origin}
        onCommandRun={(commandId, runOrigin) => {
          onCommandRun(commandId, runOrigin);
          onClose();
        }}
      />
    </div>
  );

  return typeof document === "undefined" ? menu : createPortal(menu, document.body);
}
