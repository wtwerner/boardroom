"use client";

import { useState, useTransition } from "react";
import { type ActionResult, sendConfirmation, setEmailChoice } from "@/app/actions";
import { buttonClass } from "@/components/ui";

export function EmailPromptButtons({ sent }: { sent: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await sendConfirmation()))} className={buttonClass(sent ? "secondary" : "primary")}>
        {pending ? "Sending…" : sent ? "Resend" : "Send confirmation email"}
      </button>
      <button type="button" disabled={pending} onClick={() => start(async () => setResult(await setEmailChoice("off")))} className={buttonClass("ghost")}>
        No thanks
      </button>
      {result && (
        <p role={result.ok ? "status" : "alert"} className={result.ok ? "w-full text-sm text-slate" : "w-full text-sm text-meeple-red"}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </div>
  );
}
