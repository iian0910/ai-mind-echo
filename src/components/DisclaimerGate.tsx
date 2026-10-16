"use client";

import { ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DISCLAIMER_REQUIRED_EVENT, type MeResponse } from "@/lib/apiTypes";
import { DISCLAIMER } from "@/lib/disclaimer";

/**
 * 非醫療服務宣告：尚未同意（或宣告版本更新）時以 modal 擋住整個畫面。
 * 只能按下同意關閉，Esc 無效；伺服器端 POST /api/diaries 也會再次檢查。
 */
export function DisclaimerGate() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((res) => (res.ok ? (res.json() as Promise<MeResponse>) : null))
      .then((me) => {
        if (!cancelled && me?.needsDisclaimer) setOpen(true);
      })
      .catch(() => {});

    const reopen = () => setOpen(true);
    window.addEventListener(DISCLAIMER_REQUIRED_EVENT, reopen);
    return () => {
      cancelled = true;
      window.removeEventListener(DISCLAIMER_REQUIRED_EVENT, reopen);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  async function accept() {
    setSubmitting(true);
    setError(undefined);
    try {
      const res = await fetch("/api/me/disclaimer", { method: "POST" });
      if (!res.ok) throw new Error();
      setOpen(false);
    } catch {
      setError("暫時無法記錄你的同意，請稍後再試一次。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="disclaimer-title"
      onCancel={(e) => e.preventDefault()}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl"
    >
      <div className="p-6 sm:p-8">
        <ShieldCheck className="size-8 text-sage" strokeWidth={1.5} aria-hidden />
        <h2 id="disclaimer-title" className="mt-3 font-serif text-2xl">
          {DISCLAIMER.title}
        </h2>
        <ul className="mt-4 list-disc space-y-3 pl-5 leading-relaxed">
          {DISCLAIMER.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl bg-surface-muted p-4">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>我已閱讀並了解：心聆日記不是醫療或諮商服務。</span>
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-care">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!checked || submitting}
          onClick={accept}
          className="mt-5 w-full rounded-full bg-accent py-3 text-surface transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {submitting ? "記錄中……" : "我了解，開始書寫"}
        </button>
      </div>
    </dialog>
  );
}
