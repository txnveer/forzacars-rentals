import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";

export default async function WalletPage() {
  const profile = await getProfile();
  const supabase = await createClient();

  // Fetch the full ledger (RLS scoped to own rows)
  const { data: ledger } = await supabase
    .from("credit_ledger")
    .select("*")
    .order("created_at", { ascending: false });

  // Compute balance as sum of all deltas
  const balance = (ledger ?? []).reduce((sum, row) => sum + row.delta, 0);

  return (
    <section className="mx-auto max-w-3xl px-6 py-10">
      {/* Header */}
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">
        My Wallet
      </h1>
      <p className="mt-1 text-gray-500">{profile?.email}</p>

      {/* Balance card */}
      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wider text-gray-400">
          Available Balance
        </p>
        <p className="mt-2 text-5xl font-bold tracking-tight text-gray-900">
          {balance}
          <span className="ml-2 text-lg font-normal text-gray-400">
            credits
          </span>
        </p>
      </div>

      {/* Ledger history */}
      <div className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          Transaction History
        </h2>

        {!ledger || ledger.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">
            No transactions yet. Credits will appear here once granted by an
            admin.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
            {ledger.map((entry) => {
              const isPositive = entry.delta > 0;
              const created = new Date(entry.created_at);

              return (
                <li
                  key={entry.id}
                  className="flex items-center justify-between px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {entry.reason}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {created.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      &middot;{" "}
                      {created.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 text-sm font-semibold ${
                      isPositive ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {entry.delta}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
