/**
 * A name used mid-sentence: "Casual night" → "casual night". A name capitalized past its first letter
 * ("Game Night", "BGG night") or a single word ("Strategy") reads as the group's proper name and stays
 * as it is. Safe in client components.
 */
export const inSentence = (name: string) =>
  /\s/.test(name.trim()) && name.slice(1) === name.slice(1).toLowerCase() ? name.charAt(0).toLowerCase() + name.slice(1) : name;

/** A name as a title: "Strategy night" → "Strategy Night" */
export const titleCase = (name: string) => name.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());

/** "a", "a and b", "a, b and c" */
export const andList = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
