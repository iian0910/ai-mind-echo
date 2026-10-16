import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CrisisResourceList } from "@/components/CrisisResourceList";
import { LogoutButton } from "@/components/LogoutButton";
import { RequireUser } from "@/components/RequireUser";
import { getCurrentUser } from "@/lib/session";
import { ThemePicker } from "@/components/ThemePicker";
import { DISCLAIMER, PRIVACY_NOTES } from "@/lib/disclaimer";

export const metadata: Metadata = { title: "設定 | 心聆日記" };

async function AccountInfo() {
  // RequireUser 已確認登入；getCurrentUser 有 cache，這裡不會重複查詢資料庫
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/settings");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p>
        <span className="block text-sm text-ink-soft">登入信箱</span>
        {user.email}
      </p>
      <LogoutButton />
    </div>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line pt-8">
      <h2 className="mb-4 font-serif text-xl">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  return (
    <RequireUser from="/settings">
      <SettingsContent />
    </RequireUser>
  );
}

function SettingsContent() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-10 px-4 py-10 sm:py-14">
      <header>
        <h1 className="font-serif text-3xl tracking-wide">設定</h1>
      </header>

      <Section title="帳號">
        <Suspense fallback={<div className="h-10 animate-pulse rounded-xl bg-surface-muted" />}>
          <AccountInfo />
        </Suspense>
      </Section>

      <Section title="主題">
        <ThemePicker />
      </Section>

      <Section id="privacy" title="隱私說明">
        <dl className="space-y-5">
          {PRIVACY_NOTES.map((n) => (
            <div key={n.title}>
              <dt className="font-medium">{n.title}</dt>
              <dd className="mt-1 leading-relaxed text-ink-soft">{n.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="服務說明">
        <ul className="list-disc space-y-3 pl-5 leading-relaxed text-ink-soft">
          {DISCLAIMER.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Section>

      <Section title="需要有人陪你聊聊時">
        <CrisisResourceList />
      </Section>
    </div>
  );
}
