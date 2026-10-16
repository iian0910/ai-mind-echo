"use client";

import { Check } from "lucide-react";
import { useSyncExternalStore } from "react";
import { isTheme, THEME_OPTIONS, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

// 主題的真實來源是 <html data-theme>（由 layout 的 inline script 在首次繪製前設定）
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getTheme(): Theme | null {
  const value = document.documentElement.dataset.theme;
  return isTheme(value) ? value : null;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}
  // 同步到帳號偏好；失敗不影響本機的主題切換
  void fetch("/api/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme }),
  }).catch(() => {});
}

export function ThemePicker() {
  const current = useSyncExternalStore(subscribe, getTheme, () => null);

  return (
    <div role="radiogroup" aria-label="主題" className="grid gap-3 sm:grid-cols-3">
      {THEME_OPTIONS.map(({ value, label, description }) => {
        const selected = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => applyTheme(value)}
            data-theme={value}
            className={`relative rounded-xl border-2 bg-paper p-4 text-left text-ink transition-colors ${
              selected ? "border-accent" : "border-line hover:border-ink-soft"
            }`}
          >
            <span className="mb-3 flex gap-1.5" aria-hidden>
              <span className="size-4 rounded-full bg-surface ring-1 ring-line" />
              <span className="size-4 rounded-full bg-accent" />
              <span className="size-4 rounded-full bg-sage" />
            </span>
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-ink-soft">{description}</span>
            {selected && <Check className="absolute top-3 right-3 size-4 text-accent" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}
