/**
 * The made-up group that `pnpm seed:dev` and a demo site (DEMO=on) run on: who's in it, when its
 * nights fell, and the check that keeps a demo's nightly reset away from a real group's data.
 * Pure; demo-seed.ts writes it to the database.
 */

export const DEMO_PEOPLE = [
  { id: "u-sam", name: "Sam", color: "red" },
  { id: "u-alex", name: "Alex", color: "blue" },
  { id: "u-jordan", name: "Jordan", color: "yellow" },
  { id: "u-casey", name: "Casey", color: "green" },
] as const;

/** One of the made-up members, who anyone can sign in as on a demo */
export const isDemoMember = (userId: string) => DEMO_PEOPLE.some((p) => p.id === userId);

/**
 * Why this site can't be a demo, or null when it is. A demo wipes its database every night, so
 * it needs DEMO=on and no Discord bot or server: a real group's site never runs as one.
 */
export function demoRefusal(env: Record<string, string | undefined>): string | null {
  if (env.DEMO?.trim() !== "on") return "DEMO isn't on";
  const discord = ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"].filter((name) => env[name]?.trim());
  if (discord.length) return `${discord.join(" and ")} ${discord.length === 1 ? "is" : "are"} set, so this is a real group's site`;
  return null;
}

export type SeedNight = { date: string; games: string[]; who: string[]; where: string };

const DAY = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The made-up group's calendar, worked out from today so it never goes stale: its past nights,
 * the Friday its next night falls on (at least two days off, so there's time to plan it), and
 * the Wednesday before that for the next casual night.
 */
export function demoCalendar(now: Date) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const lastFriday = new Date(today.getTime() - ((today.getUTCDay() + 2) % 7 || 7) * DAY);
  const nextFriday = new Date(lastFriday.getTime() + (lastFriday.getTime() + 7 * DAY - today.getTime() < 2 * DAY ? 14 : 7) * DAY);
  const after = (days: number) => isoDate(new Date(nextFriday.getTime() + days * DAY));
  return { today, nextNight: after(0), nightAfter: after(14), pollDays: [after(21), after(22), after(23)], nextCasual: after(-2), core: coreNights(today, lastFriday), casual: casualNights(lastFriday) };
}

/** A game night most Fridays for the last ~8 months, up to last week. Some games go by a short name, as in a real channel. */
function coreNights(today: Date, lastFriday: Date): SeedNight[] {
  const rotation = [
    ["Cascadia", "Heat"], ["Brass: Birmingham"], ["Wingspan", "The Crew"], ["Dune: Imperium"], ["Azul", "Just One"],
    ["Ark Nova"], ["Heat: Pedal to the Metal", "Skull"], ["Root"], ["Everdell", "Cascadia"], ["Lost Ruins of Arnak"],
    ["Brass: Birmingham"], ["The Quacks of Quedlinburg", "The Crew"], ["Spirit Island"], ["Heat: Pedal to the Metal"], ["Cascadia", "Azul"],
    ["Dune: Imperium"], ["Wingspan"], ["Brass"], ["Heat: Pedal to the Metal", "Cascadia"], ["Ark Nova"],
    ["Root", "Skull"], ["Dune: Imperium"], ["Cascadia"], ["Lost Ruins of Arnak", "The Crew"], ["Heat: Pedal to the Metal"],
    ["Brass: Birmingham"], ["Wavelength", "Just One"], ["Everdell"], ["Dune: Imperium", "Heat: Pedal to the Metal"],
    ["Wingspan"], ["Cascadia", "Root"], ["Brass: Birmingham"], ["Heat: Pedal to the Metal", "Azul"], ["Everdell", "Just One"],
  ];
  const hosts = ["Sam's", "Alex's", "Jordan's", "Casey's", "the game cafe"];
  const start = new Date(lastFriday.getTime() - (rotation.length - 1) * 7 * DAY);
  const nights: SeedNight[] = [];
  for (let i = 0; i < rotation.length; i++) {
    const d = new Date(start.getTime() + i * 7 * DAY + (i % 5 === 3 ? DAY : 0));
    if (d >= today) break;
    if (i % 6 === 4) continue; // skipped weeks
    const who = ["Sam", "Alex", "Jordan", "Casey", ...(i % 7 === 2 ? ["Riley"] : []), ...(i % 9 === 5 ? ["Sammy"] : [])].filter(
      (_, j) => !(i % 4 === 1 && j === 3) && !(i % 5 === 2 && j === 0),
    );
    nights.push({ date: isoDate(d), games: rotation[i], who, where: hosts[i % hosts.length] });
  }
  return nights;
}

/** A casual night every other Wednesday: lighter games, a couple of members and their friends */
function casualNights(lastFriday: Date): SeedNight[] {
  const rotation = [
    ["Just One", "Skull"], ["Azul"], ["Wavelength", "Just One"], ["Cascadia", "Splendor"], ["The Quacks of Quedlinburg", "Skull"],
    ["The Crew"], ["Cartographers", "Just One"], ["Heat: Pedal to the Metal"], ["Wavelength", "Azul"], ["Skull", "Splendor"],
    ["Just One", "The Quacks of Quedlinburg"], ["Cascadia"], ["Wavelength", "Skull"], ["Azul", "Just One"], ["Heat: Pedal to the Metal", "Skull"],
    ["Cartographers"],
  ];
  const regulars = ["Sam", "Casey", "Riley", "Morgan", "Drew", "Sammy"];
  const lastWednesday = new Date(lastFriday.getTime() - 2 * DAY);
  return rotation.map((games, i) => ({
    date: isoDate(new Date(lastWednesday.getTime() - (rotation.length - 1 - i) * 14 * DAY)),
    games,
    who: regulars.filter((_, j) => (i + j) % 4 !== 3),
    where: i % 2 ? "the game cafe" : "Casey's",
  }));
}
