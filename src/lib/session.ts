import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { createSession, deleteSession, findUserBySessionToken, type UserDTO } from "@/lib/data";
import { SESSION_TTL_DAYS } from "@/models/Session";

// proxy.ts 也以此名稱做樂觀檢查（proxy 不可引入 server-only 模組，因此在那邊另行定義同名常數）
export const SESSION_COOKIE = "mindecho_session";

/**
 * 目前登入的使用者；未登入或登入狀態已失效時回傳 null。
 * 以 React cache 包裝：同一次請求中 layout 守門與頁面各自呼叫時只查一次資料庫。
 */
export const getCurrentUser = cache(async (): Promise<UserDTO | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? findUserBySessionToken(token) : null;
});

/** 登入成功後建立新的登入狀態：只能在 Route Handler / Server Function 中呼叫 */
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await createSession(userId, token, expiresAt);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  cookieStore.delete(SESSION_COOKIE);
}
