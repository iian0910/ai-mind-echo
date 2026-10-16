import { Feather } from "lucide-react";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  return (
    <div className="mx-auto w-full max-w-sm px-4 py-12 sm:py-16">
      <header className="mb-8 text-center">
        <Feather className="mx-auto size-10 text-accent" strokeWidth={1.5} aria-hidden />
        <h1 className="mt-3 font-serif text-3xl tracking-wide">
          {mode === "login" ? "歡迎回來" : "建立你的日記本"}
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {mode === "login" ? "登入後繼續書寫" : "你的日記只會保存在你自己的帳號下"}
        </p>
      </header>
      {/* AuthForm 讀取 ?next= 查詢參數，需包在 Suspense 內讓頁面外框可預先渲染 */}
      <Suspense>
        <AuthForm mode={mode} />
      </Suspense>
    </div>
  );
}
