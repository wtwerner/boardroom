/**
 * Why sign-in turned someone away. Better Auth redirects a refused Discord callback to
 * /sign-in?error=<code>, and answers a refused password with it; the sign-in page explains either.
 */
export type SignInRefusal = "not_in_server" | "missing_role" | "passwords_off";
