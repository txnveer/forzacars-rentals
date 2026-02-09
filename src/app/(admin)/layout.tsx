import { requireRole } from "@/lib/auth/requireRole";

/**
 * Layout for the (admin) route group.
 *
 * Server-side gate: only users with the ADMIN role can render
 * children.  Everyone else is redirected before any page content loads.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("ADMIN");
  return <>{children}</>;
}
