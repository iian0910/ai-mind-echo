import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_REPLY, type CompanionReply, type ModelCaller } from "@/lib/aiCompanion";
import { processDiary } from "@/lib/diaryPipeline";

const reply = (overrides: Partial<CompanionReply> = {}): string =>
  JSON.stringify({
    reply: "聽起來今天和 [人名_1] 的對話讓你很委屈。",
    identifiedEmotions: ["委屈", "疲憊"],
    needsSummary: "被理解",
    riskSignal: "none",
    ...overrides,
  } satisfies CompanionReply);

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("processDiary：安全閘門", () => {
  it("本地偵測為 high 時不呼叫 LLM，回傳 crisis", async () => {
    const callModel = vi.fn<ModelCaller>();
    const result = await processDiary("我真的好想死", { callModel });

    expect(callModel).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: "crisis", riskLevel: "high", isFlaggedRisk: true });
  });

  it("LLM 回報 high 時丟棄回信，改走 crisis", async () => {
    const callModel = vi.fn<ModelCaller>().mockResolvedValue(reply({ riskSignal: "high" }));
    const result = await processDiary("最近一直在想要怎麼準備離開這一切", { callModel });

    expect(result.outcome).toBe("crisis");
    expect(result.isFlaggedRisk).toBe(true);
    expect(result.aiResponse).toBeUndefined();
  });

  it("本地偵測為 concern 時仍回信，並在系統提示中加入溫柔提醒", async () => {
    const callModel = vi.fn<ModelCaller>().mockResolvedValue(reply());
    const result = await processDiary("好想就這樣消失", { callModel });

    expect(result.outcome).toBe("replied");
    expect(result.riskLevel).toBe("concern");
    expect(result.isFlaggedRisk).toBe(false);
    expect(callModel.mock.calls[0][0].systemInstruction).toContain("格外溫柔");
  });
});

describe("processDiary：脫敏與還原", () => {
  it("送往 LLM 的只有代號，回信中的代號會被還原", async () => {
    const callModel = vi.fn<ModelCaller>().mockResolvedValue(reply());
    const result = await processDiary("今天又被王經理當眾罵了，打 0912-345-678 也沒人接", {
      callModel,
    });

    const sent = callModel.mock.calls[0][0].text;
    expect(sent).not.toContain("王經理");
    expect(sent).not.toContain("0912-345-678");
    expect(sent).toContain("[人名_1]");
    expect(result.aiResponse?.content).toBe("聽起來今天和 王經理 的對話讓你很委屈。");
  });

  it("customTerms 指定的私密詞也會被遮蔽", async () => {
    const callModel = vi.fn<ModelCaller>().mockResolvedValue(reply({ reply: "[公司_1] 的事辛苦了" }));
    const result = await processDiary("晨光烘焙坊今天又加班到十點", {
      callModel,
      customTerms: [{ term: "晨光烘焙坊", type: "ORG" }],
    });

    expect(callModel.mock.calls[0][0].text).not.toContain("晨光烘焙坊");
    expect(result.aiResponse?.content).toBe("晨光烘焙坊 的事辛苦了");
  });
});

describe("processDiary：臨床用語檢查", () => {
  it("第一次含診斷用語時重試，採用第二次的乾淨回信", async () => {
    const callModel = vi
      .fn<ModelCaller>()
      .mockResolvedValueOnce(reply({ reply: "你可能有憂鬱症的傾向。" }))
      .mockResolvedValueOnce(reply({ reply: "這陣子你真的累了。" }));
    const result = await processDiary("最近每天都提不起勁", { callModel });

    expect(callModel).toHaveBeenCalledTimes(2);
    expect(callModel.mock.calls[1][0].systemInstruction).toContain("臨床或診斷用語");
    expect(result.aiResponse?.content).toBe("這陣子你真的累了。");
  });

  it("兩次都含診斷用語時改用保底回信，但保留較高的風險訊號", async () => {
    const callModel = vi
      .fn<ModelCaller>()
      .mockResolvedValueOnce(reply({ reply: "這是焦慮症的表現。", riskSignal: "concern" }))
      .mockResolvedValueOnce(reply({ needsSummary: "需要藥物治療" }));
    const result = await processDiary("最近每天都提不起勁", { callModel });

    expect(result.outcome).toBe("replied");
    expect(result.aiResponse?.content).toBe(FALLBACK_REPLY.reply);
    expect(result.riskLevel).toBe("concern");
  });
});

describe("processDiary：LLM 失敗", () => {
  it.each([
    ["網路錯誤", () => Promise.reject(new Error("fetch failed"))],
    ["非 JSON", () => Promise.resolve("抱歉我無法回答")],
    ["結構不符", () => Promise.resolve(JSON.stringify({ reply: "嗨" }))],
  ])("%s → ai_unavailable，日記仍可保存", async (_label, impl) => {
    const callModel = vi.fn<ModelCaller>().mockImplementation(impl);
    const result = await processDiary("今天下雨，心情有點悶", { callModel });

    expect(result).toEqual({ outcome: "ai_unavailable", riskLevel: "none", isFlaggedRisk: false });
  });
});
