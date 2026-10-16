import { internalError } from "@/lib/apiResponse";
import { endSession } from "@/lib/session";

export async function POST() {
  try {
    await endSession();
    return new Response(null, { status: 204 });
  } catch (error) {
    return internalError("api/auth/logout", error, "登出失敗，請稍後再試");
  }
}
