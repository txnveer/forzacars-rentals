import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths that require an authenticated session.
 * The middleware redirects guests to /login before any page renders.
 *
 * Role-specific checks happen in the route-group layouts (server-side),
 * not here — the middleware only enforces "logged in or not".
 *
 * PUBLIC pages (no login required):
 *   / (home), /cars, /cars/[id], /compare, /login, /signup
 *
 * PROTECTED pages (login required):
 *   /bookings, /wallet, /profile, /messages, /biz/*, /admin/*
 */
const PROTECTED_PREFIXES = [
  "/bookings",
  "/wallet",
  "/profile",
  "/messages",
  "/biz",
  "/admin",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to
  // debug issues with users being randomly logged out.

  // IMPORTANT: DO NOT REMOVE supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // -----------------------------------------------------------------------
  // Guard: unauthenticated users cannot access protected routes.
  // -----------------------------------------------------------------------
  const isProtected = PROTECTED_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    // Build returnTo with pathname and search params
    const returnTo = pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.search = `?returnTo=${encodeURIComponent(returnTo)}`;
    return NextResponse.redirect(url);
  }

  // NOTE: We no longer redirect authenticated users away from /login or /signup
  // in middleware. The page components handle this check and redirect appropriately.
  // This avoids issues with stale sessions causing unexpected redirects.

  // IMPORTANT: You *must* return the supabaseResponse object as-is.
  return supabaseResponse;
}
