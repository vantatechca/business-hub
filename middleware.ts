import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path  = req.nextUrl.pathname;
    const role  = token?.role;

    // Force password change: if the flag is set, every protected route
    // (except /profile where the change happens) bounces to /profile?force=1.
    // The page itself reads session.user.mustChangePassword and renders only
    // the password-change form until the flag clears.
    if (token?.mustChangePassword && path !== "/profile" && !path.startsWith("/api/")) {
      const url = new URL("/profile", req.url);
      url.searchParams.set("force", "1");
      return NextResponse.redirect(url);
    }

    // Admin-only routes (super_admin included)
    if (path.startsWith("/users") && role !== "admin" && role !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Audit log — super_admin only
    if (path.startsWith("/audit") && role !== "super_admin") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    // Manager+ only routes. Lead and member don't see them in the nav, but
    // a manual URL would still load the page without this guard.
    const mgrOnlyPaths = ["/birthdays", "/revenue", "/expenses", "/goals"];
    const isMgrOrUp = role === "manager" || role === "leader" || role === "admin" || role === "super_admin";
    if (!isMgrOrUp && mgrOnlyPaths.some(p => path === p || path.startsWith(p + "/"))) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/departments/:path*",
    "/metrics/:path*",
    "/assignments/:path*",
    "/team/:path*",
    "/tasks/:path*",
    "/checkin/:path*",
    "/revenue/:path*",
    "/expenses/:path*",
    "/goals/:path*",
    "/analytics/:path*",
    "/users/:path*",
    "/profile/:path*",
    "/audit/:path*",
  ],
};
