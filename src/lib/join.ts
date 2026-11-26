/**
 * What someone gives to make an account without Discord, checked: on an invite, for a new
 * password, and for a new site's first account. Pure, so it's tested and the forms can share it.
 */

import { z } from "zod";

export const PASSWORD_MIN = 10;
/** Better Auth's own limit, so hashing a huge one can't be used to tie up the site */
export const PASSWORD_MAX = 128;

const name = z.string().trim().min(1, { error: "Enter the name the group knows you by." }).max(40, { error: "Your name can be up to 40 characters." });
const email = z.string().trim().toLowerCase().pipe(z.email({ error: "That doesn't look like an email address." }).max(200, { error: "That address is too long." }));
const password = z
  .string()
  .min(PASSWORD_MIN, { error: `Use at least ${PASSWORD_MIN} characters. A few words work well.` })
  .max(PASSWORD_MAX, { error: `Passwords can be up to ${PASSWORD_MAX} characters.` });

export const JoinInput = z.object({ name, email, password });
export const EmailInput = z.object({ email });
export const PasswordInput = z.object({ password });

export type JoinFields = z.output<typeof JoinInput>;

/** Discord accounts without an email get a stand-in under .invalid (discord-email.ts), which nothing can be sent to or signed in with */
export const isPlaceholderEmail = (address: string) => address.toLowerCase().endsWith(".invalid");
