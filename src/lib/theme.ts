// 前後端共用：主題清單（不可引入 mongoose，否則會被打包進前端）

export const THEMES = ["light", "earth", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_OPTIONS: readonly { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "暖白紙張", description: "明亮柔和，適合白天書寫" },
  { value: "earth", label: "大地色", description: "低對比的護眼色調" },
  { value: "dark", label: "深夜書桌", description: "夜晚書寫不刺眼" },
];

export const THEME_STORAGE_KEY = "theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}
