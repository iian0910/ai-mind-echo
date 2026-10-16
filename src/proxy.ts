import { NextResponse, type NextRequest } from "next/server";

// 與 lib/session 的 SESSION_COOKIE 相同；proxy 不引入 server-only 模組
const SESSION_COOKIE = "mindecho_session";

/**
 * 樂觀檢查：沒有登入 cookie 時直接導向登入頁，不查資料庫。
 * 真正的授權檢查在各頁面的 <RequireUser> 與各 API 的 getCurrentUser()。
 * 登入／註冊頁不因「有 cookie」就導回首頁：cookie 可能已失效，否則會形成循環導向。
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  const { pathname } = request.nextUrl;
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/", "/history/:path*", "/settings/:path*"],
};
