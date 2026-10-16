import { errorResponse, internalError, invalidInput } from "@/lib/apiResponse";
import { loginSchema } from "@/lib/authValidation";
import { findUserForLogin } from "@/lib/data";
import { burnPasswordCheck, verifyPassword } from "@/lib/password";
import { createRateLimiter } from "@/lib/rateLimit";
import { startSession } from "@/lib/session";

// 同一信箱 15 分鐘內最多失敗 10 次，降低暴力猜密碼的風險
const failedLogins = createRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInput(parsed.error);
  const { email, password } = parsed.data;

  const wait = failedLogins.retryAfter(email);
  if (wait > 0) {
    return errorResponse(429, "TOO_MANY_ATTEMPTS", `嘗試次數過多，請 ${Math.ceil(wait / 60)} 分鐘後再試`, {
      headers: { "Retry-After": String(wait) },
    });
  }

  try {
    const found = await findUserForLogin(email);
    const valid = found
      ? await verifyPassword(password, found.passwordHash)
      : (await burnPasswordCheck(password), false);

    if (!found || !valid) {
      failedLogins.hit(email);
      return errorResponse(401, "INVALID_CREDENTIALS", "信箱或密碼不正確");
    }

    failedLogins.reset(email);
    await startSession(found.user.id);
    return Response.json({ user: found.user });
  } catch (error) {
    return internalError("api/auth/login", error, "暫時無法登入，請稍後再試");
  }
}
