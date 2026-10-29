/** A name used mid-sentence: "Casual night" → "casual night". Safe in client components. */
export const inSentence = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/** A name as a title: "Strategy night" → "Strategy Night" */
export const titleCase = (name: string) => name.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());

/** "a", "a and b", "a, b and c" */
export const andList = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);
