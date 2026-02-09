"use client";

import { useState, useMemo, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { bulkCreateUnits, type BulkCreateResult } from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CarModel {
  id: string;
  display_name: string;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  image_url: string | null;
  stat_pi: number | null;
  suggested_credits_per_hour: number | null;
}

interface UnitRow {
  /** Client-side key for React rendering */
  key: number;
  color: string;
  color_hex: string;
  vin: string;
  license_plate: string;
  credits_per_hour: string;
}

// ---------------------------------------------------------------------------
// Preset color chips
// ---------------------------------------------------------------------------

const PRESET_COLORS: { name: string; hex: string }[] = [
  { name: "Red", hex: "#FF0000" },
  { name: "Blue", hex: "#0000FF" },
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Green", hex: "#008000" },
  { name: "Silver", hex: "#C0C0C0" },
  { name: "Yellow", hex: "#FFD700" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextKey = 1;
function emptyRow(): UnitRow {
  return {
    key: nextKey++,
    color: "",
    color_hex: "",
    vin: "",
    license_plate: "",
    credits_per_hour: "",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BulkAddForm({ models }: { models: CarModel[] }) {
  const router = useRouter();

  // --- State ---
  const [search, setSearch] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkCreateResult | null>(null);

  // --- Derived ---
  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId]
  );

  const filteredModels = useMemo(() => {
    if (!search.trim()) return models.slice(0, 30); // show first 30
    const q = search.toLowerCase();
    return models.filter(
      (m) =>
        m.display_name.toLowerCase().includes(q) ||
        m.manufacturer?.toLowerCase().includes(q) ||
        m.model?.toLowerCase().includes(q)
    );
  }, [models, search]);

  // Detect duplicate colors
  const duplicateColors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of units) {
      const c = u.color.trim().toLowerCase();
      if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    counts.forEach((n, c) => {
      if (n > 1) dupes.add(c);
    });
    return dupes;
  }, [units]);

  // --- Callbacks ---
  const updateUnit = useCallback(
    (key: number, field: keyof UnitRow, value: string) => {
      setUnits((prev) =>
        prev.map((u) => (u.key === key ? { ...u, [field]: value } : u))
      );
    },
    []
  );

  const removeUnit = useCallback((key: number) => {
    setUnits((prev) => {
      const next = prev.filter((u) => u.key !== key);
      return next.length > 0 ? next : [emptyRow()];
    });
  }, []);

  const addRow = useCallback(() => {
    setUnits((prev) => (prev.length < 20 ? [...prev, emptyRow()] : prev));
  }, []);

  const applyPreset = useCallback((name: string, hex: string) => {
    setUnits((prev) => {
      // If the last row is empty, fill it; otherwise append
      const last = prev[prev.length - 1];
      if (last && !last.color.trim()) {
        return prev.map((u, i) =>
          i === prev.length - 1 ? { ...u, color: name, color_hex: hex } : u
        );
      }
      if (prev.length >= 20) return prev;
      return [...prev, { ...emptyRow(), color: name, color_hex: hex }];
    });
  }, []);

  async function handleSubmit() {
    if (!selectedModelId) {
      setError("Please select a car model.");
      return;
    }
    // Client-side basic check
    const hasEmptyColor = units.some((u) => !u.color.trim());
    if (hasEmptyColor) {
      setError("Every unit must have a color.");
      return;
    }

    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const payload = {
        car_model_id: selectedModelId,
        units: units.map((u) => ({
          color: u.color.trim(),
          color_hex: u.color_hex.trim() || null,
          vin: u.vin.trim() || null,
          license_plate: u.license_plate.trim() || null,
          credits_per_hour: u.credits_per_hour
            ? parseInt(u.credits_per_hour, 10) || null
            : null,
        })),
      };

      const res = await bulkCreateUnits(payload);
      if (!res.success) {
        setError(res.error ?? "Something went wrong.");
        setResult(res);
      } else {
        setResult(res);
        // Redirect after short delay so user sees success
        setTimeout(() => router.push("/biz/inventory"), 1500);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="mt-8 space-y-8">
      {/* ---- Step 1: Select model ---- */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
          1. Select Car Model
        </h2>

        <input
          type="text"
          placeholder="Search by manufacturer, model, or name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mt-3 h-10 w-full rounded-lg border border-gray-300 px-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-500 focus:outline-none"
        />

        {/* Model list (scrollable) */}
        {!selectedModel && (
          <ul className="mt-3 max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-100">
            {filteredModels.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-400">
                No models match your search.
              </li>
            )}
            {filteredModels.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModelId(m.id);
                    setSearch("");
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-gray-50"
                >
                  {m.image_url ? (
                    <Image
                      src={m.image_url}
                      alt={m.display_name}
                      width={56}
                      height={36}
                      className="rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-14 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-300">
                      No img
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {m.display_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {m.year ?? "—"}{" "}
                      {m.stat_pi != null && `· PI ${m.stat_pi}`}{" "}
                      {m.suggested_credits_per_hour != null &&
                        `· ${m.suggested_credits_per_hour} cr/hr`}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Selected model card */}
        {selectedModel && (
          <div className="mt-4 flex items-start gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            {selectedModel.image_url ? (
              <Image
                src={selectedModel.image_url}
                alt={selectedModel.display_name}
                width={120}
                height={75}
                className="rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-[75px] w-[120px] items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-300">
                No image
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-lg font-bold text-gray-900">
                {selectedModel.display_name}
              </p>
              <p className="text-sm text-gray-500">
                {selectedModel.year ?? "—"}{" "}
                {selectedModel.stat_pi != null && `· PI ${selectedModel.stat_pi}`}
              </p>
              {selectedModel.suggested_credits_per_hour != null && (
                <p className="mt-1 text-sm font-semibold text-emerald-700">
                  Suggested: {selectedModel.suggested_credits_per_hour} cr/hr
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedModelId(null)}
              className="shrink-0 rounded border border-gray-300 px-3 py-1 text-xs text-gray-500 hover:bg-white"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* ---- Step 2: Unit rows ---- */}
      {selectedModel && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            2. Configure Units
          </h2>

          {/* Preset color chips */}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs text-gray-400">Quick add:</span>
            {PRESET_COLORS.map((pc) => (
              <button
                key={pc.name}
                type="button"
                onClick={() => applyPreset(pc.name, pc.hex)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border border-gray-300"
                  style={{ backgroundColor: pc.hex }}
                />
                {pc.name}
              </button>
            ))}
          </div>

          {/* Unit rows */}
          <div className="mt-5 space-y-3">
            {units.map((u, idx) => (
              <div
                key={u.key}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600">
                  {idx + 1}
                </span>

                <label className="flex flex-col gap-0.5 text-xs font-medium text-gray-500">
                  Color *
                  <input
                    value={u.color}
                    onChange={(e) => updateUnit(u.key, "color", e.target.value)}
                    placeholder="e.g. Rosso Corsa"
                    className="h-8 w-32 rounded border border-gray-300 px-2 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                </label>

                <label className="flex flex-col gap-0.5 text-xs font-medium text-gray-500">
                  Hex
                  <input
                    value={u.color_hex}
                    onChange={(e) => updateUnit(u.key, "color_hex", e.target.value)}
                    placeholder="#FF0000"
                    className="h-8 w-24 rounded border border-gray-300 px-2 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                </label>

                <label className="flex flex-col gap-0.5 text-xs font-medium text-gray-500">
                  VIN
                  <input
                    value={u.vin}
                    onChange={(e) => updateUnit(u.key, "vin", e.target.value)}
                    placeholder="Auto-generated"
                    className="h-8 w-36 rounded border border-gray-300 px-2 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                </label>

                <label className="flex flex-col gap-0.5 text-xs font-medium text-gray-500">
                  Plate
                  <input
                    value={u.license_plate}
                    onChange={(e) =>
                      updateUnit(u.key, "license_plate", e.target.value)
                    }
                    placeholder="Auto-generated"
                    className="h-8 w-28 rounded border border-gray-300 px-2 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                </label>

                <label className="flex flex-col gap-0.5 text-xs font-medium text-gray-500">
                  Cr/hr
                  <input
                    value={u.credits_per_hour}
                    onChange={(e) =>
                      updateUnit(u.key, "credits_per_hour", e.target.value)
                    }
                    type="number"
                    min={1}
                    placeholder={
                      selectedModel.suggested_credits_per_hour
                        ? String(selectedModel.suggested_credits_per_hour)
                        : "—"
                    }
                    className="h-8 w-20 rounded border border-gray-300 px-2 text-sm text-gray-900 placeholder:text-gray-400"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => removeUnit(u.key)}
                  className="flex h-8 w-8 items-center justify-center rounded text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="Remove row"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {/* Duplicate color warning */}
                {u.color.trim() &&
                  duplicateColors.has(u.color.trim().toLowerCase()) && (
                    <span className="text-xs text-amber-600">
                      Duplicate color
                    </span>
                  )}
              </div>
            ))}
          </div>

          {/* Add another row */}
          {units.length < 20 && (
            <button
              type="button"
              onClick={addRow}
              className="mt-3 rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
            >
              + Add another color
            </button>
          )}
          {units.length >= 20 && (
            <p className="mt-2 text-xs text-gray-400">
              Maximum of 20 units per batch reached.
            </p>
          )}
        </div>
      )}

      {/* ---- Step 3: Summary + submit ---- */}
      {selectedModel && units.some((u) => u.color.trim()) && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
            3. Confirm
          </h2>

          <p className="mt-3 text-sm text-gray-700">
            Creating{" "}
            <span className="font-bold text-gray-900">
              {units.filter((u) => u.color.trim()).length}
            </span>{" "}
            unit{units.filter((u) => u.color.trim()).length !== 1 ? "s" : ""} for{" "}
            <span className="font-bold text-gray-900">
              {selectedModel.display_name}
            </span>
          </p>

          {/* Error display */}
          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Success display */}
          {result?.success && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Successfully created {result.created?.length ?? 0} units!
              Redirecting to inventory…
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || result?.success === true}
              className="rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create Units"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
