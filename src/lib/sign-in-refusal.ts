/**
 * Why sign-in turned a Discord account away. Better Auth redirects a refused
 * OAuth callback to /sign-in?error=<code>, where the page explains it.
 */
export type SignInRefusal = "not_in_server" | "missing_role";
