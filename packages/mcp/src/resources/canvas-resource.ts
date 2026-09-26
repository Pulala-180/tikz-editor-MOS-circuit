import { readCanvasState, listSketches } from "../canvas-bridge.js";

export function registerResources(server: any) {
  server.resource(
    "active-canvas",
    "tikz://active-canvas",
    {
      description: "当前活动画板的 TikZ 完整源码",
      mimeType: "text/x-tex"
    },
    async () => {
      const state = readCanvasState();
      return {
        contents: [
          {
            uri: "tikz://active-canvas",
            mimeType: "text/x-tex",
            text: state.source || "% Empty canvas\n\\begin{tikzpicture}\n\\end{tikzpicture}"
          }
        ]
      };
    }
  );

  server.resource(
    "sketches",
    "tikz://sketches",
    {
      description: "草稿箱 Sketch 目录中的全部工程文件清单",
      mimeType: "application/json"
    },
    async () => {
      const list = listSketches();
      return {
        contents: [
          {
            uri: "tikz://sketches",
            mimeType: "application/json",
            text: JSON.stringify(list, null, 2)
          }
        ]
      };
    }
  );
}
