import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Check } from "lucide-react";
import clsx from "clsx";
import { eq } from "drizzle-orm";
import { SITE_NAME } from "@/config";
import { db, schema } from "@/db";
import { Panel, ProgressBar, Section, Skeleton, TextLink, buttonClass } from "@/components/ui";
import { channelUrl, commandName, eventsChannel, postsNights } from "@/lib/discord";
import { discordAppUrl } from "@/lib/discord-components";
import { getNewToRank, getPlayers, getSetupStatus } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { type SetupStep, setupProgress, setupSteps } from "@/lib/setup";
import { SENTIMENT_LABEL } from "@/lib/sentiment";
import { tierHref } from "../rankings/tabs";
import { BgaForm, BggForm, ColorPicker, MergePlayersForm } from "../settings/settings-forms";

export const metadata: Metadata = { title: "Get set up" };

/**
 * Where a member gets set up, step by step: first sign-in lands here, the DM someone gets when
 * they're invited to the core group's nights links here, and Home's banner points here until it's done.
 */
export default function WelcomePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Welcome />
    </Suspense>
  );
}

async function Welcome() {
  const me = await requireUser();
  const [status, players, toRank, [profile]] = await Promise.all([
    getSetupStatus(me),
    getPlayers(),
    getNewToRank(me.id, me.playerId),
    db.select({ bga: schema.user.bgaUsername, premium: schema.user.bgaPremium }).from(schema.user).where(eq(schema.user.id, me.id)),
  ]);
  const steps = setupSteps(status);
  const progress = setupProgress(steps);
  const takenColors = players.filter((p) => p.id !== me.playerId && p.color).map((p) => p.color!);
  const events = postsNights("core") ? eventsChannel("core") : null;
  const eventsUrl = events && channelUrl(events);

  const body: Record<SetupStep["key"], ReactNode> = {
    claim: (
      <>
        <p>Old posts may list you under another name, like &ldquo;Alex&rdquo; when you signed in as &ldquo;alexb&rdquo;. Merge it into you so those plays count as yours.</p>
        <MergePlayersForm players={players.map((p) => ({ id: p.id, name: p.name, isMember: Boolean(p.userId) }))} myPlayerId={me.playerId} />
      </>
    ),
    rate: (
      <>
        <p>
          One tap per game, from {SENTIMENT_LABEL.love.emoji} to {SENTIMENT_LABEL.nope.emoji}, plus <em>Want to play</em> and 🔥{" "}
          <em>Must play</em> for the ones you want on the table next.
          {status.played > 0 ? ` ${status.played - status.unratedPlayed} of ${status.played} rated.` : " Nothing's logged with you in it yet, so this fills in after your first game."}
        </p>
        <Link href="/rankings/rate" className={buttonClass(status.rateDone ? "secondary" : "primary")}>
          Rate games
        </Link>
      </>
    ),
    rank: (
      <>
        <p>
          Put the games you&apos;ve played in order, best first. Each one takes a few quick &ldquo;this or that?&rdquo; questions; drag to adjust.
          {status.played > 0 && ` ${status.ranked} of ${status.played} placed.`}
        </p>
        {status.played > 0 && (
          <Link href={tierHref("/rankings", toRank[0]?.tier ?? "heavy")} className={buttonClass(status.rankDone ? "secondary" : "primary")}>
            Rank games
          </Link>
        )}
      </>
    ),
    bgg: (
      <>
        <p>
          Your games join the shared shelf, so the planner knows what&apos;s in reach and Discover knows what you don&apos;t need. No BGG account? Skip
          it, or <TextLink href="/settings#bgg">import a CSV</TextLink>.
        </p>
        <BggForm username={me.bggUsername} />
      </>
    ),
    bga: (
      <>
        <p>
          For playing online between game nights: the others find you on the <TextLink href="/online">Online</TextLink> page.
        </p>
        <BgaForm username={profile?.bga ?? null} premium={profile?.premium ?? false} />
      </>
    ),
  };

  return (
    <div className="max-w-2xl space-y-10">
      <header>
        <h1 className="font-display text-3xl sm:text-4xl">{progress.complete ? `You're set up, ${me.name}` : `Welcome, ${me.name}`}</h1>
        <p className="mt-2 text-slate">
          {SITE_NAME} keeps the group&apos;s plays, what everyone thinks of each game, and a shelf built from everyone&apos;s collections. A few minutes
          here make the planner and Discover&apos;s suggestions work for you.
        </p>
        <div className="mt-4 flex items-center gap-3 text-sm">
          <ProgressBar done={progress.done} total={progress.total} label="Setup progress" />
          <span className="tabular shrink-0 text-slate">
            {progress.complete ? "All done" : `${progress.done} of ${progress.total} done`}
          </span>
        </div>
        {progress.complete && (
          <p className="mt-3 text-sm">
            New games you play show up with a count beside <strong>Rankings</strong>, ready to place. <TextLink href="/">Go to Home</TextLink>
          </p>
        )}
      </header>

      <ol className="space-y-3">
        {steps.map((s, i) => (
          <Step key={s.key} n={i + 1} step={s}>
            {body[s.key]}
          </Step>
        ))}
      </ol>

      <Section title="Good to know">
        <Panel className="divide-y divide-line text-sm">
          <div className="space-y-3 p-4">
            <h3 className="font-semibold">Your meeple color</h3>
            <p className="text-slate">It marks you on plays, charts and rankings.</p>
            <ColorPicker current={me.color} taken={takenColors} />
          </div>
          <div className="space-y-1 p-4">
            <h3 className="font-semibold">Events</h3>
            <p className="text-slate">
              {eventsUrl ? (
                <>
                  Each one is posted in{" "}
                  <a href={discordAppUrl(eventsUrl) ?? eventsUrl} className="text-accent underline-offset-4 hover:underline">
                    the events channel
                  </a>{" "}
                  in Discord, with a thread. Tap <strong>Going</strong> on a post (or answer on <TextLink href="/plan">Plan</TextLink>), and make one
                  with <code className="text-xs">/{commandName()} new</code>.
                </>
              ) : (
                <>
                  They&apos;re on <TextLink href="/plan">Plan</TextLink>: say whether you&apos;re going, and help pick what to play.
                </>
              )}
            </p>
          </div>
          <div className="space-y-1 p-4">
            <h3 className="font-semibold">Every number explained</h3>
            <p className="text-slate">
              <TextLink href="/about">How it works</TextLink> says where rankings, percentages and the planner&apos;s picks come from.
            </p>
          </div>
        </Panel>
      </Section>
    </div>
  );
}

function Step({ n, step, children }: { n: number; step: SetupStep; children: ReactNode }) {
  return (
    <li>
      <Panel className={clsx("flex gap-3 p-4 sm:gap-4 sm:p-5", !step.done && !step.optional && "border-ink/70 shadow-token")}>
        <span
          className={clsx(
            "tabular mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold",
            step.done ? "border-felt bg-felt text-felt-ink" : "border-ink/40",
          )}
          aria-hidden
        >
          {step.done ? <Check className="size-3.5" strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1 space-y-3 text-sm">
          <h2 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
            {step.title}
            {step.optional && <span className="text-xs font-normal text-slate">Optional</span>}
            {step.done && <span className="sr-only">(done)</span>}
          </h2>
          <div className="space-y-3 text-slate [&_form]:text-ink">{children}</div>
        </div>
      </Panel>
    </li>
  );
}
