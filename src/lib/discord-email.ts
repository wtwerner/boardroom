/**
 * The email Better Auth stores for a Discord account. Better Auth won't create a user
 * without one, but Discord accounts made with a phone number don't have one. Boardroom
 * never emails anyone, so those get a placeholder under the reserved `.invalid` domain.
 */
export function discordAccountEmail(profile: { id: string; email?: string | null }) {
  return profile.email || `${profile.id}@discord.invalid`;
}
