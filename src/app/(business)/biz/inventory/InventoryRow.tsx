"use client";

import { useState } from "react";
import { toggleInventoryActive } from "./actions";

interface UnitData {
  id: string;
  display_name: string | null;
  color: string | null;
  color_hex: string | null;
  vin: string;
  license_plate: string;
  credits_per_hour: number | null;
  active: boolean;
}

interface Props {
  unit: UnitData;
  modelName: string;
  effectivePrice: number | null;
  isOverride: boolean;
}

export default function InventoryRow({
  unit,
  modelName,
  effectivePrice,
  isOverride,
}: Props) {
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setError(null);
    setToggling(true);
    const res = await toggleInventoryActive(unit.id, !unit.active);
    if (!res.success) setError(res.error ?? "Failed");
    setToggling(false);
  }

  return (
    <tr className={unit.active ? "" : "bg-gray-50 opacity-60"}>
      {/* Model */}
      <td className="px-5 py-3">
        <p className="font-medium text-gray-900">{modelName}</p>
        {unit.display_name && (
          <p className="text-xs text-gray-400">{unit.display_name}</p>
        )}
      </td>

      {/* Color */}
      <td className="px-5 py-3">
        <span className="inline-flex items-center gap-1.5">
          {unit.color_hex && (
            <span
              className="inline-block h-3 w-3 rounded-full border border-gray-300"
              style={{ backgroundColor: unit.color_hex }}
            />
          )}
          <span className="text-gray-700">{unit.color ?? "—"}</span>
        </span>
      </td>

      {/* VIN */}
      <td className="px-5 py-3 font-mono text-xs text-gray-500">
        {unit.vin}
      </td>

      {/* Plate */}
      <td className="px-5 py-3 font-mono text-xs text-gray-500">
        {unit.license_plate}
      </td>

      {/* Price */}
      <td className="px-5 py-3">
        {effectivePrice != null ? (
          <span className="text-gray-900">
            {effectivePrice}{" "}
            {isOverride ? (
              <span className="text-[10px] font-medium text-amber-600">
                override
              </span>
            ) : (
              <span className="text-[10px] text-gray-400">suggested</span>
            )}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>

      {/* Status */}
      <td className="px-5 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            unit.active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-gray-200 text-gray-500"
          }`}
        >
          {unit.active ? "Active" : "Inactive"}
        </span>
      </td>

      {/* Actions */}
      <td className="px-5 py-3">
        <button
          onClick={handleToggle}
          disabled={toggling}
          className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
        >
          {toggling
            ? "…"
            : unit.active
              ? "Deactivate"
              : "Activate"}
        </button>
        {error && (
          <span className="ml-2 text-xs text-red-500">{error}</span>
        )}
      </td>
    </tr>
  );
}
