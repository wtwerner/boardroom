/** A name used mid-sentence: "Casual night" → "casual night". Safe in client components. */
export const inSentence = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/** A name as a title: "Strategy night" → "Strategy Night" */
export const titleCase = (name: string) => name.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
