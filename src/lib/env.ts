import "server-only";
import { z } from "zod";

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI 未設定"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY 未設定"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  // 產生方式：node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  DIARY_ENCRYPTION_KEY: z
    .string({ error: "DIARY_ENCRYPTION_KEY 未設定" })
    .refine((s) => Buffer.from(s, "base64").length === 32, "DIARY_ENCRYPTION_KEY 須為 32 bytes 的 base64 字串"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

// 延遲驗證：在第一次使用時才檢查，避免 build 階段因缺少環境變數而失敗
export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join("；");
      throw new Error(`環境變數設定錯誤：${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
