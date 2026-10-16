import { z } from "zod";
import { internalError, invalidInput, unauthenticated } from "@/lib/apiResponse";
import { hasAcceptedCurrentDisclaimer, updateTheme } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { THEMES } from "@/lib/theme";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return Response.json({
      user,
      // 未登入時不需要宣告視窗（註冊時已同意），只有宣告版本更新時才再次詢問
      needsDisclaimer: !!user && !hasAcceptedCurrentDisclaimer(user),
    });
  } catch (error) {
    return internalError("api/me GET", error, "暫時無法讀取設定");
  }
}

const patchSchema = z.object({ theme: z.enum(THEMES) });

export async function PATCH(request: Request) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const user = await getCurrentUser();
    if (!user) return unauthenticated();
    return Response.json({ user: await updateTheme(user.id, parsed.data.theme) });
  } catch (error) {
    return internalError("api/me PATCH", error, "設定暫時無法儲存");
  }
}
