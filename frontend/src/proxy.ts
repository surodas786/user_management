import { NextResponse, type NextRequest } from "next/server";
import { loginUrl } from "@/lib/auth/redirect";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Fast path only: skips rendering when there is plainly no session. Cookie
 * presence proves nothing, so pages still verify with the API (see requireUser).
 * Never redirect signed-in-looking users away from /login here: a revoked cookie
 * would bounce between /login and the protected page.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(
    new URL(loginUrl({ next: `${pathname}${search}` }), request.url),
  );
}

export const config = {
  matcher: ["/dashboard/:path*", "/users/:path*"],
};
