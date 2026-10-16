"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { useState, type SubmitEvent, type KeyboardEvent } from "react";
import { CrisisCard } from "@/components/CrisisCard";
import { EnvelopeAnimation } from "@/components/EnvelopeAnimation";
import { ReplyLetter } from "@/components/ReplyLetter";
import {
  DISCLAIMER_REQUIRED_EVENT,
  type ApiError,
  type CreateDiaryResponse,
} from "@/lib/apiTypes";

// 與 models/Diary 的上限一致（不直接引入 model，避免把 mongoose 打包進前端）
const CONTENT_MAX = 5000;
const TITLE_MAX = 100;
const EMOTION_MAX = 5;
const EMOTION_PRESETS = ["開心", "平靜", "感激", "期待", "疲憊", "煩躁", "委屈", "難過", "孤單", "生氣", "迷惘"];

// 即使伺服器很快回應（例如高風險直接回傳），也讓信封動畫完整播完
const MIN_ANIMATION_MS = 2400;

type Phase =
  | { name: "writing"; error?: string }
  | { name: "sending" }
  | { name: "done"; result: CreateDiaryResponse };

export function DiaryComposer() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [emotions, setEmotions] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ name: "writing" });
  const router = useRouter();

  const toggleEmotion = (e: string) =>
    setEmotions((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : prev.length < EMOTION_MAX ? [...prev, e] : prev,
    );

  const reset = () => {
    setTitle("");
    setContent("");
    setEmotions([]);
    setPhase({ name: "writing" });
  };

  async function submit() {
    if (!content.trim() || phase.name === "sending") return;
    setPhase({ name: "sending" });

    try {
      const [res] = await Promise.all([
        fetch("/api/diaries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content, emotions }),
        }),
        new Promise((resolve) => setTimeout(resolve, MIN_ANIMATION_MS)),
      ]);

      if (res.ok) {
        setPhase({ name: "done", result: (await res.json()) as CreateDiaryResponse });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const body = (await res.json().catch(() => null)) as ApiError | null;
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (body?.error.code === "DISCLAIMER_REQUIRED") {
        window.dispatchEvent(new Event(DISCLAIMER_REQUIRED_EVENT));
      }
      setPhase({ name: "writing", error: body?.error.message ?? "寄送失敗，請稍後再試" });
    } catch {
      setPhase({ name: "writing", error: "網路連線不穩定，你的文字還在，請稍後再試" });
    }
  }

  const onSubmit = (e: SubmitEvent) => {
    e.preventDefault();
    void submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  };

  if (phase.name === "sending") return <EnvelopeAnimation />;

  if (phase.name === "done") {
    const { result } = phase;
    return (
      <div className="space-y-6">
        {result.outcome === "crisis" && <CrisisCard />}
        {result.outcome === "replied" && result.diary.aiResponse && (
          <ReplyLetter reply={result.diary.aiResponse} showResources={result.riskLevel === "concern"} />
        )}
        {result.outcome === "ai_unavailable" && (
          <div className="fade-up rounded-2xl border border-line bg-surface p-6 leading-relaxed">
            <p className="font-serif text-lg">你的日記已經保存了。</p>
            <p className="mt-2 text-ink-soft">
              回信暫時寄不出去，可能是服務有點忙碌。謝謝你今天願意寫下這些。
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-accent px-6 py-2.5 text-surface transition-opacity hover:opacity-90"
          >
            再寫一篇
          </button>
          <Link
            href="/history"
            className="rounded-full border border-line px-6 py-2.5 transition-colors hover:bg-surface-muted"
          >
            回顧過去的日記
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={TITLE_MAX}
        placeholder="標題（選填）"
        aria-label="標題"
        className="w-full border-b border-line bg-transparent pb-2 font-serif text-xl outline-none placeholder:text-ink-soft/60 focus:border-accent"
      />

      <fieldset>
        <legend className="mb-2 text-sm text-ink-soft">今天的心情（最多 {EMOTION_MAX} 個，選填）</legend>
        <div className="flex flex-wrap gap-2">
          {EMOTION_PRESETS.map((e) => {
            const selected = emotions.includes(e);
            return (
              <button
                key={e}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleEmotion(e)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  selected
                    ? "border-sage bg-sage-soft text-ink"
                    : "border-line text-ink-soft hover:bg-surface-muted"
                }`}
              >
                {e}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={CONTENT_MAX}
          rows={12}
          required
          placeholder="今天發生了什麼？不用整理好，想到什麼就寫什麼。"
          aria-label="日記內容"
          className="w-full resize-y rounded-2xl border border-line bg-surface p-5 leading-loose outline-none placeholder:text-ink-soft/60 focus:border-accent"
        />
        <p className="mt-1 text-right text-xs text-ink-soft">
          {content.length} / {CONTENT_MAX}
        </p>
      </div>

      {phase.error && (
        <p role="alert" className="rounded-xl bg-care-soft px-4 py-3 text-sm text-care">
          {phase.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-ink-soft">
          送出前會自動遮蔽人名、電話等個資。
          <Link href="/settings#privacy" className="underline underline-offset-2">
            了解更多
          </Link>
        </p>
        <button
          type="submit"
          disabled={!content.trim()}
          className="flex shrink-0 items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-surface transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="size-4" aria-hidden />
          寄出
        </button>
      </div>
    </form>
  );
}
