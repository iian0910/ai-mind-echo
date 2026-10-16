import "server-only";
import type { ZodError } from "zod";

export function errorResponse(status: number, code: string, message: string, init?: ResponseInit) {
  return Response.json({ error: { code, message } }, { ...init, status });
}

export function invalidInput(error: ZodError) {
  return errorResponse(400, "INVALID_INPUT", error.issues.map((i) => i.message).join("；"));
}

export const unauthenticated = () => errorResponse(401, "UNAUTHENTICATED", "請先登入");

/** 不記錄 error 物件本身：mongoose 驗證錯誤可能夾帶日記內容或信箱 */
export function internalError(route: string, error: unknown, message: string) {
  console.error(`[${route}] 失敗`, { name: (error as Error)?.name });
  return errorResponse(500, "INTERNAL_ERROR", message);
}
