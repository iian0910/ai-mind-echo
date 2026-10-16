/**
 * 安全過濾模組（Safety Filter）
 *
 * 1. assessRisk：在任何文本進入脫敏 / LLM 之前執行，偵測自我傷害與自殺意圖。
 *    - high：明確意圖、方法或計畫 → 阻斷 AI 陪伴回應，標記 isFlaggedRisk，前端顯示關懷卡片與專線。
 *    - concern：被動意念或模糊表述 → 仍給予陪伴回應，但提示 LLM 格外溫柔並在前端附上求助資源。
 *    - none：未偵測到風險。
 * 2. findClinicalTerms：檢查 AI 輸出是否含臨床病理或診斷用語（非醫療宣告的輸出端防線）。
 *
 * 設計取捨：關鍵字規則必然有漏判與誤判。此處寧可把「疑似」歸為 concern 而非 none，
 * 並由 LLM 結構化輸出中的 riskSignal 作為第二道防線（見 mergeRiskLevels）。
 * 本模組回傳的只有風險分類，不回傳命中的原文片段，避免日記內容流入日誌。
 */

export type RiskLevel = "none" | "concern" | "high";

export type RiskCategory =
  | "suicidal_intent" // 自殺意圖
  | "self_harm" // 自我傷害
  | "method" // 提及具體方法或準備
  | "passive_ideation" // 被動意念：想消失、不想醒來
  | "softened_mention"; // 被否定或誇飾語境下的高風險詞（降級為 concern）

export type RiskAssessment = {
  level: RiskLevel;
  categories: RiskCategory[];
};

type Rule = {
  pattern: RegExp;
  level: Exclude<RiskLevel, "none">;
  category: Exclude<RiskCategory, "softened_mention">;
  /** 前方緊鄰否定詞（不、沒有…）時降級為 concern，例如「我不會傷害自己」 */
  negatable?: boolean;
  /** 前方緊鄰程度補語（到、得）時視為誇飾降級為 concern，例如「煩到想死」 */
  hyperbolable?: boolean;
};

// 規則套用在 normalize() 之後的文字上：已移除所有空白、轉為繁體常見字、英文小寫
const RULES: Rule[] = [
  // ---- 自殺意圖（high） ----
  { pattern: /自殺|輕生|尋死|自盡|自我了結/g, level: "high", category: "suicidal_intent", negatable: true },
  { pattern: /了結(?:自己|生命|我的生命)/g, level: "high", category: "suicidal_intent", negatable: true },
  { pattern: /結束(?:我的|自己的?)?生命/g, level: "high", category: "suicidal_intent", negatable: true },
  // 排除「不想活動 / 活躍 / 活潑…」
  { pattern: /不想(?:再)?活(?![動躍潑絡化用力])/g, level: "high", category: "suicidal_intent" },
  { pattern: /活不下去/g, level: "high", category: "suicidal_intent" },
  // 排除「想死你了」這類思念用法
  { pattern: /想死(?![你妳您他她])/g, level: "high", category: "suicidal_intent", negatable: true, hyperbolable: true },
  { pattern: /(?:想|要|我|乾脆|不如)去死/g, level: "high", category: "suicidal_intent", negatable: true },
  { pattern: /死了算了|死掉算了|不如死了|死了比較好|死掉比較好/g, level: "high", category: "suicidal_intent" },
  { pattern: /killmyself|killingmyself|suicid|wanttodie|endmylife/g, level: "high", category: "suicidal_intent" },

  // ---- 自我傷害（high） ----
  { pattern: /自殘|自傷|傷害自己|割自己|割手|割腕|selfharm|cutmyself|hurtmyself/g, level: "high", category: "self_harm", negatable: true },

  // ---- 具體方法或準備（high） ----
  // 排除「跳樓大拍賣 / 跳樓價」
  { pattern: /跳樓(?!大?拍賣|價)|燒炭|上吊|臥軌|跳海|跳河/g, level: "high", category: "method", negatable: true },
  { pattern: /吞(?:了)?(?:整瓶|一整瓶|一堆|很多|大量)?(?:安眠)?藥/g, level: "high", category: "method", negatable: true },
  { pattern: /(?:囤|存|準備)(?:了)?(?:很多|一堆)?安眠藥/g, level: "high", category: "method" },
  { pattern: /遺書/g, level: "high", category: "method", negatable: true },

  // ---- 被動意念（concern） ----
  // 允許中間夾幾個字：「好想就這樣消失」
  { pattern: /想.{0,4}消失|消失就好|消失算了/g, level: "concern", category: "passive_ideation" },
  { pattern: /不(?:想|要|會)(?:再)?醒來/g, level: "concern", category: "passive_ideation" },
  { pattern: /撐不下去|撐不住了/g, level: "concern", category: "passive_ideation" },
  { pattern: /活著(?:好|很|真的|真)?(?:累|痛苦|沒意思)|活著沒有?意義/g, level: "concern", category: "passive_ideation" },
  { pattern: /沒有我.{0,6}(?:比較好|更好)|(?:世界上|這世界)沒有我/g, level: "concern", category: "passive_ideation" },
  { pattern: /想結束(?:這)?一切|永遠解脫|遺言/g, level: "concern", category: "passive_ideation" },
];

// 允許否定詞與關鍵字間夾一個助動詞，例如「不是想自殺」「不要傷害自己」
const NEGATION_BEFORE = /(?:不|不會|不要|別|沒|沒有|從沒|從來沒有?|並沒有?|絕不|不是)(?:想|要|會)?$/;
// 「要不要、會不會、該不該」是正反問句而非否定，例如「在想要不要燒炭」不可降級
const A_NOT_A_BEFORE = /(.)不\1(?:想|要|會)?$/;
const HYPERBOLE_BEFORE = /[到得]$/;

// 常見簡體寫法對應，避免以簡體書寫時繞過規則
const SIMPLIFIED_MAP: Record<string, string> = {
  杀: "殺", 楼: "樓", 尽: "盡", 结: "結", 书: "書", 药: "藥",
  轻: "輕", 寻: "尋", 残: "殘", 伤: "傷", 着: "著", 绝: "絕",
  没: "沒", 会: "會", 来: "來", 为: "為", 么: "麼", 吗: "嗎",
  这: "這", 撑: "撐", 准: "準", 备: "備", 卧: "臥", 轨: "軌",
};
const SIMPLIFIED_RE = new RegExp(`[${Object.keys(SIMPLIFIED_MAP).join("")}]`, "g");

export function normalize(text: string): string {
  return text
    .normalize("NFKC") // 全形英數 → 半形
    .replace(/[​-‍⁠﻿]/g, "") // 零寬字元
    .replace(/\s+/g, "") // 「想 死」這類以空白拆字的寫法
    .replace(SIMPLIFIED_RE, (ch) => SIMPLIFIED_MAP[ch])
    .toLowerCase();
}

const LEVEL_RANK: Record<RiskLevel, number> = { none: 0, concern: 1, high: 2 };

export function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

export function assessRisk(text: string): RiskAssessment {
  const normalized = normalize(text);
  let level: RiskLevel = "none";
  const categories = new Set<RiskCategory>();

  for (const rule of RULES) {
    for (const match of normalized.matchAll(rule.pattern)) {
      const before = normalized.slice(Math.max(0, match.index - 5), match.index);
      const softened =
        (rule.negatable && NEGATION_BEFORE.test(before) && !A_NOT_A_BEFORE.test(before)) ||
        (rule.hyperbolable && HYPERBOLE_BEFORE.test(before));

      if (softened && rule.level === "high") {
        level = maxRiskLevel(level, "concern");
        categories.add("softened_mention");
      } else {
        level = maxRiskLevel(level, rule.level);
        categories.add(rule.category);
      }
    }
  }

  return { level, categories: [...categories] };
}

/**
 * 合併本地關鍵字偵測與 LLM 回報的風險訊號，取較高者。
 * LLM 只看得到脫敏後文本，但能理解關鍵字規則抓不到的隱晦說法。
 */
export function mergeRiskLevels(local: RiskLevel, llmSignal: RiskLevel | undefined): RiskLevel {
  return maxRiskLevel(local, llmSignal ?? "none");
}

// ---- 輸出端：臨床病理與診斷用語檢查 ----

const CLINICAL_TERMS =
  /憂鬱症|抑鬱症|躁鬱症|雙極性?|焦慮症|恐慌症|強迫症|創傷後壓力|ptsd|思覺失調|精神分裂|精神病|精神疾病|人格(?:障礙|疾患)|邊緣性人格|(?:飲食|睡眠|情緒)(?:障礙|疾患)|過動症|adhd|診斷|病徵|病理|病態|處方|藥物治療|你(?:有|患有|得了).{0,6}(?:症|病)|(?:症|病)的?傾向/gi;

/** 回傳 AI 輸出中出現的臨床用語（去重），空陣列代表通過 */
export function findClinicalTerms(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.normalize("NFKC").matchAll(CLINICAL_TERMS)) {
    found.add(match[0].toLowerCase());
  }
  return [...found];
}
