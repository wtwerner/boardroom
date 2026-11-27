import { type NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic redirect for signed-out visitors. Not a security boundary —
 * every page and action still checks the session via requireUser().
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Icons and link previews must load before anyone is signed in. A night's calendar pages open
  // from Discord, signed in or not: the secret in their address is what lets people in. So are
  // invites, links to choose a password or confirm an email, and an email's link to stop them; a new site is set up before anyone can be.
  matcher: ["/((?!sign-in|setup$|join/|password/|confirm/|email/stop/|calendar/|api|_next|icon|apple-icon|opengraph-image|.*\\.).*)"],
};
