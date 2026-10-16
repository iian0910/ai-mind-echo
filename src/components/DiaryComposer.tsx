"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, Send, X } from "lucide-react";
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
// 與 /api/diaries 的 customTerms 上限一致
const PRIVATE_NAME_MAX = 30;
const PRIVATE_NAME_LENGTH_MAX = 50;

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
  // 自動偵測漏掉的名字由使用者補上；只用於本次脫敏，「再寫一篇」時保留，方便同一批人反覆出現
  const [privateNames, setPrivateNames] = useState<string[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "writing" });
  const router = useRouter();

  const toggleEmotion = (e: string) =>
    setEmotions((prev) =>
      prev.includes(e) ? prev.filter((x) => x !== e) : prev.length < EMOTION_MAX ? [...prev, e] : prev,
    );

  const addPrivateName = () => {
    const name = nameDraft.trim();
    if (name && !privateNames.includes(name) && privateNames.length < PRIVATE_NAME_MAX) {
      setPrivateNames([...privateNames, name]);
    }
    setNameDraft("");
  };

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 輸入法組字中按 Enter 是選字，不是送出
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addPrivateName();
    }
  };

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
          body: JSON.stringify({
            title,
            content,
            emotions,
            customTerms: privateNames.map((term) => ({ term, type: "PERSON" })),
          }),
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

      <details className="rounded-2xl border border-line px-4 py-3" open={privateNames.length > 0}>
        <summary className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
          <EyeOff className="size-4" aria-hidden />
          額外要遮蔽的名字
          {privateNames.length > 0 && `（${privateNames.length}）`}
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          自動遮蔽可能漏掉沒有姓氏或稱謂的名字（例如「志明」）。加在這裡的名字一定會先換成代號再送給 AI，不會存檔。
        </p>
        <div className="mt-3 flex gap-2">
          <input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={onNameKeyDown}
            maxLength={PRIVATE_NAME_LENGTH_MAX}
            disabled={privateNames.length >= PRIVATE_NAME_MAX}
            placeholder="輸入名字後按 Enter"
            aria-label="要遮蔽的名字"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-ink-soft/60 focus:border-accent"
          />
          <button
            type="button"
            onClick={addPrivateName}
            disabled={!nameDraft.trim()}
            className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-sm transition-colors hover:bg-surface-muted disabled:opacity-40"
          >
            加入
          </button>
        </div>
        {privateNames.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {privateNames.map((name) => (
              <li
                key={name}
                className="flex items-center gap-1 rounded-full border border-sage bg-sage-soft py-1 pl-3 pr-1.5 text-sm"
              >
                {name}
                <button
                  type="button"
                  onClick={() => setPrivateNames(privateNames.filter((n) => n !== name))}
                  aria-label={`移除 ${name}`}
                  className="rounded-full p-0.5 text-ink-soft hover:text-ink"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>

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
