import { requireRole } from "@/lib/auth/requireRole";

/**
 * Layout for the (customer) route group.
 *
 * Server-side gate: only users with the CUSTOMER role can render
 * children.  Everyone else is redirected before any page content loads.
 */
export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("CUSTOMER");
  return <>{children}</>;
}
