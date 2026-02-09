import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

interface Props {
  searchParams: Promise<{
    entity_type?: string;
    action?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 30;

function fmtTs(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default async function AdminAuditPage({ searchParams }: Props) {
  const params = await searchParams;
  const parsed = parseInt(params.page ?? "1", 10);
  const currentPage = Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
  const offset = (currentPage - 1) * PAGE_SIZE;

  const supabase = await createClient();

  // RLS: admin can read all audit_log entries
  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.entity_type) {
    query = query.eq("entity_type", params.entity_type);
  }
  if (params.action) {
    query = query.eq("action", params.action);
  }

  const { data: entries, count } = await query;

  // Fetch distinct values for filter dropdowns
  const { data: entityTypes } = await supabase
    .from("audit_log")
    .select("entity_type");
  const { data: actions } = await supabase
    .from("audit_log")
    .select("action");

  const uniqueEntityTypes = Array.from(
    new Set((entityTypes ?? []).map((r) => r.entity_type as string))
  ).sort();
  const uniqueActions = Array.from(
    new Set((actions ?? []).map((r) => r.action as string))
  ).sort();

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);
  const hasFilters = !!(params.entity_type || params.action);

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Audit Log
        </h1>
        <p className="mt-1 text-gray-500">
          {count ?? 0} entr{count !== 1 ? "ies" : "y"} total
        </p>
      </div>

      {/* Filters */}
      <form className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Entity type
          <select
            name="entity_type"
            defaultValue={params.entity_type ?? ""}
            className="h-9 w-40 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
          >
            <option value="">All</option>
            {uniqueEntityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Action
          <select
            name="action"
            defaultValue={params.action ?? ""}
            className="h-9 w-40 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
          >
            <option value="">All</option>
            {uniqueActions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700"
        >
          Filter
        </button>
        {hasFilters && (
          <Link
            href="/admin/audit"
            className="flex h-9 items-center rounded-lg border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Entries */}
      <div className="mt-8 space-y-3">
        {entries && entries.length > 0 ? (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                    {entry.action}
                  </span>
                  <span className="inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {entry.entity_type}
                  </span>
                  {entry.entity_id && (
                    <span className="font-mono text-xs text-gray-400">
                      {entry.entity_id}
                    </span>
                  )}
                </div>

                <span className="text-xs text-gray-400">
                  {fmtTs(entry.created_at)}
                </span>
              </div>

              {entry.actor_user_id && (
                <p className="mt-2 text-xs text-gray-500">
                  Actor:{" "}
                  <span className="font-mono text-gray-600">
                    {entry.actor_user_id}
                  </span>
                </p>
              )}

              {/* Metadata */}
              {entry.metadata &&
                Object.keys(entry.metadata as object).length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
                      Metadata
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  </details>
                )}
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-400">
            {hasFilters
              ? "No entries match your filters."
              : "No audit log entries yet."}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2">
          <AuditPaginationLink
            page={currentPage - 1}
            disabled={currentPage <= 1}
            params={params}
            label="← Previous"
          />
          <span className="px-3 text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <AuditPaginationLink
            page={currentPage + 1}
            disabled={currentPage >= totalPages}
            params={params}
            label="Next →"
          />
        </nav>
      )}
    </section>
  );
}

function AuditPaginationLink({
  page,
  disabled,
  params,
  label,
}: {
  page: number;
  disabled: boolean;
  params: Record<string, string | undefined>;
  label: string;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-300">
        {label}
      </span>
    );
  }

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && k !== "page") sp.set(k, v);
  }
  sp.set("page", String(page));

  return (
    <Link
      href={`/admin/audit?${sp.toString()}`}
      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      {label}
    </Link>
  );
}
