"use client";

import { useEffect, useState } from "react";

const MESSAGES = ["正在把信封好……", "信件寄出中……", "對方正在細細讀你的信……"];

export function EnvelopeAnimation() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timers = [setTimeout(() => setStep(1), 2000), setTimeout(() => setStep(2), 4000)];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col items-center gap-8 py-16" role="status" aria-live="polite">
      <div className="envelope-float">
        <div className="envelope" aria-hidden>
          <div className="envelope-back" />
          <div className="envelope-letter" />
          <div className="envelope-front" />
          <div className="envelope-flap" />
          <div className="envelope-seal" />
        </div>
      </div>
      <p className="font-serif text-lg text-ink-soft">{MESSAGES[step]}</p>
    </div>
  );
}
