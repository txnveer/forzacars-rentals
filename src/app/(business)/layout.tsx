import { requireRole } from "@/lib/auth/requireRole";

/**
 * Layout for the (business) route group.
 *
 * Server-side gate: only users with the BUSINESS role can render
 * children.  Everyone else is redirected before any page content loads.
 */
export default async function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("BUSINESS");
  return <>{children}</>;
}
