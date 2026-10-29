import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DEMO, GROUP_NIGHTS, NIGHT_NAMES, NIGHT_TITLES, TIME_ZONE } from "@/config";
import { LogPlayForm } from "../../plays/log-play-form";
import { db, schema } from "@/db";
import { DateBadge, NightTag, NightWhen } from "@/components/night-row";
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
import { PastNight, PlayedSection } from "./past-night";
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
    const [members, logForm] = await Promise.all([getMembers(), nightLogForm(n)]);
    return (
      <div className="space-y-10">
        <div className="space-y-4">
          <BackLink />
          <NightHeader n={n} />
        </div>
        <PastNight n={n} members={members.map((m) => ({ id: m.id, name: m.name, color: m.color }))} logForm={logForm} />
      </div>
    );
  }

  const [[everything, shelf, chances], members, rankings, opinions, playedBy, players, stayingDates, logForm] = await Promise.all([
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
    // Once it starts, what's played can be logged as the night goes
    n.started ? nightLogForm(n) : null,
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
            guests={n.guests}
            othersComing={n.othersComing}
            capacity={n.capacity}
            myPlayerId={me.playerId}
            members={members.map((m) => ({ id: m.id, name: m.name, color: m.color, playerName: players.find((p) => p.id === m.playerId)?.name ?? null }))}
            players={players}
          />
        </Panel>
      </div>

      {logForm && <PlayedSection n={n} logForm={logForm} />}

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

/** The form to log a night's plays from its page, with its date, place and kind filled in */
async function nightLogForm(n: NightDetail) {
  if (!n.date || n.cancelled) return null;
  const [games, players] = await Promise.all([getAllGamesForPicker(), getPlayers()]);
  const played = new Set(n.plays.flatMap((p) => (p.gameId ? [p.gameId] : [])));
  // Who's logged so far, or before anything is, who said they were going
  const table = n.plays.length ? n.plays.flatMap((p) => p.players.map((s) => s.playerId)) : n.going.map((a) => a.playerId);
  return (
    <LogPlayForm
      games={games}
      players={players}
      canPost={Object.fromEntries(GROUP_NIGHTS.map((k) => [k, canPostToDiscord(k)]))}
      nightNames={NIGHT_NAMES}
      fromEvent={{
        night: n.night,
        playedOn: n.date,
        location: n.location,
        playerIds: [...new Set(table)],
        games: n.games.filter((g) => !played.has(g.game.id)).map((g) => ({ id: g.game.id, name: g.game.name })),
      }}
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
          {n.fromPlays ? when.label : <NightWhen iso={n.startsAt} soon={soonLabel(n.startsAt, TIME_ZONE)} date={`${when.label},`} keepDate />}
          {n.location && ` · ${n.location}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {n.posted && n.url && (
          <a href={discordAppUrl(n.url) ?? n.url} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
            <ExternalLink className="size-3.5" /> Open in Discord
          </a>
        )}
        {!n.cancelled && (
          <NightActions
            id={n.id}
            initial={{ night: n.night, title: n.title, date: when.date, time: when.clock, location: n.location ?? "" }}
            canDelete={n.plays.length === 0}
            canFindNewDate={!n.past}
            staying={staying}
            posted={n.posted}
            setup={{ nights: GROUP_NIGHTS, names: NIGHT_NAMES, titles: NIGHT_TITLES, discord: postsNights(n.night) }}
          />
        )}
      </div>
    </header>
  );
}
