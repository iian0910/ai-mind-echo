"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLayoutEffect, useState, type SubmitEvent } from "react";
import type { ApiError } from "@/lib/apiTypes";
import { loginSchema, PASSWORD_MAX, PASSWORD_MIN, registerSchema } from "@/lib/authValidation";
import { DISCLAIMER } from "@/lib/disclaimer";

// 只接受站內路徑，避免 ?next=//evil.com 這類開放式重新導向
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 outline-none placeholder:text-ink-soft/60 focus:border-accent";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptDisclaimer, setAcceptDisclaimer] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  // Cache Components 以 <Activity> 隱藏而非卸載離開的頁面：離開時清掉密碼，
  // 避免登出後回到登入頁時，先前輸入的密碼仍留在表單裡
  useLayoutEffect(() => {
    return () => {
      setPassword("");
      setConfirm("");
      setError(undefined);
    };
  }, []);

  async function onSubmit(e: SubmitEvent) {
    e.preventDefault();
    setError(undefined);

    if (isRegister && password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    const body = { email, password, ...(isRegister && { acceptDisclaimer }) };
    const check = (isRegister ? registerSchema : loginSchema).safeParse(body);
    if (!check.success) {
      setError(check.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as ApiError | null;
        setError(data?.error.message ?? "發生錯誤，請稍後再試");
        return;
      }
      router.replace(safeNext(searchParams.get("next")));
      router.refresh();
    } catch {
      setError("網路連線不穩定，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-soft">電子信箱</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-soft">
          密碼{isRegister && `（至少 ${PASSWORD_MIN} 個字）`}
        </span>
        <input
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </label>

      {isRegister && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-sm text-ink-soft">再次輸入密碼</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              maxLength={PASSWORD_MAX}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </label>

          <div className="rounded-xl bg-surface-muted p-4 text-sm">
            <p className="font-medium">{DISCLAIMER.title}</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 leading-relaxed text-ink-soft">
              {DISCLAIMER.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <label className="mt-3 flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={acceptDisclaimer}
                onChange={(e) => setAcceptDisclaimer(e.target.checked)}
                className="mt-1 size-4 accent-[var(--accent)]"
              />
              <span>我已閱讀並了解：心聆日記不是醫療或諮商服務。</span>
            </label>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="rounded-xl bg-care-soft px-4 py-3 text-sm text-care">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || (isRegister && !acceptDisclaimer)}
        className="w-full rounded-full bg-accent py-3 text-surface transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {submitting ? "請稍候……" : isRegister ? "建立帳號" : "登入"}
      </button>

      <p className="text-center text-sm text-ink-soft">
        {isRegister ? "已經有帳號了？" : "還沒有帳號？"}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="ml-1 text-accent underline underline-offset-2"
        >
          {isRegister ? "登入" : "建立帳號"}
        </Link>
      </p>
    </form>
  );
}
