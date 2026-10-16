import { errorResponse, internalError, unauthenticated } from "@/lib/apiResponse";
import { deleteDiary } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/diaries/[id]">) {
  const { id } = await ctx.params;

  try {
    const user = await getCurrentUser();
    if (!user) return unauthenticated();

    // 不存在與不屬於本人都回 404，不透露別人的日記是否存在
    const deleted = await deleteDiary(user.id, id);
    if (!deleted) return errorResponse(404, "NOT_FOUND", "找不到這篇日記");
    return new Response(null, { status: 204 });
  } catch (error) {
    return internalError("api/diaries DELETE", error, "日記暫時無法刪除，請稍後再試");
  }
}
