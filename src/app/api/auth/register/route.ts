import { errorResponse, internalError, invalidInput } from "@/lib/apiResponse";
import { registerSchema } from "@/lib/authValidation";
import { createUser, EmailTakenError } from "@/lib/data";
import { hashPassword } from "@/lib/password";
import { startSession } from "@/lib/session";

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);
  const { email, password } = parsed.data;

  try {
    const user = await createUser({
      email,
      passwordHash: await hashPassword(password),
      acceptDisclaimer: true,
    });
    await startSession(user.id);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return errorResponse(409, "EMAIL_TAKEN", "這個信箱已經註冊過了，請直接登入");
    }
    return internalError("api/auth/register", error, "暫時無法註冊，請稍後再試");
  }
}
