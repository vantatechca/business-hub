import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path  = req.nextUrl.pathname;

    // Admin-only routes
    if (path.startsWith("/users") && token?.role !== "admin") {
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
  ],
};
