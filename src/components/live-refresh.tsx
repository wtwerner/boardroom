"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getNightsVersion } from "@/app/actions";

/**
 * Keeps a page about nights current while it's open: every few seconds (only while the tab is
 * visible, and at once when it comes back) it asks whether anything changed, and refreshes the
 * page when it did. Answers and edits made in Discord show up without a reload.
 */
export function LiveRefresh({ nightId, every = 10_000 }: { nightId?: number; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last: string | null = null;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const version = await getNightsVersion(nightId);
        if (last !== null && version !== last) router.refresh();
        last = version;
      } catch {
        // Offline or signed out: try again next time
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = setInterval(check, every);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [nightId, every, router]);
  return null;
}
