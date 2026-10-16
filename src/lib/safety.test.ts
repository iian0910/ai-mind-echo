import { describe, expect, it } from "vitest";
import {
  assessRisk,
  findClinicalTerms,
  mergeRiskLevels,
  normalize,
} from "@/lib/safety";

const level = (text: string) => assessRisk(text).level;

describe("assessRisk：高風險（阻斷 AI 回應）", () => {
  it.each([
    "我真的好想死",
    "今天又想自殺了",
    "我不想活了",
    "我覺得活不下去",
    "乾脆去死算了",
    "死了算了，反正沒人在乎",
    "我想結束自己的生命",
    "昨天晚上又割腕了",
    "我想傷害自己",
    "我在想要不要燒炭",
    "我已經準備了一堆安眠藥",
    "吞了整瓶藥",
    "我寫好遺書了",
    "I want to kill myself",
    "having suicidal thoughts again",
  ])("「%s」→ high", (text) => {
    expect(level(text)).toBe("high");
  });

  it("以空白、全形或零寬字元拆字仍能偵測", () => {
    expect(level("我 想 死")).toBe("high");
    expect(level("想​死")).toBe("high");
    expect(level("ＫＩＬＬ ＭＹＳＥＬＦ")).toBe("high");
  });

  it("正反問句（要不要、會不會）不視為否定", () => {
    expect(level("我在想要不要燒炭")).toBe("high");
    expect(level("我會不會哪天就傷害自己")).toBe("high");
  });

  it("簡體寫法仍能偵測", () => {
    expect(level("我想自杀")).toBe("high");
    expect(level("想跳楼")).toBe("high");
  });

  it("回傳分類但不回傳原文", () => {
    const result = assessRisk("我想自殺，也想過燒炭");
    expect(result.categories).toEqual(
      expect.arrayContaining(["suicidal_intent", "method"]),
    );
    expect(JSON.stringify(result)).not.toContain("燒炭");
  });
});

describe("assessRisk：需要關注（仍給陪伴，附求助資源）", () => {
  it.each([
    "好想就這樣消失",
    "希望睡著之後不要醒來",
    "我快撐不下去了",
    "活著好累",
    "沒有我大家應該會比較好",
  ])("被動意念「%s」→ concern", (text) => {
    expect(level(text)).toBe("concern");
  });

  it.each([
    "我不想死，可是好痛苦",
    "我不會傷害自己，只是想寫下來",
    "我不是想自殺，只是很累",
    "煩到想死",
  ])("否定或誇飾語境「%s」→ 降級為 concern 而非忽略", (text) => {
    const result = assessRisk(text);
    expect(result.level).toBe("concern");
    expect(result.categories).toContain("softened_mention");
  });

  it("同一篇同時有否定與明確意圖時，以明確意圖為準", () => {
    expect(level("我以為我不想死，但現在真的想死")).toBe("high");
  });
});

describe("assessRisk：日常誇飾不誤判", () => {
  it.each([
    "今天累死了",
    "笑死，主管今天又出包",
    "熱死了，冷氣壞掉",
    "好久沒見，想死你了",
    "週末不想活動，只想躺著",
    "百貨公司跳樓大拍賣",
    "今天開會很順利，心情不錯",
    "",
  ])("「%s」→ none", (text) => {
    expect(level(text)).toBe("none");
  });
});

describe("normalize", () => {
  it("移除空白、轉半形、轉小寫", () => {
    expect(normalize(" Ａ b\tＣ ")).toBe("abc");
  });
});

describe("mergeRiskLevels", () => {
  it("取本地偵測與 LLM 訊號中較高者", () => {
    expect(mergeRiskLevels("none", "high")).toBe("high");
    expect(mergeRiskLevels("concern", "none")).toBe("concern");
    expect(mergeRiskLevels("high", "concern")).toBe("high");
    expect(mergeRiskLevels("none", undefined)).toBe("none");
  });
});

describe("findClinicalTerms：AI 輸出不得含臨床用語", () => {
  it("抓出病名與診斷語句", () => {
    expect(findClinicalTerms("你可能有憂鬱症的傾向")).toEqual(
      expect.arrayContaining(["憂鬱症"]),
    );
    expect(findClinicalTerms("這聽起來像焦慮症")).toEqual(["焦慮症"]);
    expect(findClinicalTerms("像是 PTSD 的反應")).toEqual(["ptsd"]);
  });

  it("一般情緒詞彙不受影響", () => {
    expect(
      findClinicalTerms("聽起來你今天真的很憂鬱、很焦慮，這些感受都很合理。"),
    ).toEqual([]);
  });
});
