import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import GrantCreditsForm from "./GrantCreditsForm";
import UserRoleSelect from "./UserRoleSelect";
import Link from "next/link";

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

const PAGE_SIZE = 25;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const params = await searchParams;
  const profile = await getProfile();
  const parsed = parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // RLS: admin can read all profiles
  let query = supabase
    .from("profiles")
    .select("*, businesses ( name )", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.q) {
    const safe = params.q.replace(/"/g, "");
    query = query.ilike("email", `%${safe}%`);
  }

  const { data: users, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            User Management
          </h1>
          <p className="mt-1 text-gray-500">
            {count ?? 0} registered user{count !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Search */}
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by email…"
            className="h-9 w-56 rounded-lg border border-gray-300 px-3 text-sm placeholder:text-gray-400"
          />
          <button
            type="submit"
            className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700"
          >
            Search
          </button>
          {params.q && (
            <Link
              href="/admin/users"
              className="flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="mt-8 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Email
              </th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Role
              </th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Business
              </th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Joined
              </th>
              <th className="px-6 py-3 text-left font-medium text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users && users.length > 0 ? (
              users.map((user) => {
                const bizName =
                  (user.businesses as { name: string } | null)?.name ?? "—";
                const isSelf = user.id === profile?.id;

                return (
                  <tr key={user.id} className={isSelf ? "bg-indigo-50/40" : ""}>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {user.email}
                      {isSelf && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase text-indigo-500">
                          you
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <UserRoleSelect
                        userId={user.id}
                        currentRole={user.role}
                        isSelf={isSelf}
                      />
                    </td>
                    <td className="px-6 py-4 text-gray-600">{bizName}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {fmtDate(user.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <GrantCreditsForm userId={user.id} />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  className="px-6 py-10 text-center text-gray-400"
                  colSpan={5}
                >
                  {params.q
                    ? "No users match your search."
                    : "No users found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2">
          <PaginationLink
            page={currentPage - 1}
            disabled={currentPage <= 1}
            q={params.q}
            label="← Previous"
          />
          <span className="px-3 text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <PaginationLink
            page={currentPage + 1}
            disabled={currentPage >= totalPages}
            q={params.q}
            label="Next →"
          />
        </nav>
      )}
    </section>
  );
}

function PaginationLink({
  page,
  disabled,
  q,
  label,
}: {
  page: number;
  disabled: boolean;
  q?: string;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-300">
        {label}
      </span>
    );
  }

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("page", String(page));

  return (
    <Link
      href={`/admin/users?${params.toString()}`}
      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      {label}
    </Link>
  );
}
