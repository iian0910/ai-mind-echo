import { CrisisResourceList } from "@/components/CrisisResourceList";
import type { DiaryDTO } from "@/lib/apiTypes";

type Reply = NonNullable<DiaryDTO["aiResponse"]>;

export function ReplyLetter({ reply, showResources }: { reply: Reply; showResources?: boolean }) {
  const paragraphs = reply.content.split(/\n+/).filter((p) => p.trim());

  return (
    <article className="fade-up rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8">
      <p className="text-sm tracking-widest text-accent">給你的回信</p>
      <div className="mt-4 space-y-4 font-serif text-[1.05rem] leading-loose">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <p className="mt-6 text-right font-serif text-ink-soft">—— 心聆</p>

      <dl className="mt-6 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-ink-soft">我讀到的情緒</dt>
          <dd className="mt-2 flex flex-wrap gap-2">
            {reply.identifiedEmotions.map((e) => (
              <span key={e} className="rounded-full bg-sage-soft px-3 py-1 text-ink">
                {e}
              </span>
            ))}
          </dd>
        </div>
        {reply.needsSummary && (
          <div>
            <dt className="text-ink-soft">你此刻或許需要</dt>
            <dd className="mt-2 leading-relaxed">{reply.needsSummary}</dd>
          </div>
        )}
      </dl>

      {showResources && (
        <div className="mt-6 rounded-xl bg-care-soft p-4">
          <p className="mb-3 text-sm leading-relaxed">
            如果這些感受變得很重，你不需要一個人撐著。這些專線都有人願意聽你說：
          </p>
          <CrisisResourceList includeEmergency={false} />
        </div>
      )}

      <p className="mt-6 text-xs text-ink-soft">
        這封回信由 AI 撰寫，僅作為陪伴，不構成診斷或專業建議。
      </p>
    </article>
  );
}
