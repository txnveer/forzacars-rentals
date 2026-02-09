import { redirect } from "next/navigation";
import { getProfile, type Profile } from "./getProfile";

/** Maps each role to its post-login dashboard path. */
const DASHBOARD: Record<Profile["role"], string> = {
  CUSTOMER: "/cars",
  BUSINESS: "/biz/cars",
  ADMIN: "/admin/users",
};

/** Return the dashboard path for a given role. */
export function getDashboardPath(role: Profile["role"]): string {
  return DASHBOARD[role] ?? "/cars";
}

/**
 * Server-side role gate.
 *
 * Call this at the top of a layout or page Server Component:
 *
 *   const profile = await requireRole("CUSTOMER");
 *
 * - If the user is not authenticated → redirect to /login.
 * - If the user's role is not in `allowedRoles` → redirect to their
 *   own dashboard (prevents horizontal privilege escalation).
 * - Otherwise → returns the `Profile` so downstream code can use it.
 */
export async function requireRole(
  ...allowedRoles: Profile["role"][]
): Promise<Profile> {
  const profile = await getProfile();

  if (!profile) {
    redirect("/login");
  }

  if (!allowedRoles.includes(profile.role)) {
    redirect(getDashboardPath(profile.role));
  }

  return profile;
}
