import type { ReactNode } from "react";
import { SITE_NAME } from "@/config";
import { Meeple } from "@/components/ui";

/** The page around signing in, joining and setting up. Its page awaits loadSettings() first */
export function SignInShell({ intro, children }: { intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-felt px-4 py-10 text-felt-ink">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex justify-center gap-1.5" aria-hidden>
          {(["red", "blue", "yellow", "green", "purple"] as const).map((c, i) => (
            <Meeple key={c} color={c} className={i === 2 ? "size-10 -translate-y-1" : "size-8"} />
          ))}
        </div>
        <h1 className="font-display text-5xl">{SITE_NAME}</h1>
        {intro && <div className="mt-3 text-felt-ink/75">{intro}</div>}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}

/** Why a link, or a page, can't be used */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-black/20 px-3 py-2 text-sm">
      {children}
    </p>
  );
}
