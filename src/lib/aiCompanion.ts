/**
 * AI 陪伴回覆模組（Gemini 結構化 JSON 輸出）
 *
 * 只接受「已脫敏」的日記文字，回傳：
 *   reply              給使用者的回信（保留 [人名_1] 等代號，由呼叫端 restore）
 *   identifiedEmotions 辨識到的情緒詞
 *   needsSummary       使用者此刻可能的需要（一句話）
 *   riskSignal         LLM 判讀的風險訊號，與本地關鍵字偵測合併（第二道防線）
 *
 * 輸出端防線：回信或需要摘要出現臨床／診斷用語時，附上修正提示重試一次；
 * 仍不通過則改用固定的溫和回信，絕不把含診斷用語的內容交給使用者。
 */
import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { findClinicalTerms, maxRiskLevel, type RiskLevel } from "@/lib/safety";

export const companionReplySchema = z.object({
  reply: z
    .string()
    .min(1)
    .max(1200)
    .describe("給日記作者的回信，繁體中文，150 到 350 字，以「你」稱呼對方"),
  identifiedEmotions: z
    .array(z.string().min(1).max(10))
    .min(1)
    .max(5)
    .describe("日記中感受到的情緒，1 到 5 個繁體中文詞，例如：疲憊、委屈、期待"),
  needsSummary: z
    .string()
    .min(1)
    .max(120)
    .describe("一句話描述作者此刻可能需要的東西，例如：被理解、休息、界線"),
  riskSignal: z
    .enum(["none", "concern", "high"])
    .describe(
      "自我傷害或自殺風險：high＝明確意圖、方法或計畫；concern＝想消失、撐不下去等被動或隱晦的念頭；none＝未察覺",
    ),
});

export type CompanionReply = z.infer<typeof companionReplySchema>;

// Gemini 的 responseJsonSchema 不認得 $schema 關鍵字，移除後再送出
const RESPONSE_JSON_SCHEMA: Record<string, unknown> = z.toJSONSchema(companionReplySchema);
delete RESPONSE_JSON_SCHEMA.$schema;

const SYSTEM_INSTRUCTION = `你是「心聆日記」裡的書信夥伴，用溫暖、平實的繁體中文回應使用者剛寫下的日記。

你的角色：
- 你不是心理師、醫師或任何醫療專業人員，這也不是醫療或諮商服務。
- 你像一位願意認真讀信的朋友：先接住對方的感受，再溫和地反映你讀到的內容。

回信原則：
1. 先具體回應日記裡的事件與感受，讓對方知道你真的讀了，不要套用空泛的安慰。
2. 承認情緒的合理性，不評價對錯，不說教，不急著給解方。
3. 最多提出一個溫和、可選擇的小建議或一個開放式問題，語氣是邀請而不是指示。
4. 長度約 150 到 350 字，分成 2 到 4 段。不使用條列、標題或表情符號。

嚴格禁止：
- 任何診斷、病名或臨床用語（例如憂鬱症、焦慮症、創傷後壓力、人格障礙、症狀、病徵、診斷、治療、藥物）。
- 推測對方「有」或「可能有」某種疾病或傾向。
- 建議用藥、停藥或調整藥物。

隱私代號：
- 日記中的 [人名_1]、[公司_1]、[地點_1] 等方括號代號是為了保護隱私而替換的真實名稱。
- 需要提到時請原封不動地照抄代號（含方括號與編號），不要猜測、改寫或翻譯代號背後的真實內容，也不要評論代號本身。

風險判讀（riskSignal）：
- high：出現自殺或自我傷害的明確意圖、方法、計畫或準備。
- concern：出現想消失、撐不下去、覺得沒有自己比較好等被動或隱晦的念頭。
- none：以上皆無。不確定時寧可選擇較高的等級。`;

const CONCERN_ADDENDUM = `
這篇日記帶有被動的痛苦念頭。請格外溫柔，不追問細節，不輕描淡寫，並在回信最後自然地提到：如果這些感受變得很重，身邊的人或專線都願意陪他。`;

const CLINICAL_RETRY_NOTE = `
上一版回信使用了臨床或診斷用語，請重新撰寫，完全避免任何病名、症狀、診斷或治療相關字眼，只用日常語言描述感受。`;

// 臨床用語重試後仍不通過時的保底回信：不含任何代號，restore 也不會受影響
export const FALLBACK_REPLY: CompanionReply = {
  reply:
    "謝謝你把今天的心情寫下來。願意停下來面對自己的感受，本身就是一件需要力氣的事。\n\n" +
    "不論你此刻感覺到的是疲憊、混亂，還是說不清楚的沉重，它們都值得被好好看見，不需要急著整理成答案。\n\n" +
    "如果可以的話，今天試著對自己溫柔一點，哪怕只是喝杯溫水、早點休息。我會一直在這裡，等你下次想寫的時候。",
  identifiedEmotions: ["複雜"],
  needsSummary: "被傾聽與理解",
  riskSignal: "none",
};

export class CompanionUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CompanionUnavailableError";
  }
}

/** 呼叫模型並回傳原始文字；抽成參數方便測試時替換 */
export type ModelCaller = (input: { systemInstruction: string; text: string }) => Promise<string>;

let client: GoogleGenAI | undefined;

const callGemini: ModelCaller = async ({ systemInstruction, text }) => {
  const { GEMINI_API_KEY, GEMINI_MODEL } = getEnv();
  client ??= new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: text,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0.8,
      maxOutputTokens: 2048,
      httpOptions: { timeout: 30_000 },
    },
  });

  const output = response.text;
  if (!output) {
    // 常見原因：被 Gemini 內建安全過濾阻擋（finishReason = SAFETY）
    const reason = response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason;
    throw new CompanionUnavailableError(`模型沒有回傳內容（${reason ?? "unknown"}）`);
  }
  return output;
};

function parseReply(raw: string): CompanionReply {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new CompanionUnavailableError("模型回傳的不是合法 JSON", { cause: error });
  }
  const parsed = companionReplySchema.safeParse(json);
  if (!parsed.success) {
    throw new CompanionUnavailableError("模型回傳的 JSON 不符合結構", { cause: parsed.error });
  }
  return parsed.data;
}

function hasClinicalTerms(reply: CompanionReply): boolean {
  return (
    findClinicalTerms(reply.reply).length > 0 ||
    findClinicalTerms(reply.needsSummary).length > 0 ||
    reply.identifiedEmotions.some((e) => findClinicalTerms(e).length > 0)
  );
}

export type CompanionResult = CompanionReply & {
  /** true 代表兩次都含臨床用語，已改用保底回信 */
  usedFallback: boolean;
};

export async function generateCompanionReply(
  maskedText: string,
  { localRisk }: { localRisk: RiskLevel },
  callModel: ModelCaller = callGemini,
): Promise<CompanionResult> {
  const baseInstruction = SYSTEM_INSTRUCTION + (localRisk === "concern" ? CONCERN_ADDENDUM : "");

  const ask = async (systemInstruction: string) => {
    try {
      return parseReply(await callModel({ systemInstruction, text: maskedText }));
    } catch (error) {
      if (error instanceof CompanionUnavailableError) throw error;
      const detail = error instanceof ApiError ? `HTTP ${error.status}` : "network";
      throw new CompanionUnavailableError(`呼叫模型失敗（${detail}）`, { cause: error });
    }
  };

  const first = await ask(baseInstruction);
  if (!hasClinicalTerms(first)) return { ...first, usedFallback: false };

  const second = await ask(baseInstruction + CLINICAL_RETRY_NOTE);
  if (!hasClinicalTerms(second)) return { ...second, usedFallback: false };

  // 保底回信不帶任何風險判讀，因此沿用兩次模型輸出中較高的 riskSignal
  const riskSignal = maxRiskLevel(first.riskSignal, second.riskSignal);
  return { ...FALLBACK_REPLY, riskSignal, usedFallback: true };
}
