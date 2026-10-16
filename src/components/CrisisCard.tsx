import { HeartHandshake } from "lucide-react";
import { CrisisResourceList } from "@/components/CrisisResourceList";
import { CRISIS_CARE_MESSAGE } from "@/lib/crisisResources";

export function CrisisCard() {
  return (
    <section
      aria-labelledby="crisis-title"
      className="fade-up rounded-2xl border border-care/30 bg-care-soft p-6 sm:p-8"
    >
      <HeartHandshake className="size-8 text-care" strokeWidth={1.5} aria-hidden />
      <h2 id="crisis-title" className="mt-3 font-serif text-2xl">
        {CRISIS_CARE_MESSAGE.title}
      </h2>
      <div className="mt-4 space-y-3 leading-relaxed">
        {CRISIS_CARE_MESSAGE.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="mt-6">
        <CrisisResourceList />
      </div>
      <p className="mt-4 text-sm text-ink-soft">你的日記已經安全地保存下來了。</p>
    </section>
  );
}
