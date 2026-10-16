"use client";

import Link from "next/link";
import { HeartHandshake, Trash2 } from "lucide-react";
import { useState } from "react";
import { CrisisResourceList } from "@/components/CrisisResourceList";
import { formatDiaryDate, type DiaryDTO } from "@/lib/apiTypes";

const PAGE_SIZE = 20;

function DeleteControl({ diaryId, onDeleted }: { diaryId: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function remove() {
    setPending(true);
    setError(false);
    try {
      const res = await fetch(`/api/diaries/${diaryId}`, { method: "DELETE" });
      // 404 代表已經不存在（例如在另一個分頁刪過），同樣從畫面移除
      if (!res.ok && res.status !== 404) throw new Error();
      onDeleted();
    } catch {
      setError(true);
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="刪除這篇日記"
        className="rounded-full p-1.5 text-ink-soft transition-colors hover:bg-surface-muted hover:text-care"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label="確認刪除" className="flex items-center gap-2 text-sm">
      <span className="text-care">{error ? "刪除失敗，再試一次？" : "刪除後無法復原"}</span>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded-full bg-care px-3 py-1 text-surface disabled:opacity-50"
      >
        {pending ? "刪除中" : "刪除"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="rounded-full border border-line px-3 py-1"
      >
        取消
      </button>
    </div>
  );
}

function DiaryEntry({ diary, onDeleted }: { diary: DiaryDTO; onDeleted: () => void }) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <time dateTime={diary.createdAt} className="text-xs text-ink-soft">
          {formatDiaryDate(diary.createdAt)}
        </time>
        <DeleteControl diaryId={diary.id} onDeleted={onDeleted} />
      </div>
      {diary.title && <h2 className="mt-1 font-serif text-lg">{diary.title}</h2>}
      {diary.emotions.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {diary.emotions.map((e) => (
            <span key={e} className="rounded-full bg-sage-soft px-2.5 py-0.5 text-xs">
              {e}
            </span>
          ))}
        </p>
      )}
      <p className="mt-3 line-clamp-4 whitespace-pre-line leading-relaxed">{diary.content}</p>

      {diary.isFlaggedRisk ? (
        <details className="mt-4 rounded-xl bg-care-soft p-4 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-care">
            <HeartHandshake className="size-4" aria-hidden />
            那天的你辛苦了，這些專線一直都在
          </summary>
          <div className="mt-3">
            <CrisisResourceList />
          </div>
        </details>
      ) : diary.aiResponse ? (
        <details className="mt-4 rounded-xl bg-surface-muted p-4">
          <summary className="cursor-pointer text-sm text-accent">閱讀回信</summary>
          <div className="mt-3 space-y-3 font-serif leading-loose">
            {diary.aiResponse.content
              .split(/\n+/)
              .filter((p) => p.trim())
              .map((p, i) => (
                <p key={i}>{p}</p>
              ))}
          </div>
          {diary.aiResponse.identifiedEmotions.length > 0 && (
            <p className="mt-3 text-xs text-ink-soft">
              讀到的情緒：{diary.aiResponse.identifiedEmotions.join("、")}
            </p>
          )}
        </details>
      ) : (
        <p className="mt-4 text-xs text-ink-soft">這篇沒有收到回信。</p>
      )}
    </li>
  );
}

export function DiaryTimeline({ initial }: { initial: DiaryDTO[] }) {
  const [diaries, setDiaries] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function loadMore() {
    const last = diaries.at(-1);
    if (!last) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), before: last.createdAt });
      const res = await fetch(`/api/diaries?${params}`);
      if (!res.ok) throw new Error();
      const { diaries: next } = (await res.json()) as { diaries: DiaryDTO[] };
      setDiaries((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (diaries.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center">
        <p className="font-serif text-lg">這裡還是空白的</p>
        <p className="mt-2 text-sm text-ink-soft">寫下第一篇日記，它會被好好收在這裡。</p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-accent px-6 py-2.5 text-surface hover:opacity-90"
        >
          開始書寫
        </Link>
      </div>
    );
  }

  return (
    <>
      <ol className="space-y-4">
        {diaries.map((d) => (
          <DiaryEntry
            key={d.id}
            diary={d}
            onDeleted={() => setDiaries((prev) => prev.filter((x) => x.id !== d.id))}
          />
        ))}
      </ol>
      {hasMore && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-full border border-line px-6 py-2.5 text-sm transition-colors hover:bg-surface-muted disabled:opacity-50"
          >
            {loading ? "載入中……" : "看更早的日記"}
          </button>
          {error && <p className="mt-2 text-sm text-care">載入失敗，請再試一次。</p>}
        </div>
      )}
    </>
  );
}
