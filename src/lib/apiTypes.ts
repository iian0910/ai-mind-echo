// 前端呼叫 API 時使用的回應型別（只引入型別，不會把伺服器模組打包進前端）
import type { DiaryDTO, UserDTO } from "@/lib/data";
import type { DiaryOutcome } from "@/lib/diaryPipeline";
import type { RiskLevel } from "@/lib/safety";

export type { DiaryDTO, DiaryOutcome, RiskLevel, UserDTO };

export type ApiError = { error: { code: string; message: string } };

export type CreateDiaryResponse = {
  diary: DiaryDTO;
  outcome: DiaryOutcome;
  riskLevel: RiskLevel;
};

export type MeResponse = { user: UserDTO | null; needsDisclaimer: boolean };

// 送出日記遇到 403 DISCLAIMER_REQUIRED 時廣播，讓宣告視窗重新開啟
export const DISCLAIMER_REQUIRED_EVENT = "mindecho:disclaimer-required";

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", // 固定時區，避免伺服器與瀏覽器渲染結果不一致
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDiaryDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
