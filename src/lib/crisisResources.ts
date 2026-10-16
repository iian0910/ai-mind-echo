// 前後端共用：在地求助資源與關懷文案（不含任何偵測邏輯）

export type CrisisResource = {
  name: string;
  number: string;
  description: string;
};

export const CRISIS_RESOURCES: readonly CrisisResource[] = [
  { name: "安心專線", number: "1925", description: "衛福部 24 小時免付費心理諮詢" },
  { name: "生命線", number: "1995", description: "24 小時協談專線" },
  { name: "張老師專線", number: "1980", description: "陪你聊聊生活中的困擾" },
];

export const EMERGENCY_RESOURCES: readonly CrisisResource[] = [
  { name: "緊急救護", number: "119", description: "若有立即危險，請直接撥打" },
  { name: "報案專線", number: "110", description: "需要警方協助時撥打" },
];

// 高風險時取代 AI 回覆的固定關懷文字：不分析、不說教，只確認對方此刻的安全與被看見
export const CRISIS_CARE_MESSAGE = {
  title: "謝謝你願意寫下來",
  body: [
    "從你的文字裡，我感覺到你現在承受著很重、很難熬的痛苦。願意把它寫下來，已經是很不容易的一步。",
    "這一刻，你值得有真實的人陪在身邊。下面的專線都有受過訓練的夥伴，願意聽你說，不需要準備好要說什麼。",
    "如果你現在有立即的危險，請撥打 119，或請身邊的人陪你一起。",
  ],
} as const;
