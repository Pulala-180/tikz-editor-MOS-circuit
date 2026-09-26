import { describe, expect, it } from "vitest";
import { formatCm } from "../packages/app/src/ui/canvas-panel/wire-routing-helper.js";
import { getCircuitComponentSnippet } from "../packages/app/src/ui/canvas-panel/circuit-snippets.js";
import { PT_PER_CM } from "../packages/core/src/edit/format.js";

describe("电路引脚吸附引线精度与零错位测试 (Pin-Snap Lead Zero-Misalignment)", () => {
  it("老大的实测场景：M1 在 3 位小数位置 (-6.776, 0.88) 时，在 node_M1.d 吸附生成 W 引线不产生截断错位", () => {
    // M1 scope 偏移量为 (-6.776, 0.88) cm
    // node_M1.d 相对坐标为 (0.73, 0.5) cm
    // node_M1.d 的绝对世界坐标为 (-6.776 + 0.73 = -6.046 cm, 0.88 + 0.5 = 1.38 cm)
    const pinWorldXCm = -6.046;
    const pinWorldYCm = 1.38;
    const pinWorldXPt = pinWorldXCm * PT_PER_CM;
    const pinWorldYPt = pinWorldYCm * PT_PER_CM;

    // 工具放置时通过 formatCm(nodeAt.x) 提取坐标
    const xCm = formatCm(pinWorldXPt);
    const yCm = formatCm(pinWorldYPt);

    // 验证 formatCm 保留了 3 位有效小数，绝对不发生 -6.05 粗暴截断
    expect(xCm).toBe("-6.046");
    expect(yCm).toBe("1.38");

    // 生成 W 导线（addWireLead_V_Top）
    const snippet = getCircuitComponentSnippet("addWireLead_V_Top", xCm, yCm);
    expect(snippet).not.toBeNull();

    // 验证生成的导线起点与终点：
    // 起点必须严格等于 (-6.046, 1.38)，终点为 (-6.046, 1.68)
    // 杜绝之前出现的 (-6.05, 1.38) 错位！
    expect(snippet).toBe("\\draw[line width=0.32mm, line cap=round] (-6.046,1.38) -- (-6.046,1.68);");
  });

  it("老大的实测场景：在 node_M1.g 栅极 (-6.776, 0.88) 连接水平引线时精确保持 -6.776，不截断为 -6.77", () => {
    const gateWorldXCm = -6.776;
    const gateWorldYCm = 0.88;
    const gateWorldXPt = gateWorldXCm * PT_PER_CM;
    const gateWorldYPt = gateWorldYCm * PT_PER_CM;

    const xCm = formatCm(gateWorldXPt);
    const yCm = formatCm(gateWorldYPt);

    expect(xCm).toBe("-6.776");
    expect(yCm).toBe("0.88");

    const snippetLeft = getCircuitComponentSnippet("addWireLead_H_Left", xCm, yCm);
    expect(snippetLeft).toBe("\\draw[line width=0.32mm, line cap=round] (-6.776,0.88) -- (-7.076,0.88);");
  });

  it("标准 2 位小数原理图网格点不会产生多余尾随零", () => {
    const gridXCm = 1.68;
    const gridYCm = 2.7;
    const gridXPt = gridXCm * PT_PER_CM;
    const gridYPt = gridYCm * PT_PER_CM;

    const xCm = formatCm(gridXPt);
    const yCm = formatCm(gridYPt);

    expect(xCm).toBe("1.68");
    expect(yCm).toBe("2.7");

    const snippet = getCircuitComponentSnippet("addWireLead_V_Top", xCm, yCm);
    expect(snippet).toBe("\\draw[line width=0.32mm, line cap=round] (1.68,2.7) -- (1.68,3);");
  });

  it("IO 节点在 3 位小数位置吸附时，scopeX 与端口位置数学严密吻合", () => {
    const portWorldXCm = -6.776;
    const portWorldYCm = 0.88;
    const portWorldXPt = portWorldXCm * PT_PER_CM;
    const portWorldYPt = portWorldYCm * PT_PER_CM;

    const xCm = formatCm(portWorldXPt);
    const yCm = formatCm(portWorldYPt);

    const snippet = getCircuitComponentSnippet("addIoNode_Vin_Left", xCm, yCm);
    expect(snippet).not.toBeNull();
    // scope shift 应为 -6.776 - 0.405 = -7.181
    expect(snippet).toContain("shift={(-7.181,0.88)}");
    // 内部引脚相对为 0.405，绝对位置 = -7.181 + 0.405 = -6.776，100% 吻合！
  });
});
