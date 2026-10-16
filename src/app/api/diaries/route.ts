import { z } from "zod";
import { errorResponse, internalError, invalidInput, unauthenticated } from "@/lib/apiResponse";
import { createDiary, hasAcceptedCurrentDisclaimer, listDiaries } from "@/lib/data";
import { processDiary } from "@/lib/diaryPipeline";
import { TOKEN_LABELS, type EntityType } from "@/lib/piiSanitizer";
import { getCurrentUser } from "@/lib/session";
import { DIARY_CONTENT_MAX, DIARY_TITLE_MAX } from "@/models/Diary";

const ENTITY_TYPES = Object.keys(TOKEN_LABELS) as [EntityType, ...EntityType[]];

const createDiarySchema = z.object({
  title: z.string().trim().max(DIARY_TITLE_MAX).optional(),
  content: z
    .string()
    .trim()
    .min(1, "日記內容不可為空")
    .max(DIARY_CONTENT_MAX)
    // U+FFFD 代表請求不是以 UTF-8 送出：亂碼會讓安全偵測完全失效，必須拒收
    .refine((s) => !s.includes("�"), "文字編碼錯誤，請以 UTF-8 送出"),
  emotions: z.array(z.string().trim().min(1).max(20)).max(10).default([]),
  // 使用者指定一定要遮蔽的私密詞；只用於本次脫敏，不會存檔
  customTerms: z
    .array(z.object({ term: z.string().trim().min(1).max(50), type: z.enum(ENTITY_TYPES) }))
    .max(30)
    .default([]),
});

export async function POST(request: Request) {
  const parsed = createDiarySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);
  const { title, content, emotions, customTerms } = parsed.data;

  try {
    const user = await getCurrentUser();
    if (!user) return unauthenticated();
    if (!hasAcceptedCurrentDisclaimer(user)) {
      return errorResponse(403, "DISCLAIMER_REQUIRED", "請先閱讀並同意服務說明");
    }

    const result = await processDiary(content, { customTerms });
    const diary = await createDiary(user.id, {
      title: title || undefined,
      content,
      emotions,
      aiResponse: result.aiResponse,
      isFlaggedRisk: result.isFlaggedRisk,
    });

    return Response.json(
      { diary, outcome: result.outcome, riskLevel: result.riskLevel },
      { status: 201 },
    );
  } catch (error) {
    return internalError("api/diaries POST", error, "日記暫時無法儲存，請稍後再試");
  }
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.iso.datetime().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return errorResponse(400, "INVALID_QUERY", "查詢參數格式錯誤");

  try {
    const user = await getCurrentUser();
    if (!user) return unauthenticated();

    const { limit, before } = parsed.data;
    const diaries = await listDiaries(user.id, {
      limit,
      before: before ? new Date(before) : undefined,
    });
    return Response.json({ diaries });
  } catch (error) {
    return internalError("api/diaries GET", error, "暫時無法讀取日記，請稍後再試");
  }
}
