import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getProfile, type Profile } from "./getProfile";

/**
 * Build a login URL with returnTo parameter based on current path.
 */
export function buildLoginUrl(returnTo?: string): string {
  if (!returnTo) {
    return "/login";
  }
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Get the current request path from headers.
 * Works in Server Components and Route Handlers.
 */
export async function getCurrentPath(): Promise<string> {
  const headerList = await headers();
  // Next.js sets x-url or we can parse from referer
  const url = headerList.get("x-url") || headerList.get("x-invoke-path") || "";
  if (url) {
    try {
      const parsed = new URL(url, "http://localhost");
      return parsed.pathname + parsed.search;
    } catch {
      return url;
    }
  }
  return "";
}

/**
 * Server-side user gate that redirects to login with returnTo.
 *
 * Call this at the top of a protected page Server Component:
 *
 *   const profile = await requireUser();
 *
 * - If the user is not authenticated → redirect to /login?returnTo=currentPath
 * - Otherwise → returns the `Profile` so downstream code can use it.
 */
export async function requireUser(): Promise<Profile> {
  const profile = await getProfile();

  if (!profile) {
    const currentPath = await getCurrentPath();
    redirect(buildLoginUrl(currentPath || undefined));
  }

  return profile;
}

/**
 * Build a client-side login URL with returnTo parameter.
 * For use in client components.
 */
export function getLoginUrlWithReturn(currentPath: string): string {
  return buildLoginUrl(currentPath);
}
