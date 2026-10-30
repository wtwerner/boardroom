import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DEMO, GROUP_NIGHTS, NIGHT_NAMES, NIGHT_TITLES, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import { DateBadge, NightTag, NightWhen, OnNow, isOn } from "@/components/night-row";
import { LiveRefresh } from "@/components/live-refresh";
import { discordAppUrl } from "@/lib/discord-components";
import { Empty, Panel, Section, Skeleton, TextLink } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { getAllGamesForPicker, getMembers, getPlayedBy, getPlayers, getShelf, getTieredRankingLists } from "@/lib/queries";
import { claudeReady } from "@/lib/ai";
import { canPostToDiscord, postsNights } from "@/lib/discord";
import { isLegacy } from "@/lib/night";
import { getTasteChances } from "@/lib/recommend";
import { type NightDetail, loadNight } from "@/lib/events";
import { datesStaying, findingDateFor } from "@/lib/poll-store";
import { dateChoiceLabel } from "@/lib/poll-message";
import { nightWhen, soonLabel, tableFor } from "@/lib/nights";
import { GamePicker, GameSearch } from "../game-picker";
import { CasualGames } from "./casual-games";
import { CoreGames } from "./core-games";
import { NightActions } from "./night-actions";
import { LiveLog } from "./live-log";
import { PastNight, PlayedSection } from "./past-night";
import { inSentence } from "@/lib/text";
import { People } from "./people";

export const metadata: Metadata = { title: "Event" };

export default function EventPage(props: PageProps<"/events/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <NightPlan params={props.params} />
    </Suspense>
  );
}

async function NightPlan({ params }: { params: PageProps<"/events/[id]">["params"] }) {
  const me = await requireUser();
  const id = Number((await params).id);
  const n = Number.isInteger(id) ? await loadNight(id) : null;
  if (!n) notFound();
  // Back to finding a date: its poll is where it is now
  if (n.cancelled) {
    const poll = await findingDateFor(n.id);
    if (poll) redirect(`/plan#poll-${poll.id}`);
  }

  if (n.past) {
    const [members, log] = await Promise.all([getMembers(), nightLog(n)]);
    return (
      <div className="space-y-10">
        <div className="space-y-4">
          <BackLink />
          <NightHeader n={n} />
        </div>
        <LiveRefresh nightId={n.id} />
        <PastNight n={n} members={members.map((m) => ({ id: m.id, name: m.name, color: m.color }))} log={log} />
      </div>
    );
  }

  // On now: answering, planning and the recommendations are behind it, so it's only what's played
  if (n.started) {
    const log = await nightLog(n);
    return (
      <div className="space-y-10">
        <LiveRefresh nightId={n.id} />
        <div className="space-y-4">
          <BackLink />
          <NightHeader n={n} />
        </div>
        <PlayedSection n={n} log={log} title="What's been played" />
      </div>
    );
  }

  const [[everything, shelf, chances], members, rankings, opinions, playedBy, players, stayingDates] = await Promise.all([
    // Recency and "never played" come from this kind of night's plays only
    getShelf({ night: n.night }).then(async (all) => {
      const s = all.filter((g) => !isLegacy(g));
      return [all, s, await getTasteChances(s.map((g) => g.id))] as const;
    }),
    getMembers(),
    getTieredRankingLists(),
    db.select().from(schema.opinion),
    getPlayedBy(),
    db.select({ id: schema.player.id, name: schema.player.name }).from(schema.player).orderBy(schema.player.name),
    datesStaying(n.id),
  ]);
  // What Find a new date keeps: the other dates on the poll it was picked from
  const staying = stayingDates.map((d) => dateChoiceLabel(d.startsAt, d.votes, TIME_ZONE));
  const people = members.map((m) => ({ id: m.id, name: m.name, color: m.color }));
  const byId = new Map(people.map((p) => [p.id, p]));
  const table = tableFor(n.going, n.guests);
  const going = table.memberIds.flatMap((uid) => byId.get(uid) ?? []);
  const headcount = table.memberIds.length + table.others;
  // Where a game on the bring list stands, for the recommendations and search
  const bringStatus = (g: { bringerId: string | null; askedId: string | null }) => {
    if (g.bringerId === me.id) return "You're bringing it";
    if (g.bringerId) return `${byId.get(g.bringerId)?.name ?? "Someone"}'s bringing it`;
    if (g.askedId === me.id) return "You've been asked";
    if (g.askedId) return `Asked ${byId.get(g.askedId)?.name ?? "someone"}`;
    return "On the list";
  };
  const onNight = Object.fromEntries(n.games.map((g) => [g.game.id, n.night === "core" ? (g.chosen ? "Locked in" : "Proposed") : bringStatus(g)]));

  return (
    <div className="space-y-10">
      <LiveRefresh nightId={n.id} />
      <div className="space-y-4">
        <BackLink />
        <NightHeader n={n} staying={staying} />
        <Panel className="p-4">
          <People
            nightId={n.id}
            going={n.going}
            maybe={n.maybe}
            declined={n.declined}
            waitlist={n.waitlist}
            guests={n.guests}
            othersComing={n.othersComing}
            capacity={n.capacity}
            myPlayerId={me.playerId}
            members={members.map((m) => ({ id: m.id, name: m.name, color: m.color, playerName: players.find((p) => p.id === m.playerId)?.name ?? null }))}
            players={players}
          />
        </Panel>
      </div>

      <Section title={n.night === "core" ? "The game" : "What's coming"}>
        {n.night === "core" ? (
          <CoreGames games={n.games} going={going.length ? going : people} meId={me.id} lockLinks={DEMO} />
        ) : (
          <CasualGames
            nightId={n.id}
            games={n.games}
            members={people}
            meId={me.id}
            headcount={headcount}
            owners={Object.fromEntries(
              n.games.map((g) => [
                g.game.id,
                (everything.find((s) => s.id === g.game.id)?.ownerIds ?? []).flatMap((uid) => {
                  const p = byId.get(uid);
                  return p ? [{ id: p.id, name: p.name, coming: table.memberIds.includes(uid) }] : [];
                }),
              ]),
            )}
          />
        )}
        {everything.length > 0 && (
          <div className="mt-4">
            <GameSearch
              night={n.night}
              nightId={n.id}
              onNight={onNight}
              members={people}
              comingIds={table.memberIds}
              meId={me.id}
              games={everything.map((g) => ({
                id: g.id,
                name: g.name,
                thumbnail: g.thumbnail,
                minPlayers: g.minPlayers,
                maxPlayers: g.maxPlayers,
                minPlaytime: g.minPlaytime,
                maxPlaytime: g.maxPlaytime,
                ownerIds: g.ownerIds,
              }))}
            />
          </div>
        )}
      </Section>

      <Section title={n.night === "core" ? "Recommendations to propose" : "Recommendations to bring"}>
        {shelf.length === 0 ? (
          <Empty>
            Nothing on the shelf to pick from yet. <TextLink href="/settings#bgg">Add a BGG collection</TextLink> first.
          </Empty>
        ) : (
          <GamePicker
            key={`${n.id}-${table.memberIds.join(",")}-${table.others}`}
            night={n.night}
            nightName={NIGHT_NAMES[n.night]}
            nightId={n.id}
            onNight={onNight}
            going={n.going.length + n.guests > 0 ? table : null}
            meId={me.id}
            members={people}
            games={shelf.map((g) => ({
              id: g.id,
              name: g.name,
              thumbnail: g.thumbnail,
              minPlayers: g.minPlayers,
              maxPlayers: g.maxPlayers,
              bestPlayers: g.bestPlayers,
              minPlaytime: g.minPlaytime,
              maxPlaytime: g.maxPlaytime,
              weight: g.weight,
              ownerIds: g.ownerIds,
              lastPlayedOn: g.lastPlayed,
              playCount: g.plays,
              playedBy: playedBy.get(g.id) ?? [],
            }))}
            opinions={opinions.map((o) => ({
              userId: o.userId,
              gameId: o.gameId,
              sentiment: o.sentiment,
              wantToPlay: o.wantToPlay,
              mustPlay: o.mustPlay,
            }))}
            rankings={[rankings.heavy, rankings.light]}
            chances={chances}
            today={new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE })}
            aiEnabled={claudeReady()}
          />
        )}
      </Section>
    </div>
  );
}

/**
 * Logging what's played from the night's page, as it's played: the games planned or brought to
 * tap, with whoever's playing (the last game's table, or before anything is logged, who said
 * they were going)
 */
async function nightLog(n: NightDetail) {
  if (!n.date || n.cancelled) return null;
  const [games, players, members] = await Promise.all([getAllGamesForPicker(), getPlayers(), n.night === "casual" ? getMembers() : []]);
  const bringers = new Map(members.map((m) => [m.id, m.name]));
  const played = new Set(n.plays.flatMap((p) => (p.gameId ? [p.gameId] : [])));
  const last = n.plays.at(-1);
  const seated = last ? last.players.map((s) => s.playerId) : n.going.map((a) => a.playerId);
  return (
    <LiveLog
      nightId={n.id}
      night={n.night}
      playedOn={n.date}
      location={n.location}
      plays={n.plays}
      planned={n.games
        .filter((g) => !played.has(g.game.id))
        // The game locked in first, then the most wanted
        .sort((a, b) => Number(b.chosen) - Number(a.chosen) || b.votes.length - a.votes.length)
        .map((g) => ({ id: g.game.id, name: g.game.name, note: n.night === "core" ? (g.chosen ? "Locked in" : "Proposed") : g.bringerId ? `${bringers.get(g.bringerId) ?? "Someone"}'s bringing it` : null }))}
      games={games}
      players={players}
      seated={seated}
      canPost={Object.fromEntries(GROUP_NIGHTS.map((k) => [k, canPostToDiscord(k)]))}
      nightNames={NIGHT_NAMES}
      postLabel={`Post it to ${GROUP_NIGHTS.length > 1 ? `the ${inSentence(NIGHT_NAMES[n.night])}'s` : "the"} Discord plays channel${n.posted ? " and the event's thread" : ""}`}
      canEnd={n.started && !n.past && n.plays.length > 0}
      demo={DEMO}
      collapsed={n.past && n.plays.length > 0}
    />
  );
}

function BackLink() {
  return (
    <TextLink href="/plan" className="inline-flex items-center gap-1 text-sm">
      <ArrowLeft className="size-3.5" /> All events
    </TextLink>
  );
}

/** When and where, its post in Discord, and edit and delete */
function NightHeader({ n, staying = [] }: { n: NightDetail; staying?: string[] }) {
  const when = nightWhen(n.startsAt, TIME_ZONE);
  return (
    <header className="flex flex-wrap items-start gap-4">
      <DateBadge iso={n.startsAt} night={n.night} size="lg" />
      <div className="min-w-48 flex-1 basis-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl leading-tight sm:text-3xl">{n.title}</h1>
          <NightTag night={n.night} />
          {n.cancelled && <span className="rounded-full bg-meeple-red/12 px-2 py-0.5 text-xs font-medium">Cancelled</span>}
        </div>
        <p className="text-slate">
          {n.fromPlays ? (
            when.label
          ) : isOn(n) ? (
            <>
              <OnNow className="mr-1.5" />
              since {when.time}
            </>
          ) : (
            <NightWhen iso={n.startsAt} soon={n.past ? null : soonLabel(n.startsAt, TIME_ZONE)} date={`${when.label},`} keepDate />
          )}
          {n.location && ` · ${n.location}`}
        </p>
      </div>
      <div className="flex max-w-full shrink-0 flex-wrap items-center gap-3">
        {n.posted && n.url && (
          <a href={discordAppUrl(n.url) ?? n.url} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
            <ExternalLink className="size-3.5" /> Open in Discord
          </a>
        )}
        {!n.cancelled && (
          <NightActions
            id={n.id}
            initial={{ night: n.night, title: n.title, date: when.date, time: when.clock, location: n.location ?? "", capacity: n.capacity }}
            canDelete={n.plays.length === 0}
            canFindNewDate={!n.started}
            staying={staying}
            posted={n.posted}
            setup={{ nights: GROUP_NIGHTS, names: NIGHT_NAMES, titles: NIGHT_TITLES, discord: postsNights(n.night) }}
          />
        )}
      </div>
    </header>
  );
}
