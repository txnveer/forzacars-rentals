"use client";

import { useState, useTransition } from "react";
import { updateUserRole } from "./actions";

const ROLES = ["CUSTOMER", "BUSINESS", "ADMIN"] as const;

export default function UserRoleSelect({
  userId,
  currentRole,
  isSelf,
}: {
  userId: string;
  currentRole: string;
  isSelf: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value;
    if (newRole === currentRole) return;
    setError(null);
    startTransition(async () => {
      const res = await updateUserRole(userId, newRole);
      if (!res.success) setError(res.error ?? "Failed");
    });
  }

  return (
    <div>
      <select
        value={currentRole}
        onChange={handleChange}
        disabled={isSelf || isPending}
        className={`h-7 rounded border border-gray-300 px-1 text-xs ${
          isPending ? "opacity-50" : ""
        } ${isSelf ? "cursor-not-allowed bg-gray-50 text-gray-400" : ""}`}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
