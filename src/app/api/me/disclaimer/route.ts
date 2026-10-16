import { internalError, unauthenticated } from "@/lib/apiResponse";
import { acceptDisclaimer } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

// 宣告版本更新後重新同意（新註冊的使用者在註冊時已同意）
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthenticated();
    return Response.json({ user: await acceptDisclaimer(user.id) });
  } catch (error) {
    return internalError("api/me/disclaimer", error, "暫時無法記錄你的同意，請稍後再試");
  }
}
