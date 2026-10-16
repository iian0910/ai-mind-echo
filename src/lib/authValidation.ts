// 前後端共用：帳號密碼格式規則
import { z } from "zod";

export const PASSWORD_MIN = 6;
// 上限避免超長字串拖慢 scrypt（雜湊成本與輸入長度相關）
export const PASSWORD_MAX = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("請輸入有效的電子信箱").max(254, "信箱過長"));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `密碼至少需要 ${PASSWORD_MIN} 個字`)
  .max(PASSWORD_MAX, `密碼最多 ${PASSWORD_MAX} 個字`);

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema });

export const registerSchema = loginSchema.extend({
  acceptDisclaimer: z.literal(true, "請先閱讀並同意服務說明"),
});
