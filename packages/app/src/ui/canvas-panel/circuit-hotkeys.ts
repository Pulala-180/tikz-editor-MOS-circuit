import type { ToolMode } from "../../store/types";

/**
 * Port objects (`vdd-port` / generic `port`) are declared inside the `addIoNode` family so
 * they reuse the existing canvas click-insertion branch, which matches
 * `toolMode.startsWith("addIoNode")`. Every rotation/flip/switch table below therefore has
 * to claim them *before* the `addIoNode` blocks, otherwise the Vin/Vout state machine
 * would hijack them.
 */
const PORT_MODE_PREFIXES = ["addIoNode_VddPort", "addIoNode_Port"] as const;

function portModePrefix(mode: ToolMode): string | null {
  for (const prefix of PORT_MODE_PREFIXES) {
    if ((mode as string) === prefix || mode.startsWith(`${prefix}_`)) {
      return prefix;
    }
  }
  return null;
}

const PORT_ORIENTATION_SUFFIXES = ["Left", "Top", "Right", "Bottom"] as const;
type PortOrientationSuffix = (typeof PORT_ORIENTATION_SUFFIXES)[number];

function portModeOrientation(mode: ToolMode): PortOrientationSuffix {
  if (mode.endsWith("_Top")) return "Top";
  if (mode.endsWith("_Right")) return "Right";
  if (mode.endsWith("_Bottom")) return "Bottom";
  return "Left";
}

/** Clockwise rotation order for a port object: left -> top -> right -> bottom -> left. */
function rotatePortMode(mode: ToolMode): ToolMode | null {
  const prefix = portModePrefix(mode);
  if (!prefix) return null;
  const order: PortOrientationSuffix[] = ["Left", "Top", "Right", "Bottom"];
  const index = order.indexOf(portModeOrientation(mode));
  return `${prefix}_${order[(index + 1) % order.length]}` as ToolMode;
}

/**
 * 顺时针旋转 90 度规则表
 * 针对可旋转元件依次切换方向；不可旋转元件（VDD、实心节点）返回 null。
 */
export function rotateCircuitToolMode(mode: ToolMode): ToolMode | null {
  // 1. 连接线 (Wire Lead)
  if (mode.startsWith("addWireLead")) {
    if (mode === "addWireLead" || mode === "addWireLead_V_Top") return "addWireLead_H_Right";
    if (mode === "addWireLead_H_Right") return "addWireLead_V_Bottom";
    if (mode === "addWireLead_V_Bottom") return "addWireLead_H_Left";
    if (mode === "addWireLead_H_Left") return "addWireLead_V_Top";
    return "addWireLead_V_Top";
  }

  // 2. 电阻 (Resistor)
  if (mode.startsWith("addResistor")) {
    if (mode === "addResistor" || mode === "addResistor_V_Top") return "addResistor_H_Right";
    if (mode === "addResistor_H_Right") return "addResistor_V_Bottom";
    if (mode === "addResistor_V_Bottom") return "addResistor_H_Left";
    if (mode === "addResistor_H_Left") return "addResistor_V_Top";
    return "addResistor_V_Top";
  }

  // 3. 电容 (Capacitor)
  if (mode.startsWith("addCapacitor")) {
    if (mode === "addCapacitor" || mode === "addCapacitor_V_Top") return "addCapacitor_H_Right";
    if (mode === "addCapacitor_H_Right") return "addCapacitor_V_Bottom";
    if (mode === "addCapacitor_V_Bottom") return "addCapacitor_H_Left";
    if (mode === "addCapacitor_H_Left") return "addCapacitor_V_Top";
    return "addCapacitor_V_Top";
  }

  // 4. 电压源 / 交流小信号源 (Voltage Source)
  if (mode.startsWith("addVoltageSource")) {
    if (mode === "addVoltageSource" || mode === "addVoltageSource_Up_Top" || mode === "addVoltageSource_V_Top") return "addVoltageSource_Right_Right";
    if (mode === "addVoltageSource_Right_Right" || mode === "addVoltageSource_H_Right") return "addVoltageSource_Down_Bottom";
    if (mode === "addVoltageSource_Down_Bottom" || mode === "addVoltageSource_V_Bottom") return "addVoltageSource_Left_Left";
    if (mode === "addVoltageSource_Left_Left" || mode === "addVoltageSource_H_Left") return "addVoltageSource_Up_Top";
    if (mode === "addVoltageSource_Up_Bottom") return "addVoltageSource_Right_Left";
    if (mode === "addVoltageSource_Right_Left") return "addVoltageSource_Down_Top";
    if (mode === "addVoltageSource_Down_Top") return "addVoltageSource_Left_Right";
    if (mode === "addVoltageSource_Left_Right") return "addVoltageSource_Up_Bottom";
    return "addVoltageSource_Up_Top";
  }

  // 5. 电流源 (Current Source)
  if (mode.startsWith("addCurrentSource")) {
    if (mode === "addCurrentSource" || mode === "addCurrentSource_Up_Top" || mode === "addCurrentSource_V_Top") return "addCurrentSource_Right_Right";
    if (mode === "addCurrentSource_Right_Right" || mode === "addCurrentSource_H_Right") return "addCurrentSource_Down_Bottom";
    if (mode === "addCurrentSource_Down_Bottom" || mode === "addCurrentSource_V_Bottom") return "addCurrentSource_Left_Left";
    if (mode === "addCurrentSource_Left_Left" || mode === "addCurrentSource_H_Left") return "addCurrentSource_Up_Top";
    if (mode === "addCurrentSource_Up_Bottom") return "addCurrentSource_Right_Left";
    if (mode === "addCurrentSource_Right_Left") return "addCurrentSource_Down_Top";
    if (mode === "addCurrentSource_Down_Top") return "addCurrentSource_Left_Right";
    if (mode === "addCurrentSource_Left_Right") return "addCurrentSource_Up_Bottom";
    return "addCurrentSource_Up_Top";
  }

  // 5.5 受控电流源 (Controlled Current Source)
  if (mode.startsWith("addControlledCurrentSource")) {
    if (mode === "addControlledCurrentSource" || mode === "addControlledCurrentSource_Down_Top" || mode === "addControlledCurrentSource_V_Top") return "addControlledCurrentSource_Right_Right";
    if (mode === "addControlledCurrentSource_Right_Right" || mode === "addControlledCurrentSource_H_Right") return "addControlledCurrentSource_Down_Bottom";
    if (mode === "addControlledCurrentSource_Down_Bottom" || mode === "addControlledCurrentSource_V_Bottom") return "addControlledCurrentSource_Left_Left";
    if (mode === "addControlledCurrentSource_Left_Left" || mode === "addControlledCurrentSource_H_Left") return "addControlledCurrentSource_Up_Top";
    if (mode === "addControlledCurrentSource_Up_Bottom") return "addControlledCurrentSource_Right_Left";
    if (mode === "addControlledCurrentSource_Right_Left") return "addControlledCurrentSource_Down_Top";
    if (mode === "addControlledCurrentSource_Up_Top") return "addControlledCurrentSource_Right_Left";
    if (mode === "addControlledCurrentSource_Left_Right") return "addControlledCurrentSource_Up_Bottom";
    return "addControlledCurrentSource_Down_Top";
  }

  // 6. 电流箭头 (Current Arrow)
  if (mode.startsWith("addCurrentArrow")) {
    if (mode === "addCurrentArrow" || mode === "addCurrentArrow_Up_Top" || mode === "addCurrentArrow_Up_Bottom") return "addCurrentArrow_Right_Right";
    if (mode === "addCurrentArrow_Right_Right" || mode === "addCurrentArrow_H_Right" || mode === "addCurrentArrow_Right_Left") return "addCurrentArrow_Down_Bottom";
    if (mode === "addCurrentArrow_Down_Bottom" || mode === "addCurrentArrow_Down_Top" || mode === "addCurrentArrow_V_Bottom") return "addCurrentArrow_Left_Left";
    if (mode === "addCurrentArrow_Left_Left" || mode === "addCurrentArrow_Left_Right" || mode === "addCurrentArrow_H_Left") return "addCurrentArrow_Up_Top";
    return "addCurrentArrow_Up_Top";
  }

  // 7. 接地端 (GND)
  if (mode.startsWith("addGND")) {
    if (mode === "addGND" || mode === "addGND_V_Bottom") return "addGND_H_Left";
    if (mode === "addGND_H_Left") return "addGND_V_Top";
    if (mode === "addGND_V_Top") return "addGND_H_Right";
    if (mode === "addGND_H_Right") return "addGND_V_Bottom";
    return "addGND_V_Bottom";
  }

  // 8. 端口对象 (vdd-port / port) - 四朝向轮回: Left -> Top -> Right -> Bottom -> Left
  // (必须排在 addIoNode 之前，否则会被 Vin/Vout 状态机接管)
  {
    const rotatedPort = rotatePortMode(mode);
    if (rotatedPort) return rotatedPort;
  }

  // 8.5 电源轨 (Power Rail) - 顺时针 90 度: H_Left -> V_Top -> H_Right -> V_Bottom -> H_Left
  if (mode.startsWith("addPowerRail")) {
    if (mode === "addPowerRail_V_Top") return "addPowerRail_H_Right";
    if (mode === "addPowerRail_H_Right") return "addPowerRail_V_Bottom";
    if (mode === "addPowerRail_V_Bottom") return "addPowerRail_H_Left";
    return "addPowerRail_V_Top";
  }

  // 9. IO 端口 (Terminal) - 8态轮回交替: Vin (Left -> Top -> Right -> Bottom) -> Vout (Left -> Top -> Right -> Bottom) -> Vin ...
  if (mode.startsWith("addIoNode")) {
    if (mode === "addIoNode" || mode === "addIoNode_Vin_Left") return "addIoNode_Vin_Top";
    if (mode === "addIoNode_Vin_Top") return "addIoNode_Vin_Right";
    if (mode === "addIoNode_Vin_Right") return "addIoNode_Vin_Bottom";
    if (mode === "addIoNode_Vin_Bottom") return "addIoNode_Vout_Left";
    if (mode === "addIoNode_Vout_Left") return "addIoNode_Vout_Top";
    if (mode === "addIoNode_Vout_Top") return "addIoNode_Vout_Right";
    if (mode === "addIoNode_Vout_Right") return "addIoNode_Vout_Bottom";
    if (mode === "addIoNode_Vout_Bottom") return "addIoNode_Vin_Left";
    return "addIoNode_Vin_Top";
  }

  // 9. nMOS 管 - 顺时针 90 度旋转: Left -> Top -> Right -> Bottom -> Left，保持当前引脚锚点
  if (mode.startsWith("addNMOS")) {
    const anchor = mode.endsWith("_D") ? "D" : mode.endsWith("_S") ? "S" : "G";
    if (mode.includes("Left") || mode === "addNMOS") return `addNMOS_Top_${anchor}` as ToolMode;
    if (mode.includes("Top")) return `addNMOS_Right_${anchor}` as ToolMode;
    if (mode.includes("Right")) return `addNMOS_Bottom_${anchor}` as ToolMode;
    if (mode.includes("Bottom")) return `addNMOS_Left_${anchor}` as ToolMode;
    return `addNMOS_Top_${anchor}` as ToolMode;
  }

  // 10. pMOS 管 - 顺时针 90 度旋转: Left -> Top -> Right -> Bottom -> Left，保持当前引脚锚点
  if (mode.startsWith("addPMOS")) {
    const anchor = mode.endsWith("_D") ? "D" : mode.endsWith("_S") ? "S" : "G";
    if (mode.includes("Left") || mode === "addPMOS") return `addPMOS_Top_${anchor}` as ToolMode;
    if (mode.includes("Top")) return `addPMOS_Right_${anchor}` as ToolMode;
    if (mode.includes("Right")) return `addPMOS_Bottom_${anchor}` as ToolMode;
    if (mode.includes("Bottom")) return `addPMOS_Left_${anchor}` as ToolMode;
    return `addPMOS_Top_${anchor}` as ToolMode;
  }

  // 11. VDD & 实心节点 (不可旋转)
  if (mode === "addVDD" || mode === "addDotNode") {
    return null;
  }

  return null;
}

/**
 * 沿 Y 轴对称翻转 (水平镜像: Left <-> Right, 保持当前锚点；若是竖直形态则转为水平形态)
 */
export function flipCircuitToolModeHorizontal(mode: ToolMode): ToolMode | null {
  // 1. nMOS (关于Y轴对称翻转)
  if (mode.startsWith("addNMOS")) {
    const anchor = mode.endsWith("_D") ? "D" : mode.endsWith("_S") ? "S" : "G";
    if (mode.includes("Left")) return `addNMOS_Right_${anchor}` as ToolMode;
    if (mode.includes("Right")) return `addNMOS_Left_${anchor}` as ToolMode;
    if (mode.includes("Top")) return `addNMOS_Top_${anchor === "D" ? "S" : anchor === "S" ? "D" : "G"}` as ToolMode;
    if (mode.includes("Bottom")) return `addNMOS_Bottom_${anchor === "D" ? "S" : anchor === "S" ? "D" : "G"}` as ToolMode;
    return "addNMOS_Right_G";
  }
  // 2. pMOS (关于Y轴对称翻转)
  if (mode.startsWith("addPMOS")) {
    const anchor = mode.endsWith("_D") ? "D" : mode.endsWith("_S") ? "S" : "G";
    if (mode.includes("Left")) return `addPMOS_Right_${anchor}` as ToolMode;
    if (mode.includes("Right")) return `addPMOS_Left_${anchor}` as ToolMode;
    if (mode.includes("Top")) return `addPMOS_Top_${anchor === "D" ? "S" : anchor === "S" ? "D" : "G"}` as ToolMode;
    if (mode.includes("Bottom")) return `addPMOS_Bottom_${anchor === "D" ? "S" : anchor === "S" ? "D" : "G"}` as ToolMode;
    return "addPMOS_Right_G";
  }
  // 3. 电阻
  if (mode.startsWith("addResistor")) {
    if (mode === "addResistor_H_Left") return "addResistor_H_Right";
    if (mode === "addResistor_H_Right") return "addResistor_H_Left";
    return "addResistor_H_Left";
  }
  // 4. 电容
  if (mode.startsWith("addCapacitor")) {
    if (mode === "addCapacitor_H_Left") return "addCapacitor_H_Right";
    if (mode === "addCapacitor_H_Right") return "addCapacitor_H_Left";
    return "addCapacitor_H_Left";
  }
  // 5. 电压源
  if (mode.startsWith("addVoltageSource")) {
    if (mode === "addVoltageSource_Left_Left") return "addVoltageSource_Right_Left";
    if (mode === "addVoltageSource_Right_Left" || mode === "addVoltageSource_H_Left") return "addVoltageSource_Left_Left";
    if (mode === "addVoltageSource_Left_Right") return "addVoltageSource_Right_Right";
    if (mode === "addVoltageSource_Right_Right" || mode === "addVoltageSource_H_Right") return "addVoltageSource_Left_Right";
    return "addVoltageSource_Right_Left";
  }
  // 6. 电流源
  if (mode.startsWith("addCurrentSource")) {
    if (mode === "addCurrentSource_Left_Left") return "addCurrentSource_Right_Left";
    if (mode === "addCurrentSource_Right_Left" || mode === "addCurrentSource_H_Left") return "addCurrentSource_Left_Left";
    if (mode === "addCurrentSource_Left_Right") return "addCurrentSource_Right_Right";
    if (mode === "addCurrentSource_Right_Right" || mode === "addCurrentSource_H_Right") return "addCurrentSource_Left_Right";
    return "addCurrentSource_Left_Left";
  }
  // 6.5 受控电流源
  if (mode.startsWith("addControlledCurrentSource")) {
    if (mode === "addControlledCurrentSource_Left_Left") return "addControlledCurrentSource_Right_Left";
    if (mode === "addControlledCurrentSource_Right_Left" || mode === "addControlledCurrentSource_H_Left") return "addControlledCurrentSource_Left_Left";
    if (mode === "addControlledCurrentSource_Left_Right") return "addControlledCurrentSource_Right_Right";
    if (mode === "addControlledCurrentSource_Right_Right" || mode === "addControlledCurrentSource_H_Right") return "addControlledCurrentSource_Left_Right";
    return "addControlledCurrentSource_Left_Left";
  }
  // 7. 电流箭头
  if (mode.startsWith("addCurrentArrow")) {
    if (mode === "addCurrentArrow_Left_Left") return "addCurrentArrow_Right_Left";
    if (mode === "addCurrentArrow_Right_Left" || mode === "addCurrentArrow_H_Left") return "addCurrentArrow_Left_Left";
    if (mode === "addCurrentArrow_Left_Right") return "addCurrentArrow_Right_Right";
    if (mode === "addCurrentArrow_Right_Right" || mode === "addCurrentArrow_H_Right") return "addCurrentArrow_Left_Right";
    return "addCurrentArrow_Left_Left";
  }
  // 8. GND
  if (mode.startsWith("addGND")) {
    if (mode === "addGND_H_Left") return "addGND_H_Right";
    if (mode === "addGND_H_Right") return "addGND_H_Left";
    return "addGND_H_Left";
  }
  // 8.5 端口对象 (vdd-port / port): 关于 Y 轴对称, Left <-> Right；竖直形态转水平
  // (排在 addIoNode 之前，避免被 Vin/Vout 互换逻辑接管)
  {
    const prefix = portModePrefix(mode);
    if (prefix) {
      if (mode.endsWith("_Left")) return `${prefix}_Right` as ToolMode;
      if (mode.endsWith("_Right")) return `${prefix}_Left` as ToolMode;
      return `${prefix}_Left` as ToolMode;
    }
  }
  // 8.6 电源轨 (Power Rail): 水平镜像
  if (mode.startsWith("addPowerRail")) {
    if (mode === "addPowerRail_H_Right") return "addPowerRail_H_Left";
    return "addPowerRail_H_Right";
  }
  // 9. IO 端口
  if (mode.startsWith("addIoNode")) {
    const isVout = mode.includes("Vout");
    const prefix = isVout ? "addIoNode_Vout" : "addIoNode_Vin";
    if (mode.endsWith("Left") || mode === "addIoNode") return `${prefix}_Right` as ToolMode;
    if (mode.endsWith("Right")) return `${prefix}_Left` as ToolMode;
    return `${prefix}_Left` as ToolMode;
  }
  // 10. 连接线
  if (mode.startsWith("addWireLead")) {
    if (mode === "addWireLead_H_Left") return "addWireLead_H_Right";
    if (mode === "addWireLead_H_Right") return "addWireLead_H_Left";
    return "addWireLead_H_Left";
  }
  return null;
}

/**
 * 沿 X 轴对称翻转 (垂直镜像: Top <-> Bottom / D <-> S, 保持当前开口方向；若是水平形态则转为竖直形态)
 */
export function flipCircuitToolModeVertical(mode: ToolMode): ToolMode | null {
  // 1. nMOS (D <-> S 垂直镜像; 若为 G 则切换到 D)
  if (mode.startsWith("addNMOS")) {
    const anchor = mode.endsWith("_D") ? "D" : mode.endsWith("_S") ? "S" : "G";
    if (mode.includes("Top")) return `addNMOS_Bottom_${anchor}` as ToolMode;
    if (mode.includes("Bottom")) return `addNMOS_Top_${anchor}` as ToolMode;
    if (mode.includes("Left")) return `addNMOS_Left_${anchor === "D" ? "S" : anchor === "S" ? "D" : "G"}` as ToolMode;
    if (mode.includes("Right")) return `addNMOS_Right_${anchor === "D" ? "S" : anchor === "S" ? "D" : "G"}` as ToolMode;
    return "addNMOS_Left_D";
  }
  // 2. pMOS (D <-> S 垂直镜像; 若为 G 则切换到 D)
  if (mode.startsWith("addPMOS")) {
    const anchor = mode.endsWith("_D") ? "D" : mode.endsWith("_S") ? "S" : "G";
    if (mode.includes("Top")) return `addPMOS_Bottom_${anchor}` as ToolMode;
    if (mode.includes("Bottom")) return `addPMOS_Top_${anchor}` as ToolMode;
    if (mode.includes("Left")) return `addPMOS_Left_${anchor === "D" ? "S" : anchor === "S" ? "D" : "G"}` as ToolMode;
    if (mode.includes("Right")) return `addPMOS_Right_${anchor === "D" ? "S" : anchor === "S" ? "D" : "G"}` as ToolMode;
    return "addPMOS_Left_D";
  }
  // 3. 电阻
  if (mode.startsWith("addResistor")) {
    if (mode === "addResistor_V_Top") return "addResistor_V_Bottom";
    if (mode === "addResistor_V_Bottom") return "addResistor_V_Top";
    return "addResistor_V_Bottom";
  }
  // 4. 电容
  if (mode.startsWith("addCapacitor")) {
    if (mode === "addCapacitor_V_Top") return "addCapacitor_V_Bottom";
    if (mode === "addCapacitor_V_Bottom") return "addCapacitor_V_Top";
    return "addCapacitor_V_Bottom";
  }
  // 5. 电压源
  if (mode.startsWith("addVoltageSource")) {
    if (mode === "addVoltageSource_Up_Top" || mode === "addVoltageSource_V_Top" || mode === "addVoltageSource") return "addVoltageSource_Down_Top";
    if (mode === "addVoltageSource_Down_Top") return "addVoltageSource_Up_Top";
    if (mode === "addVoltageSource_Up_Bottom" || mode === "addVoltageSource_V_Bottom") return "addVoltageSource_Down_Bottom";
    if (mode === "addVoltageSource_Down_Bottom") return "addVoltageSource_Up_Bottom";
    return "addVoltageSource_Up_Top";
  }
  // 6. 电流源
  if (mode.startsWith("addCurrentSource")) {
    if (mode === "addCurrentSource_Up_Top" || mode === "addCurrentSource_V_Top" || mode === "addCurrentSource") return "addCurrentSource_Down_Top";
    if (mode === "addCurrentSource_Down_Top") return "addCurrentSource_Up_Top";
    if (mode === "addCurrentSource_Up_Bottom" || mode === "addCurrentSource_V_Bottom") return "addCurrentSource_Down_Bottom";
    if (mode === "addCurrentSource_Down_Bottom") return "addCurrentSource_Up_Bottom";
    return "addCurrentSource_Up_Top";
  }
  // 6.5 受控电流源
  if (mode.startsWith("addControlledCurrentSource")) {
    if (mode === "addControlledCurrentSource_Up_Top" || mode === "addControlledCurrentSource_V_Top") return "addControlledCurrentSource_Down_Top";
    if (mode === "addControlledCurrentSource_Down_Top" || mode === "addControlledCurrentSource") return "addControlledCurrentSource_Up_Top";
    if (mode === "addControlledCurrentSource_Up_Bottom" || mode === "addControlledCurrentSource_V_Bottom") return "addControlledCurrentSource_Down_Bottom";
    if (mode === "addControlledCurrentSource_Down_Bottom") return "addControlledCurrentSource_Up_Bottom";
    return "addControlledCurrentSource_Down_Top";
  }
  // 7. 电流箭头
  if (mode.startsWith("addCurrentArrow")) {
    if (mode === "addCurrentArrow_Up_Top" || mode === "addCurrentArrow_V_Top" || mode === "addCurrentArrow") return "addCurrentArrow_Down_Top";
    if (mode === "addCurrentArrow_Down_Top") return "addCurrentArrow_Up_Top";
    if (mode === "addCurrentArrow_Up_Bottom" || mode === "addCurrentArrow_V_Bottom") return "addCurrentArrow_Down_Bottom";
    if (mode === "addCurrentArrow_Down_Bottom") return "addCurrentArrow_Up_Bottom";
    return "addCurrentArrow_Up_Top";
  }
  // 8. GND
  if (mode.startsWith("addGND")) {
    if (mode === "addGND_V_Top") return "addGND_V_Bottom";
    if (mode === "addGND_V_Bottom") return "addGND_V_Top";
    return "addGND_V_Bottom";
  }
  // 8.5 端口对象 (vdd-port / port): 关于 X 轴对称, Top <-> Bottom；水平形态转竖直
  {
    const prefix = portModePrefix(mode);
    if (prefix) {
      if (mode.endsWith("_Top")) return `${prefix}_Bottom` as ToolMode;
      if (mode.endsWith("_Bottom")) return `${prefix}_Top` as ToolMode;
      return `${prefix}_Top` as ToolMode;
    }
  }
  // 8.6 电源轨 (Power Rail): 垂直镜像
  if (mode.startsWith("addPowerRail")) {
    if (mode === "addPowerRail_V_Bottom") return "addPowerRail_V_Top";
    return "addPowerRail_V_Bottom";
  }
  // 9. IO 端口
  if (mode.startsWith("addIoNode")) {
    const isVout = mode.includes("Vout");
    const prefix = isVout ? "addIoNode_Vout" : "addIoNode_Vin";
    if (mode.endsWith("Top")) return `${prefix}_Bottom` as ToolMode;
    if (mode.endsWith("Bottom")) return `${prefix}_Top` as ToolMode;
    if (mode === "addIoNode_Vin_Left") return "addIoNode_Vout_Left";
    if (mode === "addIoNode_Vout_Left") return "addIoNode_Vin_Left";
    if (mode === "addIoNode_Vin_Right") return "addIoNode_Vout_Right";
    if (mode === "addIoNode_Vout_Right") return "addIoNode_Vin_Right";
    return "addIoNode_Vin_Left";
  }
  // 10. 连接线
  if (mode.startsWith("addWireLead")) {
    if (mode === "addWireLead_V_Top") return "addWireLead_V_Bottom";
    if (mode === "addWireLead_V_Bottom") return "addWireLead_V_Top";
    return "addWireLead_V_Top";
  }
  return null;
}

/**
 * 放置态带修饰键的手势：Shift+R / Ctrl+R（Mac 上 Cmd+R）= 镜像。
 *
 * 这是"复用既有镜像机制"而非新增一套：直接转发到 `flipCircuitToolModeHorizontal`——也就是
 * H / Y 键用的那条水平镜像表，所以手感与 H/Y 完全一致，元件朝向表只有一份。单独按 R 仍然是
 * `rotateCircuitToolMode` 的顺时针 90°，W/A/S/D 方向键也原样保留。
 *
 * 单独抽出来是因为两个键盘入口（window 与 viewport）都要用，且必须在"无修饰键"守卫之前判定，
 * 否则 Ctrl+R 会被守卫挡掉（甚至触发浏览器刷新）。
 */
export function mirrorCircuitToolModeWithKey(
  mode: ToolMode,
  key: string,
  modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }
): ToolMode | null {
  if (key.toLowerCase() !== "r") return null;
  if (!modifiers.shiftKey && !modifiers.ctrlKey && !modifiers.metaKey) return null;
  return flipCircuitToolModeHorizontal(mode);
}

/**
 * 处于元件放置模式时的按键切换 (W / A / S / D / G / H / V)
 */
export function switchCircuitToolModeWithKey(currentMode: ToolMode, key: string): ToolMode | null {
  const k = key.toLowerCase();

  // H / Y 键: Y 轴对称翻转 (水平镜像)
  if (k === "h" || k === "y") {
    return flipCircuitToolModeHorizontal(currentMode);
  }

  // V / X 键: X 轴对称翻转 (垂直镜像)
  if (k === "v" || k === "x") {
    return flipCircuitToolModeVertical(currentMode);
  }

  // 1. nMOS 子模式控制 (g: 切G极, d: 切D极, s: 切S极, w: 朝上, a: 朝左)
  if (currentMode.startsWith("addNMOS")) {
    const currentAnchor = currentMode.endsWith("_S") ? "S" : currentMode.endsWith("_G") ? "G" : "D";
    const dir = currentMode.includes("Top") ? "Top" : currentMode.includes("Bottom") ? "Bottom" : currentMode.includes("Right") ? "Right" : "Left";

    if (k === "g") {
      return `addNMOS_${dir}_G` as ToolMode;
    }
    if (k === "s") {
      return `addNMOS_${dir}_S` as ToolMode;
    }
    if (k === "d") {
      return `addNMOS_${dir}_D` as ToolMode;
    }
    if (k === "w") {
      return `addNMOS_Top_${currentAnchor}` as ToolMode;
    }
    if (k === "a") {
      return `addNMOS_Left_${currentAnchor}` as ToolMode;
    }
  }

  // 2. pMOS 子模式控制 (g: 切G极, d: 切D极, s: 切S极, w: 朝上, a: 朝左)
  if (currentMode.startsWith("addPMOS")) {
    const currentAnchor = currentMode.endsWith("_S") ? "S" : currentMode.endsWith("_G") ? "G" : "D";
    const dir = currentMode.includes("Top") ? "Top" : currentMode.includes("Bottom") ? "Bottom" : currentMode.includes("Right") ? "Right" : "Left";

    if (k === "g") {
      return `addPMOS_${dir}_G` as ToolMode;
    }
    if (k === "s") {
      return `addPMOS_${dir}_S` as ToolMode;
    }
    if (k === "d") {
      return `addPMOS_${dir}_D` as ToolMode;
    }
    if (k === "w") {
      return `addPMOS_Top_${currentAnchor}` as ToolMode;
    }
    if (k === "a") {
      return `addPMOS_Left_${currentAnchor}` as ToolMode;
    }
  }

  // 3. 连接线
  if (currentMode.startsWith("addWireLead")) {
    if (k === "w") return "addWireLead_V_Top";
    if (k === "s") return "addWireLead_V_Bottom";
    if (k === "a") return "addWireLead_H_Left";
    if (k === "d") return "addWireLead_H_Right";
  }

  // 4. 电阻
  if (currentMode.startsWith("addResistor")) {
    if (k === "w") return "addResistor_V_Top";
    if (k === "s") return "addResistor_V_Bottom";
    if (k === "a") return "addResistor_H_Left";
    if (k === "d") return "addResistor_H_Right";
  }

  // 5. 电容
  if (currentMode.startsWith("addCapacitor")) {
    if (k === "c") {
      if (currentMode === "addCapacitor_H_Left") return "addControlledCurrentSource_H_Left";
      if (currentMode === "addCapacitor_H_Right") return "addControlledCurrentSource_H_Right";
      if (currentMode === "addCapacitor_V_Bottom") return "addControlledCurrentSource_Down_Bottom";
      return "addControlledCurrentSource_Down_Top";
    }
    if (k === "w") return "addCapacitor_V_Top";
    if (k === "s") return "addCapacitor_V_Bottom";
    if (k === "a") return "addCapacitor_H_Left";
    if (k === "d") return "addCapacitor_H_Right";
  }

  // 5.5 受控电流源
  if (currentMode.startsWith("addControlledCurrentSource")) {
    if (k === "c") {
      if (currentMode.includes("H_Left") || currentMode.includes("Left_Left")) return "addCapacitor_H_Left";
      if (currentMode.includes("H_Right") || currentMode.includes("Right_Right")) return "addCapacitor_H_Right";
      if (currentMode.includes("Bottom")) return "addCapacitor_V_Bottom";
      return "addCapacitor_V_Top";
    }
    if (k === "w") return "addControlledCurrentSource_Up_Top";
    if (k === "s") return "addControlledCurrentSource_Down_Bottom";
    if (k === "a") return "addControlledCurrentSource_Left_Left";
    if (k === "d") return "addControlledCurrentSource_Right_Right";
  }

  // 6. 电压源 / 交流小信号源
  if (currentMode.startsWith("addVoltageSource")) {
    if (k === "w") return "addVoltageSource_V_Top";
    if (k === "s") return "addVoltageSource_V_Bottom";
    if (k === "a") return "addVoltageSource_H_Left";
    if (k === "d") return "addVoltageSource_H_Right";
  }

  // 7. 电流源
  if (currentMode.startsWith("addCurrentSource")) {
    if (k === "w") return "addCurrentSource_Up_Top";
    if (k === "s") return "addCurrentSource_Down_Bottom";
    if (k === "a") return "addCurrentSource_Left_Left";
    if (k === "d") return "addCurrentSource_Right_Right";
  }

  // 8. 电流箭头
  if (currentMode.startsWith("addCurrentArrow")) {
    if (k === "w") return "addCurrentArrow_Up_Top";
    if (k === "s") return "addCurrentArrow_Down_Bottom";
    if (k === "a") return "addCurrentArrow_Left_Left";
    if (k === "d") return "addCurrentArrow_Right_Right";
  }

  // 9. GND
  if (currentMode.startsWith("addGND")) {
    if (k === "w") return "addGND_V_Top";
    if (k === "s") return "addGND_V_Bottom";
    if (k === "a") return "addGND_H_Left";
    if (k === "d") return "addGND_H_Right";
  }

  // 9.5 端口对象 (vdd-port / port): w/a/s/d 切换朝向，保持当前对象类别
  {
    const prefix = portModePrefix(currentMode);
    if (prefix) {
      if (k === "w") return `${prefix}_Top` as ToolMode;
      if (k === "a") return `${prefix}_Left` as ToolMode;
      if (k === "s") return `${prefix}_Bottom` as ToolMode;
      if (k === "d") return `${prefix}_Right` as ToolMode;
      // Pressing the port's own summon key (o = vdd-port, j = generic port) re-arms it at the
      // default Left orientation. Needed now that placement is sticky: without it a re-arm would
      // keep the previous orientation (and `o` alone would otherwise be swallowed).
      if (k === "o") return "addIoNode_VddPort_Left";
      if (k === "j") return "addIoNode_Port_Left";
      // Swallow every other key: without this the `addIoNode` block below would hijack the
      // port with its Vin/Vout state machine (e.g. `o` would turn a vdd-port into Vout).
      return currentMode;
    }
  }

  // 9.6 电源轨 (Power Rail): w/a/s/d 切换朝向
  if (currentMode.startsWith("addPowerRail")) {
    if (k === "w") return "addPowerRail_V_Top";
    if (k === "a") return "addPowerRail_H_Left";
    if (k === "s") return "addPowerRail_V_Bottom";
    if (k === "d") return "addPowerRail_H_Right";
  }

  // 10. IO 端口 (i: 切Vin, o: 切Vout, w: 朝上, a: 朝左, s: 朝下, d: 朝右)
  if (currentMode.startsWith("addIoNode")) {
    const isVout = currentMode.includes("Vout");
    const dir = currentMode.endsWith("Top") ? "Top" : currentMode.endsWith("Bottom") ? "Bottom" : currentMode.endsWith("Right") ? "Right" : "Left";
    const prefix = isVout ? "addIoNode_Vout" : "addIoNode_Vin";

    if (k === "i") return `addIoNode_Vin_${dir}` as ToolMode;
    if (k === "o") return `addIoNode_Vout_${dir}` as ToolMode;
    if (k === "w") return `${prefix}_Top` as ToolMode;
    if (k === "a") return `${prefix}_Left` as ToolMode;
    if (k === "s") return `${prefix}_Bottom` as ToolMode;
    if (k === "d") return `${prefix}_Right` as ToolMode;
  }

  return null;
}

/**
 * 在 select (选择模式) 下敲击快捷键呼出对应元件工具模式
 */
export function resolveSelectModeInitialTool(key: string, vKeyDown: boolean): ToolMode | null {
  const k = key.toLowerCase();

  // 1. 连接线 (W)
  if (k === "w") return "addWireLead_V_Top";

  // 2. nMOS 管 (Z) - 默认栅极在左，加号在栅极
  if (k === "z") return "addNMOS_Left_G";

  // 原始 Node 工具 (N)
  if (k === "n") return "addNode";

  // 3. pMOS 管 (Q) - 默认栅极在左，加号在栅极
  if (k === "q") return "addPMOS_Left_G";

  // 4. 电阻 (R) - 默认竖直，加号在下方
  if (k === "r") return "addResistor_V_Bottom";

  // 5. 电流源 (E)
  if (k === "e" || k === "i") return "addCurrentSource_Down_Bottom";

  // 6. 电容 (C)
  if (k === "c") return "addCapacitor_V_Top";

  // 7. 电压源 (V)
  if (k === "v") return "addVoltageSource_V_Top";

  // 8. 电流箭头 (A)
  if (k === "a") return "addCurrentArrow_Down_Bottom";

  // 9. GND 接地端 (G) - 默认加号在上方节点
  if (k === "g") return "addGND_V_Bottom";

  // 10. IO 端口 (T - Terminal)
  if (k === "t") return "addIoNode_Vin_Left";

  // 10.1 端口对象: O = vdd-port ($V_{DD}$, 自动命名 VDD1/VDD2...), J = 通用 port
  // (O/J 在 TOOL_BUTTONS 与本文的按键表里都未被占用；P 已被 Path 工具占用)
  if (k === "o") return "addIoNode_VddPort_Left";
  if (k === "j") return "addIoNode_Port_Left";

  // 10.2 电源轨 (K - 空余黄金键): 单点落一条默认长度的粗导轨
  if (k === "k") return "addPowerRail_H_Left";

  // 11. D 键: 若按住 V 则为 VDD，否则为实心节点 (●)
  if (k === "d") {
    if (vKeyDown) {
      return "addVDD";
    }
    return "addDotNode";
  }

  return null;
}
