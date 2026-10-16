import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/session";

/**
 * 頁面層級的登入守門員：向資料庫確認登入狀態後才渲染 children。
 *
 * - proxy.ts 只檢查 cookie 是否存在，偽造或過期的 cookie 仍會通過，必須在這裡再確認。
 * - 不可放在 layout：App Router 的 layout 與 page 平行渲染，layout 擋不住 page 的內容送出，
 *   因此每個需要登入的頁面都要用本元件包住自己的全部內容。
 * - 讀取 cookie 屬於請求期資料，包在 Suspense 內：預先渲染的外框只有骨架畫面。
 */
async function Guard({ children, from }: { children: React.ReactNode; from: string }) {
  const user = await getCurrentUser();
  if (!user) redirect(from === "/" ? "/login" : `/login?next=${encodeURIComponent(from)}`);
  return children;
}

function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-10 sm:py-14" aria-hidden>
      <div className="h-9 w-48 animate-pulse rounded-xl bg-surface-muted" />
      <div className="h-64 animate-pulse rounded-2xl bg-surface-muted" />
    </div>
  );
}

export function RequireUser({ children, from }: { children: React.ReactNode; from: string }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard from={from}>{children}</Guard>
    </Suspense>
  );
}
