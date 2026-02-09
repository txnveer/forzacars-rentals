"use client";

import { useState, useTransition } from "react";
import { toggleUnitActive, deleteCarUnit, updateCarUnit } from "./actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CarRow({ unit }: { unit: any }) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelName =
    (unit.car_models as { display_name: string } | null)?.display_name ?? "—";

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      const res = await toggleUnitActive(unit.id, !unit.active);
      if (!res.success) setError(res.error ?? "Failed");
    });
  }

  function handleDelete() {
    if (!window.confirm(`Delete this unit? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCarUnit(unit.id);
      if (!res.success) setError(res.error ?? "Failed");
    });
  }

  async function handleUpdate(formData: FormData) {
    setError(null);
    const res = await updateCarUnit(formData);
    if (!res.success) {
      setError(res.error ?? "Failed");
    } else {
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <tr className="bg-gray-50">
        <td colSpan={7} className="px-6 py-4">
          <form action={handleUpdate} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="id" value={unit.id} />
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Display Name
              <input
                name="display_name"
                defaultValue={unit.display_name ?? ""}
                className="h-9 w-40 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Color
              <input
                name="color"
                defaultValue={unit.color ?? ""}
                className="h-9 w-28 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Color Hex
              <input
                name="color_hex"
                defaultValue={unit.color_hex ?? ""}
                className="h-9 w-24 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              Cr/hr
              <input
                name="credits_per_hour"
                type="number"
                min={1}
                defaultValue={unit.credits_per_hour ?? ""}
                className="h-9 w-20 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
              />
            </label>
            <button type="submit" className="h-9 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-700">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="h-9 rounded-lg border border-gray-300 px-4 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            {error && <p className="w-full text-sm text-red-600">{error}</p>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className={isPending ? "opacity-50" : ""}>
      <td className="px-6 py-4 font-medium text-gray-900">
        {unit.display_name ?? modelName}
      </td>
      <td className="px-6 py-4 text-gray-500 text-xs">{modelName}</td>
      <td className="px-6 py-4 text-gray-600">{unit.color ?? "—"}</td>
      <td className="px-6 py-4 text-gray-600 font-mono text-xs">{unit.vin}</td>
      <td className="px-6 py-4 text-gray-600 font-mono text-xs">{unit.license_plate}</td>
      <td className="px-6 py-4">
        <button
          onClick={handleToggle}
          disabled={isPending}
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            unit.active
              ? "bg-green-50 text-green-700 hover:bg-green-100"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
          }`}
        >
          {unit.active ? "Active" : "Inactive"}
        </button>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(true)} className="text-sm text-gray-500 hover:text-gray-900">Edit</button>
          <button onClick={handleDelete} disabled={isPending} className="text-sm text-red-500 hover:text-red-700">Delete</button>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}
