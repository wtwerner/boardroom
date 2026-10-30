"use client";

import { type ReactNode, useActionState, useState, useTransition } from "react";
import clsx from "clsx";
import { type ActionResult, type GroupSettingsResult, saveGroupSettings, setAdmin } from "@/app/actions";
import { Panel, Section, buttonClass } from "@/components/ui";
import type { GroupSettings, SettingKey } from "@/lib/settings";
import { inSentence, titleCase } from "@/lib/text";

const input = "w-full rounded-lg border border-line bg-table px-3 py-2 text-sm";

type Channel = { id: string; name: string; forum: boolean };
type Role = { id: string; name: string };
type Discord = { channels: Channel[]; roles: Role[]; interactions: boolean };

export function GroupSettingsForm({ settings, timeZones, claude, discord, readOnly }: { settings: GroupSettings; timeZones: string[]; claude: boolean; discord: Discord | null; readOnly: boolean }) {
  const [state, action, pending] = useActionState<GroupSettingsResult | null, FormData>(saveGroupSettings, null);
  const errors = state && !state.ok && "fields" in state ? state.fields : {};
  return (
    <form action={action} className="space-y-10">
      {/* Saved values come back tidied (a blank name is the default again), so the fields start over from them */}
      <fieldset disabled={readOnly} className="space-y-10">
        <Fields key={JSON.stringify(settings)} settings={settings} timeZones={timeZones} claude={claude} discord={discord} errors={errors} />
      </fieldset>
      {!readOnly && <div className="sticky bottom-24 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-token md:bottom-4">
        <button className={buttonClass("primary")} disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state && (
          <p role="status" className={clsx("text-sm", state.ok ? "text-slate" : "text-meeple-red")}>
            {state.ok ? state.message : state.error}
          </p>
        )}
      </div>}
    </form>
  );
}

function Fields({ settings: s, timeZones, claude, discord, errors }: { settings: GroupSettings; timeZones: string[]; claude: boolean; discord: Discord | null; errors: Partial<Record<SettingKey, string>> }) {
  const [casual, setCasual] = useState(s.casualNight);
  const [useClaude, setUseClaude] = useState(s.claude);
  const [names, setNames] = useState({ core: s.coreNightName, casual: s.casualNightName });
  const field = (key: SettingKey) => ({ id: key, error: errors[key] });

  return (
    <>
      <Section title="The group">
        <Panel className="space-y-4 p-4">
          <Field label="Site name" hint="In the header, page titles, and on the button under plays posted to Discord." {...field("siteName")}>
            <input id="siteName" name="siteName" defaultValue={s.siteName} maxLength={40} className={input} />
          </Field>
          <Field label="Time zone" hint="Where the group plays, for event times and play dates." {...field("timeZone")}>
            <select id="timeZone" name="timeZone" defaultValue={s.timeZone} className={input}>
              {(timeZones.includes(s.timeZone) ? timeZones : [s.timeZone, ...timeZones]).map((tz) => (
                <option key={tz} value={tz}>{tz.replaceAll("_", " ")}</option>
              ))}
            </select>
          </Field>
        </Panel>
      </Section>

      <Section title="Nights">
        <Panel className="space-y-4 p-4">
          <NightFields night="core" names={names} setNames={setNames} title={s.coreNightTitle} minPeople={s.coreMinPeople} errors={errors} />
          <Field label="Reminder" hint="Hours before an event starts that its channel gets a ping for whoever's going or a maybe. 0 turns it off." {...field("reminderHours")}>
            <input id="reminderHours" name="reminderHours" type="number" min={0} max={72} step={1} defaultValue={s.reminderHours} className={clsx(input, "max-w-28")} />
          </Field>
          <div className="border-t border-line pt-4">
            <Toggle name="casualNight" checked={casual} onChange={setCasual} label="A casual night too">
              A second, lighter night with guests, with its own channels and picks.
            </Toggle>
          </div>
          {casual && <NightFields night="casual" names={names} setNames={setNames} title={s.casualNightTitle} minPeople={s.casualMinPeople} errors={errors} />}
        </Panel>
      </Section>

      <Section title="Rankings">
        <Panel className="p-4">
          <Field label="Heavy from BGG weight" hint="Games this heavy or heavier are ranked with the heavy games, the rest with the light ones." {...field("heavyWeight")}>
            <input id="heavyWeight" name="heavyWeight" type="number" min={1} max={5} step={0.05} defaultValue={s.heavyWeight} className={clsx(input, "max-w-28")} />
          </Field>
        </Panel>
      </Section>

      {claude && (
        <Section title="Claude">
          <Panel className="space-y-4 p-4">
            <Toggle name="claude" checked={useClaude} onChange={setUseClaude} label="Use Claude">
              Picks on Discover and an event&apos;s page, and reading hand-written play posts the parser can&apos;t.
            </Toggle>
            {useClaude && (
              <Field label="Picks a day" hint="How many times each person can ask for Claude's picks in a day. Keeps the Anthropic bill predictable." {...field("claudeIdeasPerDay")}>
                <input id="claudeIdeasPerDay" name="claudeIdeasPerDay" type="number" min={1} max={50} step={1} defaultValue={s.claudeIdeasPerDay} className={clsx(input, "max-w-28")} />
              </Field>
            )}
          </Panel>
        </Section>
      )}

      {discord && (
        <Section title="Discord">
          <Panel className="space-y-4 p-4">
            <Field label="Member role" hint="Only people with this role can sign in, and only they can answer for the group's own events. With none, anyone in the server can." {...field("memberRole")}>
              <RolePicker id="memberRole" value={s.memberRole} roles={discord.roles} none="None: anyone in the server" />
            </Field>
            <DiscordNight night="core" name={names.core} showName={casual} settings={s} discord={discord} errors={errors} />
            <Field label="Welcome channel" hint="Where someone invited to the group's events gets a hello. Left empty, it's the announcements channel, then the events channel, then the plays channel." {...field("welcomeChannel")}>
              <ChannelPicker id="welcomeChannel" value={s.welcomeChannel} channels={discord.channels} none="The usual place" />
            </Field>
            {casual && <DiscordNight night="casual" name={names.casual} showName settings={s} discord={discord} errors={errors} />}
          </Panel>
        </Section>
      )}
    </>
  );
}

type Names = { core: string; casual: string };

function NightFields({
  night,
  names,
  setNames,
  title,
  minPeople,
  errors,
}: {
  night: "core" | "casual";
  names: Names;
  setNames: (n: Names) => void;
  title: string | null;
  minPeople: number;
  errors: Partial<Record<SettingKey, string>>;
}) {
  const nameKey = night === "core" ? "coreNightName" : "casualNightName";
  const titleKey = night === "core" ? "coreNightTitle" : "casualNightTitle";
  const minKey = night === "core" ? "coreMinPeople" : "casualMinPeople";
  const fallback = night === "core" ? "Game night" : "Casual night";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={night === "core" ? "What your events are called" : "What the casual night is called"} id={nameKey} error={errors[nameKey]}>
        <input id={nameKey} name={nameKey} defaultValue={names[night]} placeholder={fallback} maxLength={30} onChange={(e) => setNames({ ...names, [night]: e.target.value || fallback })} className={input} />
      </Field>
      <Field label="New events' title" hint="{date} is its date and {game} the game locked in." id={titleKey} error={errors[titleKey]}>
        <input id={titleKey} name={titleKey} defaultValue={title ?? ""} placeholder={`{date} ${titleCase(names[night])}`} maxLength={80} className={input} />
      </Field>
      <Field label="Fewest to set a date" hint="Picking a date, a date with fewer who can come shows as too few." id={minKey} error={errors[minKey]}>
        <input id={minKey} name={minKey} type="number" min={1} max={50} step={1} defaultValue={minPeople} className={clsx(input, "max-w-28")} />
      </Field>
    </div>
  );
}

function DiscordNight({ night, name, showName, settings: s, discord, errors }: { night: "core" | "casual"; name: string; showName: boolean; settings: GroupSettings; discord: Discord; errors: Partial<Record<SettingKey, string>> }) {
  const keys =
    night === "core"
      ? { plays: "playsChannel", events: "coreEventsChannel", announce: "coreAnnounceChannel", ping: "coreNightPing" }
      : { plays: "casualChannel", events: "casualEventsChannel", announce: "casualAnnounceChannel", ping: "casualNightPing" };
  const forWhom = showName ? ` for ${inSentence(name)}` : "";
  return (
    <div className="space-y-4 border-t border-line pt-4">
      {showName && <h3 className="text-sm font-semibold">{name}</h3>}
      <Field label={`Plays channel${forWhom}`} hint="Plays logged on the site are posted here, and plays written here by hand are read in." id={keys.plays} error={errors[keys.plays as SettingKey]}>
        <ChannelPicker id={keys.plays} value={s[keys.plays as SettingKey] as string | null} channels={discord.channels} none="None" />
      </Field>
      <Field
        label={`Events channel${forWhom}`}
        hint={discord.interactions ? "Each event is posted here with a thread and buttons to answer. A text channel or a forum." : "Posting events needs DISCORD_PUBLIC_KEY set, so people can answer with the buttons."}
        id={keys.events}
        error={errors[keys.events as SettingKey]}
      >
        <ChannelPicker id={keys.events} value={s[keys.events as SettingKey] as string | null} channels={discord.channels} none="None" />
      </Field>
      <Field label={`Announcements channel${forWhom}`} hint="Optional, for an events channel people don't read as they chat, like a forum. Each event is announced here too, linking to its post." id={keys.announce} error={errors[keys.announce as SettingKey]}>
        <ChannelPicker id={keys.announce} value={s[keys.announce as SettingKey] as string | null} channels={discord.channels} none="None" />
      </Field>
      <Field label="Ping when an event is posted" hint="Edits never ping. @here, @everyone and roles that can't be mentioned need the bot to have Mention All Roles." id={keys.ping} error={errors[keys.ping as SettingKey]}>
        <RolePicker id={keys.ping} value={s[keys.ping as SettingKey] as string | null} roles={discord.roles} none="Nobody" extra={[["here", "@here"], ["everyone", "@everyone"]]} />
      </Field>
    </div>
  );
}

function Field({ label, hint, id, error, children }: { label: string; hint?: string; id: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children}
      {error ? (
        <p className="text-xs text-meeple-red">{error}</p>
      ) : (
        hint && <p className="text-xs text-slate">{hint}</p>
      )}
    </div>
  );
}

/** A checkbox that always sends a value, so turning it off is saved too */
function Toggle({ name, checked, onChange, label, children }: { name: SettingKey; checked: boolean; onChange: (v: boolean) => void; label: string; children: ReactNode }) {
  return (
    <label className="flex items-start gap-3">
      <input type="hidden" name={name} value={checked ? "on" : "off"} />
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--felt)]" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate">{children}</span>
      </span>
    </label>
  );
}

/** A channel from the server, or a pasted id when the bot can't list them */
function ChannelPicker({ id, value, channels, none }: { id: string; value: string | null; channels: Channel[]; none: string }) {
  if (!channels.length) return <input id={id} name={id} defaultValue={value ?? ""} placeholder="Channel id" inputMode="numeric" className={input} />;
  return (
    <select id={id} name={id} defaultValue={value ?? ""} className={input}>
      <option value="">{none}</option>
      {/* Keep a channel that's gone (or the bot can't see) selectable, so saving doesn't quietly clear it */}
      {value && !channels.some((c) => c.id === value) && <option value={value}>Unknown channel ({value})</option>}
      {channels.map((c) => (
        <option key={c.id} value={c.id}>#{c.name}{c.forum ? " (forum)" : ""}</option>
      ))}
    </select>
  );
}

function RolePicker({ id, value, roles, none, extra = [] }: { id: string; value: string | null; roles: Role[]; none: string; extra?: [string, string][] }) {
  if (!roles.length && !extra.length) return <input id={id} name={id} defaultValue={value ?? ""} placeholder="Role id" inputMode="numeric" className={input} />;
  const known = extra.some(([v]) => v === value) || roles.some((r) => r.id === value);
  return (
    <select id={id} name={id} defaultValue={value ?? ""} className={input}>
      <option value="">{none}</option>
      {value && !known && <option value={value}>Unknown role ({value})</option>}
      {extra.map(([v, label]) => (
        <option key={v} value={v}>{label}</option>
      ))}
      {roles.map((r) => (
        <option key={r.id} value={r.id}>@{r.name}</option>
      ))}
    </select>
  );
}

export function AdminList({ members, meId, readOnly }: { members: { id: string; name: string; isAdmin: boolean }[]; meId: string; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pick, setPick] = useState("");
  const admins = members.filter((m) => m.isAdmin);
  const others = members.filter((m) => !m.isAdmin);
  const change = (userId: string, admin: boolean) =>
    start(async () => {
      setResult(await setAdmin(userId, admin));
      setPick("");
    });

  return (
    <div className="space-y-4">
      {admins.length > 0 && (
        <ul className="divide-y divide-line">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>
                {a.name}
                {a.id === meId && <span className="text-xs text-slate"> (you)</span>}
              </span>
              {admins.length > 1 && !readOnly && (
                <button type="button" disabled={pending} onClick={() => change(a.id, false)} className={buttonClass("ghost", "text-xs")}>
                  {a.id === meId ? "Step down" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && !readOnly && (
        <div className="flex flex-wrap gap-2">
          <select aria-label="Member to make an admin" value={pick} onChange={(e) => setPick(e.target.value)} className={clsx(input, "w-auto min-w-40 flex-1")}>
            <option value="">{admins.length ? "Choose a member" : "Choose who's first"}</option>
            {others.map((m) => (
              <option key={m.id} value={m.id}>{m.id === meId ? `${m.name} (you)` : m.name}</option>
            ))}
          </select>
          <button type="button" disabled={pending || !pick} onClick={() => change(pick, true)} className={buttonClass("secondary")}>
            Make admin
          </button>
        </div>
      )}
      {result && (
        <p role="status" className={clsx("text-sm", result.ok ? "text-slate" : "text-meeple-red")}>
          {result.ok ? result.message : result.error}
        </p>
      )}
    </div>
  );
}
