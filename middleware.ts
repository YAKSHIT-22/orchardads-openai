import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Every /tools/* page requires auth. Using a single prefix (rather than an
// explicit allowlist) means any NEW tool page is protected by default.
const PROTECTED_USER_ROUTES = ["/tools"];
const PROTECTED_ADMIN_ROUTES = ["/admin"];
const AUTH_ROUTES = ["/signin", "/signup"];
const ONBOARDING_ROUTES = [
  "/onboarding/emailVerification",
  "/onboarding/connect",
];

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
    } catch (err) {
      request.cookies.delete("token");
      return NextResponse.redirect(new URL("/signin", request.url));
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
        if (
          pathname !== "/onboarding/emailVerification" &&
          pathname !== "/onboarding/connect"
        ) {
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
    } catch (err) {
      console.error("JWT verification failed:", err);
      request.cookies.delete("token");
      return NextResponse.redirect(new URL("/signin", request.url));
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
        role === "USER" &&
        hasAccessData === false
      ) {
        return NextResponse.redirect(
          new URL("/onboarding/connect", request.url)
        );
      }

      return NextResponse.next();
    } catch (err) {
      console.error("JWT verification failed:", err);
      request.cookies.delete("token");
      return NextResponse.redirect(new URL("/signin", request.url));
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
