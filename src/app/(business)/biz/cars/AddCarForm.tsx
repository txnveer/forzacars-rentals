"use client";

import { useState, useRef, useMemo } from "react";
import { addCarUnit } from "./actions";

interface CarModel {
  id: string;
  display_name: string;
  suggested_credits_per_hour: number | null;
}

export default function AddCarForm({ models }: { models: CarModel[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  // Look up the selected model's suggested price
  const selectedModel = useMemo(
    () => models.find((m) => m.id === selectedModelId) ?? null,
    [models, selectedModelId]
  );

  async function handleSubmit(formData: FormData) {
    setError(null);
    const res = await addCarUnit(formData);
    if (!res.success) {
      setError(res.error ?? "Failed to add car unit.");
    } else {
      formRef.current?.reset();
      setSelectedModelId("");
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-700"
      >
        + Add Unit
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-gray-900">Add a car unit to your fleet</h3>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Car Model *
          <select
            name="car_model_id"
            required
            value={selectedModelId}
            onChange={(e) => setSelectedModelId(e.target.value)}
            className="h-9 w-56 rounded-lg border border-gray-300 px-2 text-sm text-gray-900"
          >
            <option value="">Select a model…</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Display Name
          <input
            name="display_name"
            placeholder="Optional override"
            className="h-9 w-40 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Color
          <input
            name="color"
            placeholder="e.g. Rosso Corsa"
            className="h-9 w-32 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Color Hex
          <input
            name="color_hex"
            placeholder="#FF0000"
            pattern="^#[0-9A-Fa-f]{6}$"
            className="h-9 w-24 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
          Cr/hr override
          <input
            name="credits_per_hour"
            type="number"
            min={1}
            placeholder={
              selectedModel?.suggested_credits_per_hour
                ? String(selectedModel.suggested_credits_per_hour)
                : "—"
            }
            className="h-9 w-20 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 placeholder:text-gray-400"
          />
        </label>
      </div>

      {/* Show suggested price hint when a model is selected */}
      {selectedModel?.suggested_credits_per_hour != null && (
        <p className="mt-3 text-xs text-emerald-600">
          Suggested price for {selectedModel.display_name}:{" "}
          <span className="font-semibold">{selectedModel.suggested_credits_per_hour} cr/hr</span>.
          Leave override blank to use this.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Add Unit
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
            setSelectedModelId("");
          }}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
