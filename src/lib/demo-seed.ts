import "server-only";
import { and, eq } from "drizzle-orm";
import { CASUAL_NIGHT, CLAUDE, TIME_ZONE } from "@/config";
import { db, schema } from "@/db";
import type { RsvpStatus } from "@/db/enums";
import { DEMO_PEOPLE, demoCalendar, demoRefusal } from "./demo";
import { nightTitle, zonedToUtc } from "./nights";
import { parsePlayMessage } from "./play-parser";
import { loadSettings } from "./settings-store";
import { savePlay } from "./sync";

// [bggId, name, year, min, max, best, minTime, maxTime, weight, rating, owners]
const GAMES: [number, string, number, number, number, number[], number, number, number, number, string[]][] = [
  [295947, "Cascadia", 2021, 1, 4, [3, 4], 30, 45, 1.85, 7.9, ["u-sam"]],
  [266192, "Wingspan", 2019, 1, 5, [3], 40, 70, 2.45, 8.0, ["u-alex"]],
  [224517, "Brass: Birmingham", 2018, 2, 4, [3, 4], 60, 120, 3.87, 8.6, ["u-jordan"]],
  [342942, "Ark Nova", 2021, 1, 4, [2], 90, 150, 3.77, 8.5, ["u-alex"]],
  [366013, "Heat: Pedal to the Metal", 2022, 1, 6, [4, 5, 6], 30, 60, 2.19, 8.0, ["u-sam", "u-casey"]],
  [316554, "Dune: Imperium", 2020, 1, 4, [3, 4], 60, 120, 3.03, 8.4, ["u-casey"]],
  [284083, "The Crew: The Quest for Planet Nine", 2019, 2, 5, [4], 20, 20, 1.98, 7.8, ["u-sam"]],
  [162886, "Spirit Island", 2017, 1, 4, [2, 3], 90, 120, 4.06, 8.3, ["u-jordan"]],
  [237182, "Root", 2018, 2, 4, [4], 60, 90, 3.69, 8.0, ["u-jordan"]],
  [199792, "Everdell", 2018, 1, 4, [3], 40, 80, 2.8, 8.0, ["u-casey"]],
  [230802, "Azul", 2017, 2, 4, [2, 3], 30, 45, 1.76, 7.7, ["u-alex", "u-sam"]],
  [254640, "Just One", 2018, 3, 7, [6, 7], 20, 20, 1.05, 7.6, ["u-casey"]],
  [312484, "Lost Ruins of Arnak", 2020, 1, 4, [3], 30, 120, 2.92, 8.1, ["u-sam"]],
  [244521, "The Quacks of Quedlinburg", 2018, 2, 4, [4], 45, 45, 1.94, 7.8, ["u-alex"]],
  [263918, "Cartographers", 2019, 1, 100, [4, 5, 6], 30, 45, 1.88, 7.6, ["u-jordan"]],
  [262543, "Wavelength", 2019, 2, 12, [6, 7, 8], 30, 45, 1.13, 7.3, ["u-casey"]],
  [167791, "Terraforming Mars", 2016, 1, 5, [3], 120, 120, 3.26, 8.4, ["u-alex"]],
  [174430, "Gloomhaven", 2017, 1, 4, [3], 60, 120, 3.91, 8.6, ["u-jordan"]],
  [169786, "Scythe", 2016, 1, 5, [4], 90, 115, 3.45, 8.2, ["u-sam"]],
  [173346, "7 Wonders Duel", 2015, 2, 2, [2], 30, 30, 2.22, 8.1, ["u-casey"]],
  [148228, "Splendor", 2014, 2, 4, [2, 3], 30, 30, 1.79, 7.4, ["u-alex"]],
  [92415, "Skull", 2011, 3, 6, [5, 6], 15, 45, 1.13, 7.1, ["u-sam"]],
];

// Abridged BGG mechanics and categories, so taste profiles have something to learn from
const FEATURES: Record<string, [string[], string[]]> = {
  Cascadia: [["Tile Placement", "Pattern Building", "Drafting"], ["Animals", "Puzzle"]],
  Wingspan: [["Hand Management", "Engine Building", "Dice Rolling", "Set Collection"], ["Animals", "Card Game"]],
  "Brass: Birmingham": [["Hand Management", "Network and Route Building", "Loans", "Market"], ["Economic", "Industry / Manufacturing"]],
  "Ark Nova": [["Hand Management", "Engine Building", "Action Queue", "Tile Placement"], ["Animals", "Economic"]],
  "Heat: Pedal to the Metal": [["Hand Management", "Deck Building", "Race", "Simultaneous Action Selection"], ["Racing"]],
  "Dune: Imperium": [["Deck Building", "Worker Placement", "Area Majority"], ["Science Fiction", "Political"]],
  "The Crew: The Quest for Planet Nine": [["Trick-taking", "Cooperative Game", "Communication Limits"], ["Card Game", "Space Exploration"]],
  "Spirit Island": [["Cooperative Game", "Area Majority", "Variable Player Powers", "Hand Management"], ["Fantasy", "Territory Building"]],
  Root: [["Asymmetric", "Area Majority", "Hand Management", "Variable Player Powers"], ["Wargame", "Animals"]],
  Everdell: [["Worker Placement", "Hand Management", "Engine Building"], ["Animals", "City Building"]],
  Azul: [["Pattern Building", "Drafting", "Tile Placement"], ["Abstract Strategy", "Puzzle"]],
  "Just One": [["Communication Limits", "Cooperative Game"], ["Party Game", "Word Game"]],
  "Lost Ruins of Arnak": [["Deck Building", "Worker Placement", "Hand Management"], ["Adventure", "Exploration"]],
  "The Quacks of Quedlinburg": [["Push Your Luck", "Bag Building"], ["Medical"]],
  Cartographers: [["Paper-and-Pencil", "Pattern Building", "Simultaneous Action Selection"], ["Puzzle", "Fantasy"]],
  Wavelength: [["Team-Based Game", "Communication Limits"], ["Party Game"]],
  "Terraforming Mars": [["Hand Management", "Engine Building", "Drafting", "Tile Placement"], ["Science Fiction", "Economic", "Territory Building"]],
  Gloomhaven: [["Cooperative Game", "Hand Management", "Campaign", "Grid Movement"], ["Fantasy", "Adventure", "Fighting"]],
  Scythe: [["Area Majority", "Variable Player Powers", "Engine Building"], ["Economic", "Science Fiction", "Territory Building"]],
  "7 Wonders Duel": [["Drafting", "Set Collection"], ["Ancient", "Card Game", "City Building"]],
  Splendor: [["Set Collection", "Engine Building"], ["Economic", "Card Game"]],
  Skull: [["Bluffing", "Betting and Bidding"], ["Party Game"]],
};

// Box art on BGG's image host, so covers show without a BGG token: [thumbnail, image]
const BOX_ART: Record<number, [string, string]> = {
  92415: [
    "https://cf.geekdo-images.com/GVbKORueiHezUaLfVZKlfQ__small/img/SYBZPyB6pEutOcrTDg1KHhjFPR8=/fit-in/200x150/filters:strip_icc()/pic9315848.jpg",
    "https://cf.geekdo-images.com/GVbKORueiHezUaLfVZKlfQ__original/img/_IQj5yyk9dqRo1x15a9u4qoMDGE=/0x0/filters:format(jpeg)/pic9315848.jpg",
  ],
  148228: [
    "https://cf.geekdo-images.com/vNFe4JkhKAERzi4T0Ntwpw__small/img/KKU_42Uswt4tKCpf1zY5kTzgr-g=/fit-in/200x150/filters:strip_icc()/pic8234167.png",
    "https://cf.geekdo-images.com/vNFe4JkhKAERzi4T0Ntwpw__original/img/rqcUdtu_N4v-SpI96XVmpYHnJww=/0x0/filters:format(png)/pic8234167.png",
  ],
  162886: [
    "https://cf.geekdo-images.com/kjCm4ZvPjIZxS-mYgSPy1g__small/img/aUlIih2_R7P8IYKeyNl2heLQbu8=/fit-in/200x150/filters:strip_icc()/pic7013651.jpg",
    "https://cf.geekdo-images.com/kjCm4ZvPjIZxS-mYgSPy1g__original/img/9uLd9C3XAvInLCLhAoXqKVk56zs=/0x0/filters:format(jpeg)/pic7013651.jpg",
  ],
  167791: [
    "https://cf.geekdo-images.com/wg9oOLcsKvDesSUdZQ4rxw__small/img/BTxqxgYay5tHJfVoJ2NF5g43_gA=/fit-in/200x150/filters:strip_icc()/pic3536616.jpg",
    "https://cf.geekdo-images.com/wg9oOLcsKvDesSUdZQ4rxw__original/img/thIqWDnH9utKuoKVEUqveDixprI=/0x0/filters:format(jpeg)/pic3536616.jpg",
  ],
  169786: [
    "https://cf.geekdo-images.com/7k_nOxpO9OGIjhLq2BUZdA__small/img/eQ69OEDdjYjfKg6q5Navee87skU=/fit-in/200x150/filters:strip_icc()/pic3163924.jpg",
    "https://cf.geekdo-images.com/7k_nOxpO9OGIjhLq2BUZdA__original/img/HlDb9F365w0tSP8uD1vf1pfniQE=/0x0/filters:format(jpeg)/pic3163924.jpg",
  ],
  173346: [
    "https://cf.geekdo-images.com/zdagMskTF7wJBPjX74XsRw__small/img/gV1-ckZSIC-dCxxpq1Y7GmPITzQ=/fit-in/200x150/filters:strip_icc()/pic2576399.jpg",
    "https://cf.geekdo-images.com/zdagMskTF7wJBPjX74XsRw__original/img/Ju836WNSaW7Mab9Vjq2TJ_FqhWQ=/0x0/filters:format(jpeg)/pic2576399.jpg",
  ],
  174430: [
    "https://cf.geekdo-images.com/sZYp_3BTDGjh2unaZfZmuA__small/img/veqFeP4d_3zNhFc3GNBkV95rBEQ=/fit-in/200x150/filters:strip_icc()/pic2437871.jpg",
    "https://cf.geekdo-images.com/sZYp_3BTDGjh2unaZfZmuA__original/img/7d-lj5Gd1e8PFnD97LYFah2c45M=/0x0/filters:format(jpeg)/pic2437871.jpg",
  ],
  199792: [
    "https://cf.geekdo-images.com/fjE7V5LNq31yVEW_yuqI-Q__small/img/Cf_mYxR_VvdjTEPXseSurni2JNI=/fit-in/200x150/filters:strip_icc()/pic3918905.png",
    "https://cf.geekdo-images.com/fjE7V5LNq31yVEW_yuqI-Q__original/img/HQ1ti16wT9lqja5_h3gUfHUIcVI=/0x0/filters:format(png)/pic3918905.png",
  ],
  224517: [
    "https://cf.geekdo-images.com/x3zxjr-Vw5iU4yDPg70Jgw__small/img/o18rjEemoWaVru9Y2TyPwuIaRfE=/fit-in/200x150/filters:strip_icc()/pic3490053.jpg",
    "https://cf.geekdo-images.com/x3zxjr-Vw5iU4yDPg70Jgw__original/img/FpyxH41Y6_ROoePAilPNEhXnzO8=/0x0/filters:format(jpeg)/pic3490053.jpg",
  ],
  230802: [
    "https://cf.geekdo-images.com/aPSHJO0d0XOpQR5X-wJonw__small/img/ccsXKrdGJw-YSClWwzVUwk5Nh9Y=/fit-in/200x150/filters:strip_icc()/pic6973671.png",
    "https://cf.geekdo-images.com/aPSHJO0d0XOpQR5X-wJonw__original/img/AkbtYVc6xXJF3c9EUrakklcclKw=/0x0/filters:format(png)/pic6973671.png",
  ],
  237182: [
    "https://cf.geekdo-images.com/JUAUWaVUzeBgzirhZNmHHw__small/img/ACovMZzGGIsBRyEQXFnsT8282NM=/fit-in/200x150/filters:strip_icc()/pic4254509.jpg",
    "https://cf.geekdo-images.com/JUAUWaVUzeBgzirhZNmHHw__original/img/E0s2LvtFA1L5YKk-_44D4u2VD2s=/0x0/filters:format(jpeg)/pic4254509.jpg",
  ],
  244521: [
    "https://cf.geekdo-images.com/B1bLRWzTASZ-xx9NoAE79A__small/img/deG3pr-ORZ3JrGvQA-oQNrwh0l0=/fit-in/200x150/filters:strip_icc()/pic8780293.png",
    "https://cf.geekdo-images.com/B1bLRWzTASZ-xx9NoAE79A__original/img/HulJk6gFzp_bxl0wzc2XEMq8NLM=/0x0/filters:format(png)/pic8780293.png",
  ],
  254640: [
    "https://cf.geekdo-images.com/74haNunMBn85beBi-yIKwA__small/img/feIV-gqMeza43ycvxh6PGx4lA_w=/fit-in/200x150/filters:strip_icc()/pic8669313.png",
    "https://cf.geekdo-images.com/74haNunMBn85beBi-yIKwA__original/img/hA22qL6nZxchA8FMTIfhLMcI53I=/0x0/filters:format(png)/pic8669313.png",
  ],
  262543: [
    "https://cf.geekdo-images.com/z4fbPdmJg_5yphJEvql4ZA__small/img/bxLuHVLF-Y06jWRSKA-tuQ3YYcE=/fit-in/200x150/filters:strip_icc()/pic4552862.png",
    "https://cf.geekdo-images.com/z4fbPdmJg_5yphJEvql4ZA__original/img/bP1gM8RC-o5iz20_WazBaBNDHnU=/0x0/filters:format(png)/pic4552862.png",
  ],
  263918: [
    "https://cf.geekdo-images.com/GifbnAmsA4lfEcDkeaC9VA__small/img/TTxZzwbna07hMcPQ0xaFtT10egE=/fit-in/200x150/filters:strip_icc()/pic4397932.png",
    "https://cf.geekdo-images.com/GifbnAmsA4lfEcDkeaC9VA__original/img/YzJORdIDNza8kmrY6KEU_h2p2Wo=/0x0/filters:format(png)/pic4397932.png",
  ],
  266192: [
    "https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__small/img/VNToqgS2-pOGU6MuvIkMPKn_y-s=/fit-in/200x150/filters:strip_icc()/pic4458123.jpg",
    "https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__original/img/cI782Zis9cT66j2MjSHKJGnFPNw=/0x0/filters:format(jpeg)/pic4458123.jpg",
  ],
  284083: [
    "https://cf.geekdo-images.com/98LnQShydr11OBKS46xY-Q__small/img/et-fnuozyOdBOVL-5kSS3_7I8fw=/fit-in/200x150/filters:strip_icc()/pic5687013.jpg",
    "https://cf.geekdo-images.com/98LnQShydr11OBKS46xY-Q__original/img/Q-ZkgnuBu9OTBr7J3qnqPjqamAE=/0x0/filters:format(jpeg)/pic5687013.jpg",
  ],
  291457: [
    "https://cf.geekdo-images.com/_HhIdavYW-hid20Iq3hhmg__small/img/OMkN_E5eyWrkID_cHCnQEbIixGM=/fit-in/200x150/filters:strip_icc()/pic5055631.jpg",
    "https://cf.geekdo-images.com/_HhIdavYW-hid20Iq3hhmg__original/img/PBzsLRqNKQKJxGnzpb7o3qLWPQM=/0x0/filters:format(jpeg)/pic5055631.jpg",
  ],
  295770: [
    "https://cf.geekdo-images.com/cwUgf-f-qwri8UHBUnifuQ__small/img/3o2Hc_N5mmfpOt8s9kP0ap8Jti8=/fit-in/200x150/filters:strip_icc()/pic5092291.png",
    "https://cf.geekdo-images.com/cwUgf-f-qwri8UHBUnifuQ__original/img/Tk7wFDJuaU8RPjNkmyC3AWYOPpU=/0x0/filters:format(png)/pic5092291.png",
  ],
  295947: [
    "https://cf.geekdo-images.com/MjeJZfulbsM1DSV3DrGJYA__small/img/tVSFjSxYEcw7sKj3unIIQV8kxoc=/fit-in/200x150/filters:strip_icc()/pic5100691.jpg",
    "https://cf.geekdo-images.com/MjeJZfulbsM1DSV3DrGJYA__original/img/B374C04Eip7fmQBGJzgiOTp-jyQ=/0x0/filters:format(jpeg)/pic5100691.jpg",
  ],
  312484: [
    "https://cf.geekdo-images.com/6GqH14TJJhza86BX5HCLEQ__small/img/J8SVmGOJXZGxNjkT3xYNQU7Haxg=/fit-in/200x150/filters:strip_icc()/pic5674958.jpg",
    "https://cf.geekdo-images.com/6GqH14TJJhza86BX5HCLEQ__original/img/CXqwimJPonWy1oyXEMgPN_ZVmUI=/0x0/filters:format(jpeg)/pic5674958.jpg",
  ],
  316554: [
    "https://cf.geekdo-images.com/PhjygpWSo-0labGrPBMyyg__small/img/JGgY-nBmkyB8WRp8vcoBLlNMQ5U=/fit-in/200x150/filters:strip_icc()/pic5666597.jpg",
    "https://cf.geekdo-images.com/PhjygpWSo-0labGrPBMyyg__original/img/mZzaBAEEJpMlHWWmC0R6Su0OibQ=/0x0/filters:format(jpeg)/pic5666597.jpg",
  ],
  342942: [
    "https://cf.geekdo-images.com/SoU8p28Sk1s8MSvoM4N8pQ__small/img/4KuHNTWSMPf8vTNDKSRMMI3oOv8=/fit-in/200x150/filters:strip_icc()/pic6293412.jpg",
    "https://cf.geekdo-images.com/SoU8p28Sk1s8MSvoM4N8pQ__original/img/g4S18szTdrXCdIwVKzMKrZrYAcM=/0x0/filters:format(jpeg)/pic6293412.jpg",
  ],
  359871: [
    "https://cf.geekdo-images.com/XWImAu_3RK61wbzcKboVdA__small/img/Ry-6KHwNgERWadyxs1X1_P3dMvY=/fit-in/200x150/filters:strip_icc()/pic8145530.png",
    "https://cf.geekdo-images.com/XWImAu_3RK61wbzcKboVdA__original/img/43ianMZOks7UHlZILx0VBRntOmM=/0x0/filters:format(png)/pic8145530.png",
  ],
  366013: [
    "https://cf.geekdo-images.com/-vOrd4bOspibyohYExLqWg__small/img/2GbaKvYOzWIxfgbYTk2R9puiyzo=/fit-in/200x150/filters:strip_icc()/pic6940449.png",
    "https://cf.geekdo-images.com/-vOrd4bOspibyohYExLqWg__original/img/iXU8a9WaVlwrkiEiOxWN06y9y5g=/0x0/filters:format(png)/pic6940449.png",
  ],
  385761: [
    "https://cf.geekdo-images.com/u1cwi9BWSKsPxSkVO0BzbA__small/img/5G45GN8CE7pq38fJMMocmPtV4_U=/fit-in/200x150/filters:strip_icc()/pic7570101.png",
    "https://cf.geekdo-images.com/u1cwi9BWSKsPxSkVO0BzbA__original/img/jTY6_PRF6FrUgInfMajzobVy0S8=/0x0/filters:format(png)/pic7570101.png",
  ],
  396790: [
    "https://cf.geekdo-images.com/fIVUaMvbfy6GCOgfxt7xaw__small/img/jKsO4nKmtNjX5bfH7aCPeK7hsqU=/fit-in/200x150/filters:strip_icc()/pic7647168.jpg",
    "https://cf.geekdo-images.com/fIVUaMvbfy6GCOgfxt7xaw__original/img/dBMnuz3SrgxsDLHT6pwbQFPQBIw=/0x0/filters:format(jpeg)/pic7647168.jpg",
  ],
};

/**
 * Wipes the group's data and sign-ins and fills the database with the made-up group from
 * demo.ts, dated from today: members, their shelves and opinions, ~40 plays (through the real
 * Discord-message parser and save path), the nights coming up and a poll. Needs no network:
 * the games' BGG details are below. Sam is its admin, and Group settings go back to the
 * environment variables. Whoever calls it checks it's pointed at a database that's fine to wipe.
 */
export async function seedGroup(now = new Date()) {
  const cal = demoCalendar(now);
  // Start clean, everyone signed out. BGA's game list and the Discover catalog stay: they aren't the group's.
  for (const t of [
    schema.datePollVote, schema.datePollOption, schema.datePoll, schema.planReady, schema.planVote, schema.gamePlan, schema.nightRsvp, schema.gameNight, schema.suggestionVote, schema.suggestion, schema.ranking, schema.opinion, schema.playPlayer, schema.play,
    schema.player, schema.collectionItem, schema.game, schema.session, schema.account, schema.verification, schema.user, schema.syncState, schema.setting,
  ]) {
    await db.delete(t);
  }
  await loadSettings({ fresh: true });
  const casual = CASUAL_NIGHT ? cal.casual : [];

  for (const [i, p] of DEMO_PEOPLE.entries()) {
    await db.insert(schema.user).values({
      id: p.id,
      name: p.name,
      email: `${p.name.toLowerCase()}@example.com`,
      emailVerified: true,
      // Members since the play history starts, so none of them show as new
      createdAt: new Date(`${cal.core[0].date}T12:00:00Z`),
      discordId: `9000000000000000${i}`,
      bggUsername: `${p.name.toLowerCase()}_plays`,
      isAdmin: i === 0,
    });
    await db.insert(schema.player).values({ name: p.name, userId: p.id, color: p.color, discordId: `9000000000000000${i}` });
  }

  for (const [id, name, year, minP, maxP, best, minT, maxT, weight, rating, owners] of GAMES) {
    await db.insert(schema.game).values({
      id, name, year, minPlayers: minP, maxPlayers: maxP, bestPlayers: best, minPlaytime: minT, maxPlaytime: maxT,
      weight, bggRating: rating, detailsFetchedAt: new Date(),
      thumbnail: BOX_ART[id]?.[0], image: BOX_ART[id]?.[1],
      mechanics: FEATURES[name]?.[0] ?? [], categories: FEATURES[name]?.[1] ?? [],
    });
    for (const userId of owners) {
      await db.insert(schema.collectionItem).values({ userId, gameId: id, own: true });
    }
  }
  // A wishlist item nobody owns
  await db.insert(schema.game).values({ id: 291457, name: "Gloomhaven: Jaws of the Lion", year: 2020, minPlayers: 1, maxPlayers: 4, thumbnail: BOX_ART[291457]?.[0], image: BOX_ART[291457]?.[1] });
  await db.insert(schema.collectionItem).values([
    { userId: "u-jordan", gameId: 291457, wishlist: true },
    { userId: "u-casey", gameId: 291457, wishlist: true },
  ]);

  // Plays, as Discord messages through the real parser
  let saved = 0;
  for (const [night, nights] of [["core", cal.core], ["casual", casual]] as const) {
    for (const [i, n] of nights.entries()) {
      const content = [
        `**Date:** ${n.date.slice(5).replace("-", "/")}`,
        `**Location:** ${n.where}`,
        `**Players:** ${n.who.join(", ")}`,
        `**Games:** ${n.games.join(", ")}`,
      ].join("\n");
      const plays = parsePlayMessage({ content, timestamp: zonedToUtc(n.date, "22:30", TIME_ZONE).toISOString(), timeZone: TIME_ZONE });
      for (const [j, p] of (plays ?? []).entries()) {
        await savePlay(p, { source: "discord", sourceRef: `seed-${night === "casual" ? "casual-" : ""}${i}:${j}`, night });
        saved++;
      }
    }
  }

  const ids = Object.fromEntries(GAMES.map((g) => [g[1], g[0]]));
  // The last column is "want to play", played it or not
  const opinions: [string, string, "love" | "like" | "meh" | "nope" | null, boolean][] = [
    ["u-sam", "Cascadia", "love", true],
    ["u-sam", "Heat: Pedal to the Metal", "love", true],
    ["u-sam", "Brass: Birmingham", "like", false],
    ["u-sam", "Spirit Island", "meh", false],
    ["u-sam", "Gloomhaven", null, true],
    ["u-alex", "Ark Nova", "love", true],
    ["u-alex", "Brass: Birmingham", "love", true],
    ["u-alex", "Just One", "nope", false],
    ["u-alex", "Wingspan", "like", false],
    ["u-alex", "Terraforming Mars", "love", true],
    ["u-jordan", "Brass: Birmingham", "love", true],
    ["u-jordan", "Root", "love", false],
    ["u-jordan", "Spirit Island", "love", true],
    ["u-jordan", "Cascadia", "meh", false],
    ["u-jordan", "Scythe", null, true],
    ["u-casey", "Dune: Imperium", "love", true],
    ["u-casey", "Heat: Pedal to the Metal", "like", true],
    ["u-casey", "Ark Nova", "nope", false],
    ["u-casey", "Everdell", "like", false],
    ["u-casey", "Lost Ruins of Arnak", null, true],
    ["u-casey", "Just One", "love", false],
    ["u-casey", "Skull", "love", false],
    ["u-casey", "Brass: Birmingham", "meh", false],
    ["u-alex", "Spirit Island", "like", false],
    ["u-alex", "Skull", "nope", false],
    ["u-sam", "Wingspan", "like", false],
    ["u-sam", "Azul", "love", false],
    ["u-jordan", "Ark Nova", "love", false],
    ["u-jordan", "Just One", "meh", false],
  ];
  for (const [userId, game, sentiment, wantToPlay] of opinions) {
    await db.insert(schema.opinion).values({ userId, gameId: ids[game], sentiment, wantToPlay, wantToPlaySince: wantToPlay ? new Date() : null });
  }

  // Scarce "really want this on the table" votes
  for (const [userId, game] of [["u-jordan", "Spirit Island"], ["u-casey", "Lost Ruins of Arnak"], ["u-alex", "Terraforming Mars"]] as const) {
    await db.update(schema.opinion).set({ mustPlay: true }).where(and(eq(schema.opinion.userId, userId), eq(schema.opinion.gameId, ids[game])));
  }

  // The next night, with a game locked in and prep under way, and the one after, still open
  const date = cal.nextNight;
  const [next] = await db
    .insert(schema.gameNight)
    .values({
      night: "core",
      date,
      title: nightTitle("core", date),
      startsAt: zonedToUtc(date, "19:00", TIME_ZONE),
      location: "Jordan's",
      createdBy: "u-jordan",
    })
    .returning();
  await rsvp(next.id, { "u-sam": "going", "u-alex": "going", "u-jordan": "going", "u-casey": "going" });
  const proposals: [string, string, string[], boolean][] = [
    ["Spirit Island", "u-jordan", ["u-jordan", "u-alex", "u-casey"], true],
    ["Brass: Birmingham", "u-alex", ["u-alex", "u-jordan"], false],
    ["Dune: Imperium", "u-casey", ["u-casey"], false],
  ];
  for (const [game, by, votes, chosen] of proposals) {
    const [plan] = await db
      .insert(schema.gamePlan)
      .values({
        gameId: ids[game],
        gameNightId: next.id,
        chosen,
        createdBy: by,
        links: chosen ? [{ label: "Learn to play in 30 minutes", url: "https://www.youtube.com/results?search_query=spirit+island+how+to+play" }] : [],
      })
      .returning();
    await db.insert(schema.planVote).values(votes.map((userId) => ({ planId: plan.id, userId })));
    if (chosen) await db.insert(schema.planReady).values([{ planId: plan.id, userId: "u-jordan" }, { planId: plan.id, userId: "u-alex" }]);
  }
  const later = cal.nightAfter;
  const [after] = await db
    .insert(schema.gameNight)
    .values({
      night: "core",
      date: later,
      title: nightTitle("core", later),
      startsAt: zonedToUtc(later, "19:00", TIME_ZONE),
      location: "Sam's",
      createdBy: "u-sam",
    })
    .returning();
  await rsvp(after.id, { "u-sam": "going", "u-alex": "going", "u-jordan": "going", "u-casey": "maybe" });

  // A poll finding a date for the night after those, with a few votes in
  const [poll] = await db.insert(schema.datePoll).values({ night: "core", title: "Brass all-nighter", location: "Alex's", createdBy: "u-alex" }).returning();
  const offered = await db
    .insert(schema.datePollOption)
    .values(cal.pollDays.map((day, i) => ({ pollId: poll.id, startsAt: zonedToUtc(day, i === 1 ? "14:00" : "19:00", TIME_ZONE) })))
    .returning();
  const playerOf = async (userId: string) => (await db.select({ id: schema.player.id }).from(schema.player).where(eq(schema.player.userId, userId)))[0].id;
  for (const [option, userIds] of [[offered[0], ["u-alex", "u-jordan"]], [offered[1], ["u-alex", "u-sam", "u-casey"]]] as const) {
    for (const userId of userIds) await db.insert(schema.datePollVote).values({ optionId: option.id, playerId: await playerOf(userId), votedAt: new Date() });
  }

  // The next casual night, with a bring list and one owner asked to bring theirs
  if (CASUAL_NIGHT) {
    const casualDate = cal.nextCasual;
    const [casual] = await db
      .insert(schema.gameNight)
      .values({
        night: "casual",
        date: casualDate,
        title: nightTitle("casual", casualDate),
        startsAt: zonedToUtc(casualDate, "19:00", TIME_ZONE),
        location: "the game cafe",
        guests: 2,
        createdBy: "u-casey",
      })
      .returning();
    await rsvp(casual.id, { "u-casey": "going", "u-sam": "going", "u-alex": "maybe" });
    await db.insert(schema.gamePlan).values([
      { gameId: ids["Just One"], night: "casual", gameNightId: casual.id, bringerId: "u-casey", createdBy: "u-casey" },
      { gameId: ids["Skull"], night: "casual", gameNightId: casual.id, bringerId: "u-sam", createdBy: "u-sam" },
      { gameId: ids["Cascadia"], night: "casual", gameNightId: casual.id, bringerId: "u-sam", createdBy: "u-sam" },
      { gameId: ids["Azul"], night: "casual", gameNightId: casual.id, askedId: "u-alex", createdBy: "u-casey" },
    ]);
  }

  const rankings: Record<string, string[]> = {
    "u-sam": ["Heat: Pedal to the Metal", "Cascadia", "Brass: Birmingham", "Dune: Imperium", "The Crew: The Quest for Planet Nine", "Lost Ruins of Arnak"],
    "u-alex": ["Ark Nova", "Brass: Birmingham", "Terraforming Mars", "Wingspan", "Dune: Imperium"],
    "u-jordan": ["Brass: Birmingham", "Spirit Island", "Root", "Dune: Imperium", "Heat: Pedal to the Metal", "Gloomhaven", "Cascadia"],
  };
  for (const [userId, games] of Object.entries(rankings)) {
    await db.insert(schema.ranking).values(games.map((g, position) => ({ userId, gameId: ids[g], position })));
  }

  const [s1] = await db
    .insert(schema.suggestion)
    // Claude's pick only where Claude's on: off, the site never mentions it
    .values(
      CLAUDE
        ? { name: "Arcs", year: 2024, source: "ai", reason: "Jordan and Alex both rank Brass and Root highly — Arcs has that same tense, interactive card play in about 90 minutes." }
        : { name: "Arcs", year: 2024, source: "member", addedBy: "u-alex", reason: "Like Brass and Root, but in about 90 minutes" },
    )
    .returning();
  const [s2] = await db
    .insert(schema.suggestion)
    .values({ name: "Faraway", year: 2023, source: "member", addedBy: "u-sam", reason: "Quick filler for when we only have 30 min" })
    .returning();
  // Ideas to buy, with BGG details so they can be scored
  for (const [id, name, year, weight, mechanics, categories, reason] of [
    [359871, "Arcs", 2024, 3.4, ["Hand Management", "Area Majority", "Trick-taking"], ["Science Fiction", "Wargame"], null],
    [385761, "Faraway", 2023, 1.6, ["Drafting", "Set Collection"], ["Card Game", "Fantasy"], null],
    [291457, "Gloomhaven: Jaws of the Lion", 2020, 3.6, ["Cooperative Game", "Hand Management", "Campaign"], ["Fantasy", "Adventure"], null],
    [396790, "Nucleum", 2023, 4.0, ["Network and Route Building", "Worker Placement", "Market"], ["Economic", "Industry / Manufacturing"], "Brass fans will feel at home"],
    [295770, "Frosthaven", 2023, 4.4, ["Cooperative Game", "Campaign", "Hand Management"], ["Fantasy", "Adventure"], null],
  ] as const) {
    await db.insert(schema.game).values({ id, name, year, weight, mechanics: [...mechanics], categories: [...categories], detailsFetchedAt: new Date(), thumbnail: BOX_ART[id]?.[0], image: BOX_ART[id]?.[1] }).onConflictDoUpdate({ target: schema.game.id, set: { mechanics: [...mechanics], categories: [...categories], weight } });
    if (reason) await db.insert(schema.suggestion).values({ name, year, bggId: id, source: "member", addedBy: "u-jordan", reason }).onConflictDoNothing();
  }
  await db.update(schema.suggestion).set({ bggId: 359871 }).where(eq(schema.suggestion.name, "Arcs"));
  await db.update(schema.suggestion).set({ bggId: 385761 }).where(eq(schema.suggestion.name, "Faraway"));
  if (CLAUDE) {
    await db.insert(schema.suggestion).values({ name: "Frosthaven", year: 2023, bggId: 295770, source: "ai", forUserId: "u-jordan", reason: "Jordan loves Spirit Island and Gloomhaven; this is the deeper campaign." });
  }

  await db.insert(schema.suggestionVote).values([
    { suggestionId: s1.id, userId: "u-jordan", value: 1 },
    { suggestionId: s1.id, userId: "u-alex", value: 1 },
    { suggestionId: s2.id, userId: "u-sam", value: 1 },
  ]);

  return `Seeded ${DEMO_PEOPLE.length} members, ${GAMES.length} games, ${saved} plays from ${cal.core.length + casual.length} nights.`;
}

/** Each member's answer for a night, as if they'd tapped it on the site */
async function rsvp(gameNightId: number, answers: Record<string, RsvpStatus>) {
  for (const [userId, status] of Object.entries(answers)) {
    const [p] = await db.select({ id: schema.player.id }).from(schema.player).where(eq(schema.player.userId, userId));
    await db.insert(schema.nightRsvp).values({ gameNightId, playerId: p.id, status, via: "site", respondedAt: new Date() });
  }
}

/**
 * The demo's nightly reset: the made-up group back as it was, dated from today, and everyone
 * signed out. Refuses unless this is a demo (DEMO=on and no Discord), so it can't wipe a real
 * group's data.
 */
export async function resetDemo() {
  const refusal = demoRefusal(process.env);
  if (refusal) throw new Error(`Not resetting: ${refusal}`);
  return seedGroup();
}
