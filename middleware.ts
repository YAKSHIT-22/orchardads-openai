import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Every /tools/* page requires auth. Using a single prefix (rather than an
// explicit allowlist) means any NEW tool page is protected by default.
const PROTECTED_USER_ROUTES = ["/tools"];
const PROTECTED_ADMIN_ROUTES = ["/admin"];
const AUTH_ROUTES = ["/signin", "/signup"];
/**
 * Reachable even when no ad account is connected yet.
 *
 * Every other /tools/* path bounces an unconnected user to /onboarding/connect.
 * Billing must not: a trial that expires before a key is pasted, or a customer
 * who removed their last connection, would otherwise be unable to reach the one
 * page where they can pay. The PlanGate upgrade wall links here too, so without
 * this the "See plans" button is a redirect loop.
 */
const CONNECTION_EXEMPT_TOOLS = ["/tools/billing"];
const ONBOARDING_ROUTES = [
  "/onboarding/emailVerification",
  "/onboarding/connect",
];

/**
 * Clear the session cookie and bounce to sign-in.
 *
 * `request.cookies.delete()` mutates the *incoming* request only — it never
 * reaches the browser, so a token that fails verification used to survive and
 * fail again on every subsequent navigation. The delete has to be applied to
 * the response.
 */
function clearTokenAndSignIn(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/signin", request.url));
  res.cookies.delete("token");
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("token")?.value;
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  if (AUTH_ROUTES.includes(pathname) && token) {
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.JWT_SECRET!)
      );

      const role = payload.role;

      if (
        payload.emailVerified === "UNVERIFIED" &&
        pathname !== "/onboarding/emailVerification"
      ) {
        return NextResponse.redirect(
          new URL("/onboarding/emailVerification", request.url)
        );
      }

      if (role === "ADMIN") {
        return NextResponse.redirect(new URL("/admin", request.url));
      } else if (role === "USER") {
        return NextResponse.redirect(new URL("/tools/dashboard", request.url));
      }
    } catch {
      return clearTokenAndSignIn(request);
    }
  }

  if (ONBOARDING_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!token) {
      return NextResponse.redirect(new URL("/signin", request.url));
    }
    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.JWT_SECRET!)
      );

      if (payload.emailVerified === "UNVERIFIED") {
        // Connect is NOT exempt here: pasting a live OpenAI Ads key is the most
        // sensitive thing an account can do, and it should not be possible
        // before the address that owns the account has been proven.
        if (pathname !== "/onboarding/emailVerification") {
          return NextResponse.redirect(
            new URL("/onboarding/emailVerification", request.url)
          );
        }
        return NextResponse.next();
      } else {
        const hasAccessData = payload.hasAccessData;
        if (hasAccessData === false) {
          if (pathname !== "/onboarding/connect") {
            return NextResponse.redirect(
              new URL("/onboarding/connect", request.url)
            );
          }
          return NextResponse.next();
        }
        return NextResponse.redirect(new URL("/tools/dashboard", request.url));
      }
    } catch {
      return clearTokenAndSignIn(request);
    }
  }

  if (
    PROTECTED_USER_ROUTES.some((route) => pathname.startsWith(route)) ||
    PROTECTED_ADMIN_ROUTES.some((route) => pathname.startsWith(route))
  ) {
    if (!token) {
      return NextResponse.redirect(new URL("/signin", request.url));
    }

    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.JWT_SECRET!)
      );

      if (
        payload.emailVerified === "UNVERIFIED" &&
        pathname !== "/onboarding/emailVerification"
      ) {
        return NextResponse.redirect(
          new URL("/onboarding/emailVerification", request.url)
        );
      }

      const role = payload.role;
      const hasAccessData = payload.hasAccessData;
      if (
        PROTECTED_ADMIN_ROUTES.some((route) => pathname.startsWith(route)) &&
        role !== "ADMIN"
      ) {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }

      if (
        PROTECTED_USER_ROUTES.some((route) => pathname.startsWith(route)) &&
        role !== "USER" &&
        role !== "ADMIN"
      ) {
        return NextResponse.redirect(new URL("/unauthorized", request.url));
      }

      if (
        PROTECTED_USER_ROUTES.some((route) => pathname.startsWith(route)) &&
        !CONNECTION_EXEMPT_TOOLS.some((route) => pathname.startsWith(route)) &&
        role === "USER" &&
        hasAccessData === false
      ) {
        return NextResponse.redirect(
          new URL("/onboarding/connect", request.url)
        );
      }

      return NextResponse.next();
    } catch {
      return clearTokenAndSignIn(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/tools/:path*",
    "/onboarding/:path*",
    "/admin/:path*",
    "/signin",
    "/signup",
  ],
};
