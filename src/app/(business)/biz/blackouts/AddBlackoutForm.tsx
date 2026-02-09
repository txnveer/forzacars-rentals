"use client";

import { useState, useRef } from "react";
import { addBlackout } from "./actions";

interface UnitOption {
  id: string;
  label: string;
}

export default function AddBlackoutForm({ units }: { units: UnitOption[] }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    const res = await addBlackout(formData);
    if (!res.success) {
      setError(res.error ?? "Failed");
    } else {
      formRef.current?.reset();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    }
  }

  if (units.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        Add a car unit first before creating blackout windows.
      </p>
    );
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-gray-900">
        Create a blackout window
      </h3>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Car Unit *
          <select
            name="car_unit_id"
            required
            className="h-9 w-48 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
          >
            <option value="">Select a unit…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Start *
          <input
            name="start_ts"
            type="datetime-local"
            required
            className="h-9 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          End *
          <input
            name="end_ts"
            type="datetime-local"
            required
            className="h-9 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Reason
          <input
            name="reason"
            placeholder="e.g. Maintenance"
            className="h-9 w-40 rounded-lg border border-gray-300 px-2 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </label>

        <button
          type="submit"
          className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700"
        >
          Add Blackout
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {success && (
        <p className="mt-3 text-sm text-green-600">
          Blackout window created.
        </p>
      )}
    </form>
  );
}
