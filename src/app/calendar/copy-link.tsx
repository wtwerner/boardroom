"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";

/** The link to paste into a calendar that can't be opened to it directly */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={url} aria-label="Your calendar link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm" />
      <button
        type="button"
        className={buttonClass("secondary", "shrink-0")}
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        }}
      >
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}
