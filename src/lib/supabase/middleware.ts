import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths that require an authenticated session.
 * The middleware redirects guests to /login before any page renders.
 *
 * Role-specific checks happen in the route-group layouts (server-side),
 * not here — the middleware only enforces "logged in or not".
 */
const PROTECTED_PREFIXES = ["/bookings", "/wallet", "/biz", "/admin"];

/** Paths that authenticated users should bounce away from. */
const AUTH_PAGES = ["/login", "/signup"];

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
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // -----------------------------------------------------------------------
  // Convenience: authenticated users visiting /login or /signup are sent
  // to the home page. The pages themselves handle the role-based redirect,
  // but this avoids a full page render when possible.
  // -----------------------------------------------------------------------
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as-is.
  return supabaseResponse;
}
