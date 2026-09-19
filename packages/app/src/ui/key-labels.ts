export type ModifierKeyLabels = {
  shift: string;
  alt: string;
  primary: string;
};

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

/**
 * 读取当前系统平台名称
 */
export function readCurrentPlatformName(): string {
  if (typeof navigator === "undefined") {
    return "";
  }

  const nav = navigator as NavigatorWithUserAgentData;
  const userAgentPlatform = nav.userAgentData?.platform;
  if (userAgentPlatform?.trim()) {
    return userAgentPlatform;
  }
  return navigator.platform ?? "";
}

/**
 * 判断是否为 macOS / iOS 类平台
 */
export function isMacLikePlatform(platformName: string = readCurrentPlatformName()): boolean {
  return /(mac|iphone|ipad)/i.test(platformName);
}

/**
 * 获取当前平台修饰键展示标签
 * - macOS 类平台使用符号表示：⇧、⌥、⌘
 * - Windows / Linux 类平台使用按键标签：⇧、Alt、Ctrl
 */
export function getModifierKeyLabels(platformName: string = readCurrentPlatformName()): ModifierKeyLabels {
  if (isMacLikePlatform(platformName)) {
    return {
      shift: "⇧",
      alt: "⌥",
      primary: "⌘"
    };
  }

  return {
    shift: "⇧",
    alt: "Alt",
    primary: "Ctrl"
  };
}

/**
 * 格式化菜单快捷键提示文本
 * - 将 "CmdOrCtrl" 按平台转换为 "Cmd" (macOS) 或 "Ctrl" (Windows/Linux)
 * - macOS 采用空格分隔（如 "Cmd Shift Z"），Windows/Linux 采用加号连接（如 "Ctrl+Shift+Z"）
 */
export function formatAccelerator(
  accelerator: string | undefined,
  platformName: string = readCurrentPlatformName()
): string {
  if (!accelerator) {
    return "";
  }

  const isMac = isMacLikePlatform(platformName);
  return accelerator
    .split("+")
    .map((part) => {
      if (part === "CmdOrCtrl") {
        return isMac ? "Cmd" : "Ctrl";
      }
      return part;
    })
    .join(isMac ? " " : "+");
}
