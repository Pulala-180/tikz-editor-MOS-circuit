import { z } from "zod";
import { CATALOG } from "../circuit/templates.js";
import { buildCircuit } from "../circuit/builder.js";
import { writeCanvasCode } from "../canvas-bridge.js";

export const listComponentsSchema = {};

export function handleListComponents() {
  const list = Object.values(CATALOG).map((item) => ({
    type: item.type,
    description: item.description,
    ports: item.ports.map((p) => `${p.name} (局部坐标: ${p.x}, ${p.y})`),
    defaultLabel: item.defaultLabel
  }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(list, null, 2)
      }
    ]
  };
}

export const applyCircuitSchema = {
  components: z.array(
    z.object({
      id: z.string().describe("器件唯一ID，如 M1, R1, I1, V1"),
      type: z.string().describe("器件类型：resistor, nmos, pmos, current_source, voltage_source, gnd, vdd"),
      x: z.number().default(0).describe("器件放置的 X 坐标（单位 cm）"),
      y: z.number().default(0).describe("器件放置的 Y 坐标（单位 cm）"),
      label: z.string().optional().describe("标注文本，如 '$R_D$', '$M_1$'"),
      direction: z.enum(["down", "up"]).optional().describe("电流源方向，down=从上到下，up=从下到上")
    })
  ).describe("器件列表"),
  wires: z.array(
    z.object({
      id: z.string().optional(),
      from: z.union([z.string(), z.object({ x: z.number(), y: z.number() })]).describe("起点（如 'M1.D' 或 绝对坐标 {x: 0, y: 1}）"),
      to: z.union([z.string(), z.object({ x: z.number(), y: z.number() })]).describe("终点（如 'R1.P1' 或 绝对坐标）"),
      route: z.enum(["orthogonal", "hv", "vh", "straight"]).optional().describe("走线方式：orthogonal(默认自动折线), hv(-|), vh(|-), straight(--)")
    })
  ).optional().describe("导线连接列表"),
  junctionDots: z.boolean().optional().default(true).describe("三线及以上交汇点是否自动打实心焊点圆点"),
  writeToCanvas: z.boolean().optional().default(true).describe("是否直接将生成的代码写入画板并触发热更新")
};

export function handleApplyCircuit(args: z.infer<z.ZodObject<typeof applyCircuitSchema>>) {
  const result = buildCircuit({
    components: args.components,
    wires: args.wires,
    junctionDots: args.junctionDots
  });

  if (!result.ok) {
    return {
      content: [
        {
          type: "text" as const,
          text: `❌ 电路构建失败: ${result.error}`
        }
      ]
    };
  }

  let writeStatus = "未写入画板（writeToCanvas=false）";
  if (args.writeToCanvas) {
    const writeRes = writeCanvasCode(result.code);
    writeStatus = writeRes.success ? `已成功写入画板: ${writeRes.filePath}` : `写入画板失败: ${writeRes.error}`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            status: "success",
            writeStatus,
            ports: result.ports,
            junctions: result.junctions,
            code: result.code
          },
          null,
          2
        )
      }
    ]
  };
}
