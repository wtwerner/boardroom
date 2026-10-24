import type { Sentiment } from "@/db/enums";

export const SENTIMENT_LABEL: Record<Sentiment, { emoji: string; label: string }> = {
  love: { emoji: "😍", label: "Love it" },
  like: { emoji: "🙂", label: "Like it" },
  meh: { emoji: "😐", label: "Meh" },
  nope: { emoji: "🙅", label: "Not for me" },
};
