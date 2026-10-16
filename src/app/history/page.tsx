import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DiaryTimeline } from "@/components/DiaryTimeline";
import { RequireUser } from "@/components/RequireUser";
import { listDiaries } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "回顧 | 心聆日記" };

async function HistoryList() {
  // RequireUser 已確認登入；getCurrentUser 有 cache，這裡不會重複查詢資料庫
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/history");
  const diaries = await listDiaries(user.id, { limit: 20 });
  // Cache Components 以 <Activity> 保留離開過的頁面狀態，DiaryTimeline 的 useState(initial)
  // 不會採用新資料；以日記 id 組成 key，清單有變動（新增、刪除）時重新掛載
  return <DiaryTimeline key={diaries.map((d) => d.id).join()} initial={diaries} />;
}

function HistorySkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface-muted" />
      ))}
    </div>
  );
}

export default function HistoryPage() {
  return (
    <RequireUser from="/history">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
        <header className="mb-8">
          <h1 className="font-serif text-3xl tracking-wide">回顧</h1>
          <p className="mt-2 text-ink-soft">你寫下的每一天，都被好好收著。</p>
        </header>
        <Suspense fallback={<HistorySkeleton />}>
          <HistoryList />
        </Suspense>
      </div>
    </RequireUser>
  );
}
