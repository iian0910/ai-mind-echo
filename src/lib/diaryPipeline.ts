/**
 * 日記送出處理流程（不含資料庫存取，方便單元測試）
 *
 *   1. assessRisk(原文)            high → 不呼叫 LLM，直接回傳 crisis
 *   2. sanitize(原文)              只有 masked 文字會離開伺服器
 *   3. generateCompanionReply      Gemini 結構化輸出 + 臨床用語檢查
 *   4. mergeRiskLevels             LLM 判讀為 high → 同樣丟棄回信、改走 crisis
 *   5. restore                     把代號換回真實名稱後才交給呼叫端存檔
 *
 * LLM 失敗時日記本身仍要保存（使用者寫下的文字不可遺失），以 ai_unavailable 告知前端。
 * mapping 只存在於本函式的區域變數中，不回傳、不記錄。
 */
import "server-only";
import {
  CompanionUnavailableError,
  generateCompanionReply,
  type ModelCaller,
} from "@/lib/aiCompanion";
import { restore, sanitize, type CustomTerm } from "@/lib/piiSanitizer";
import { assessRisk, mergeRiskLevels, type RiskLevel } from "@/lib/safety";

export type DiaryOutcome = "replied" | "crisis" | "ai_unavailable";

export type PipelineResult = {
  outcome: DiaryOutcome;
  riskLevel: RiskLevel;
  isFlaggedRisk: boolean;
  aiResponse?: {
    content: string;
    identifiedEmotions: string[];
    needsSummary: string;
  };
};

export async function processDiary(
  content: string,
  { customTerms = [], callModel }: { customTerms?: CustomTerm[]; callModel?: ModelCaller } = {},
): Promise<PipelineResult> {
  const local = assessRisk(content);
  if (local.level === "high") {
    console.info("[diary] 本地偵測高風險，略過 LLM", { categories: local.categories });
    return { outcome: "crisis", riskLevel: "high", isFlaggedRisk: true };
  }

  const { masked, mapping, stats } = sanitize(content, { customTerms });

  let reply;
  try {
    reply = await generateCompanionReply(masked, { localRisk: local.level }, callModel);
  } catch (error) {
    if (!(error instanceof CompanionUnavailableError)) throw error;
    console.warn("[diary] AI 回覆失敗", { message: error.message });
    return {
      outcome: "ai_unavailable",
      riskLevel: local.level,
      isFlaggedRisk: false,
    };
  }

  const riskLevel = mergeRiskLevels(local.level, reply.riskSignal);
  console.info("[diary] 處理完成", {
    piiMasked: stats,
    localRisk: local.level,
    llmRisk: reply.riskSignal,
    usedFallback: reply.usedFallback,
  });

  if (riskLevel === "high") {
    return { outcome: "crisis", riskLevel, isFlaggedRisk: true };
  }

  return {
    outcome: "replied",
    riskLevel,
    isFlaggedRisk: false,
    aiResponse: {
      content: restore(reply.reply, mapping),
      identifiedEmotions: reply.identifiedEmotions.map((e) => restore(e, mapping)),
      needsSummary: restore(reply.needsSummary, mapping),
    },
  };
}
