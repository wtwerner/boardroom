"use client";

import { useRef, useState } from "react";
import { buttonClass } from "@/components/ui";

/** The link to paste into a calendar that can't be opened to it directly */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-2">
      <input ref={input} readOnly value={url} aria-label="Your calendar link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-line bg-table px-3 py-2 text-sm" />
      <button
        type="button"
        className={buttonClass("secondary", "shrink-0")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Some in-app browsers refuse: select it, so they can copy it themselves
            input.current?.focus();
          }
        }}
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
