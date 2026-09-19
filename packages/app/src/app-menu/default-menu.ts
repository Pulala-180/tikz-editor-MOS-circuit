import { APP_MENU_COMMAND_IDS, type AppMenuDefinition } from "./types.js";

export const APP_MENU_DEFINITION = [
  {
    id: "file",
    label: "文件",
    items: [
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.NEW_DOCUMENT,
        label: "新建",
        accelerator: "CmdOrCtrl+N"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.OPEN_DOCUMENT,
        label: "打开..."
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.OPEN_FROM_ARXIV,
        label: "从 arXiv 打开...",
        platforms: ["desktop"]
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.OPEN_EXAMPLE,
        label: "打开示例..."
      },
      {
        kind: "recent-files",
        label: "打开最近",
        platforms: ["desktop"]
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.SAVE_DOCUMENT,
        label: "保存",
        accelerator: "CmdOrCtrl+S"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.SAVE_DOCUMENT_AS,
        label: "另存为..."
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.CLOSE_DOCUMENT,
        label: "关闭标签页",
        accelerator: "CmdOrCtrl+W"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.CLOSE_ALL_DOCUMENTS,
        label: "关闭所有标签页"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.CLEAR_CANVAS,
        label: "清空画布"
      },
      { kind: "separator" },
      {
        kind: "submenu",
        label: "导入",
        items: [
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.IMPORT_IPE,
            label: "导入 Ipe (.ipe)..."
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.IMPORT_POWERPOINT,
            label: "导入 PowerPoint (.pptx)..."
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.IMPORT_SVG,
            label: "导入 SVG..."
          }
        ]
      },
      {
        kind: "submenu",
        label: "导出",
        items: [
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.EXPORT_SVG_DOWNLOAD,
            label: "导出 SVG..."
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.EXPORT_STANDALONE_LATEX_DOWNLOAD,
            label: "导出 Standalone LaTeX"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.EXPORT_PDF_DOWNLOAD,
            label: "导出 PDF..."
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.EXPORT_PNG_DOWNLOAD,
            label: "导出 PNG..."
          }
        ]
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.EXPORT_SVG_COPY,
        label: "复制为 SVG"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.SHOW_COMPILED_PICTURE,
        label: "查看编译图像..."
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.OPEN_SETTINGS,
        label: "设置...",
        accelerator: "CmdOrCtrl+,"
      },
      { kind: "separator", platforms: ["desktop-windows", "desktop-linux"] },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.QUIT_APP,
        label: "退出",
        accelerator: "CmdOrCtrl+Q",
        platforms: ["desktop-windows", "desktop-linux"]
      }
    ]
  },
  {
    id: "edit",
    label: "编辑",
    items: [
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.UNDO,
        label: "撤销",
        accelerator: "CmdOrCtrl+Z"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.REDO,
        label: "重做",
        accelerator: "CmdOrCtrl+Shift+Z",
        platforms: ["web", "desktop", "desktop-macos"]
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.REDO,
        label: "重做",
        accelerator: "CmdOrCtrl+Y",
        platforms: ["desktop-windows"]
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.CUT,
        label: "剪切",
        accelerator: "CmdOrCtrl+X"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.COPY,
        label: "复制",
        accelerator: "CmdOrCtrl+C"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.PASTE,
        label: "粘贴",
        accelerator: "CmdOrCtrl+V"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.DELETE,
        label: "删除",
        accelerator: "Delete"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.DUPLICATE,
        label: "创建副本",
        accelerator: "CmdOrCtrl+D"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.GROUP,
        label: "成组",
        accelerator: "CmdOrCtrl+G"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.UNGROUP,
        label: "解组",
        accelerator: "CmdOrCtrl+Shift+G"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.REPEAT,
        label: "重复..."
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.FLATTEN_FOREACH,
        label: "展开 foreach 循环"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.FORMAT_TIKZ,
        label: "格式化 TikZ 代码",
        accelerator: "CmdOrCtrl+Shift+F"
      },
      { kind: "separator" },
      {
        kind: "submenu",
        label: "对齐",
        items: [
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.ALIGN_LEFT,
            label: "左对齐"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.ALIGN_CENTER,
            label: "水平居中"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.ALIGN_RIGHT,
            label: "右对齐"
          },
          { kind: "separator" },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.ALIGN_TOP,
            label: "顶对齐"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.ALIGN_MIDDLE,
            label: "垂直居中"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.ALIGN_BOTTOM,
            label: "底对齐"
          }
        ]
      },
      {
        kind: "submenu",
        label: "变换",
        items: [
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.ROTATE_LEFT_90,
            label: "向左旋转 90°"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.ROTATE_RIGHT_90,
            label: "向右旋转 90°"
          },
          { kind: "separator" },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.FLIP_HORIZONTAL,
            label: "水平翻转"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.FLIP_VERTICAL,
            label: "垂直翻转"
          }
        ]
      },
      {
        kind: "submenu",
        label: "分布",
        items: [
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.DISTRIBUTE_HORIZONTAL,
            label: "水平分布"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.DISTRIBUTE_VERTICAL,
            label: "垂直分布"
          }
        ]
      },
      {
        kind: "submenu",
        label: "层级",
        items: [
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.SEND_TO_BACK,
            label: "置底"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.SEND_BACKWARD,
            label: "下移一层"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.BRING_FORWARD,
            label: "上移一层"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.BRING_TO_FRONT,
            label: "置顶"
          }
        ]
      }
    ]
  },
  {
    id: "path",
    label: "路径",
    items: [
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.PATH_SPLIT,
        label: "拆分路径"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.PATH_JOIN,
        label: "合并路径"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.PATH_REVERSE,
        label: "反转路径"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.PATH_CLOSE,
        label: "闭合路径"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.PATH_OPEN,
        label: "开放路径"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.PATH_DELETE_POINT,
        label: "删除锚点"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.PATH_POINT_CORNER,
        label: "转为尖角"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.PATH_POINT_SMOOTH,
        label: "转为平滑"
      }
    ]
  },
  {
    id: "insert",
    label: "插入",
    items: [
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_NODE,
        label: "节点",
        accelerator: "N"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_SHAPE,
        label: "形状",
        accelerator: "S"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_MATRIX,
        label: "矩阵"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_LINE,
        label: "直线",
        accelerator: "L"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_ARROW,
        label: "箭头",
        accelerator: "A"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_BEZIER,
        label: "贝塞尔曲线",
        accelerator: "B"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_PATH,
        label: "路径",
        accelerator: "P"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_FREEHAND,
        label: "自由手绘",
        accelerator: "F"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_GRID,
        label: "网格"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_RECT,
        label: "矩形",
        accelerator: "R"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_ELLIPSE,
        label: "椭圆",
        accelerator: "E"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_CIRCLE,
        label: "圆形",
        accelerator: "C"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.INSERT_EQUATION,
        label: "公式",
        accelerator: "CmdOrCtrl+Shift+E"
      }
    ]
  },
  {
    id: "view",
    label: "视图",
    items: [
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.FIT_TO_CONTENT,
        label: "自适应内容聚焦",
        accelerator: "F"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.ZOOM_IN,
        label: "放大",
        accelerator: "CmdOrCtrl+="
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.ZOOM_OUT,
        label: "缩小",
        accelerator: "CmdOrCtrl+-"
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_GRID,
        label: "显示网格"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_RULERS,
        label: "显示标尺"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_GUIDES,
        label: "显示参考线"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_TRANSPARENCY_GRID,
        label: "显示透明网格"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_INFINITE_CANVAS,
        label: "无限画布"
      },
      {
        kind: "submenu",
        label: "网格吸附",
        items: [
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.TOGGLE_SNAP_GRID,
            label: "吸附到网格"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.TOGGLE_SNAP_GUIDES,
            label: "吸附到参考线"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.TOGGLE_SNAP_OBJECT_POINTS,
            label: "吸附到对象关键点"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.TOGGLE_SNAP_OBJECT_GAPS,
            label: "吸附到对象间隙"
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.TOGGLE_SNAP_HAPTICS,
            label: "触觉吸附反馈",
            platforms: ["desktop-macos"]
          }
        ]
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_SOURCE_PANEL,
        label: "显示源码面板"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_INSPECTOR_PANEL,
        label: "显示属性面板"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_OBJECTS_PANEL,
        label: "显示对象面板"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_STYLES_PANEL,
        label: "显示样式面板"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_FIGURES_PANEL,
        label: "显示图元面板"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_ASSISTANT_PANEL,
        label: "显示 AI 助手面板",
        platforms: ["desktop"]
      },
      { kind: "separator" },
      {
        kind: "submenu",
        label: "工作区",
        items: [
          { kind: "workspace-list" },
          { kind: "separator" },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.SAVE_WORKSPACE_AS,
            label: "将当前布局另存为..."
          },
          {
            kind: "command",
            commandId: APP_MENU_COMMAND_IDS.MANAGE_WORKSPACES,
            label: "管理工作区..."
          }
        ]
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.TOGGLE_DEV_PANEL,
        label: "开发者面板",
        accelerator: "CmdOrCtrl+Shift+D"
      }
    ]
  },
  {
    id: "help",
    label: "帮助",
    items: [
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.CHECK_FOR_UPDATES,
        label: "检查更新...",
        platforms: ["desktop-windows", "desktop-linux"]
      },
      { kind: "separator", platforms: ["desktop-windows", "desktop-linux"] },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.OPEN_PGF_TIKZ_MANUAL,
        label: "打开 PGF/TikZ 手册"
      },
      { kind: "separator", platforms: ["web"] },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.SHOW_ABOUT,
        label: "关于 TikZ Editor Web",
        platforms: ["web"]
      },
      { kind: "separator" },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.OPEN_GITHUB_REPOSITORY,
        label: "GitHub 仓库"
      },
      {
        kind: "command",
        commandId: APP_MENU_COMMAND_IDS.OPEN_GITHUB_ISSUES,
        label: "提交反馈与问题..."
      }
    ]
  }
] as const satisfies AppMenuDefinition;
