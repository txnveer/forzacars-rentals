"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { addModelToFleet } from "../actions";

interface CarModel {
  id: string;
  display_name: string;
  manufacturer: string | null;
  model: string | null;
  image_url: string | null;
  suggested_credits_per_hour: number | null;
  stat_pi: number | null;
  class: string | null;
}

const COLOR_PRESETS = [
  { name: "Red", hex: "#DC2626" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Black", hex: "#171717" },
  { name: "White", hex: "#FAFAFA" },
  { name: "Silver", hex: "#A3A3A3" },
  { name: "Yellow", hex: "#EAB308" },
  { name: "Green", hex: "#16A34A" },
  { name: "Orange", hex: "#EA580C" },
];

export default function AddModelForm() {
  const router = useRouter();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CarModel[]>([]);
  const [searching, setSearching] = useState(false);

  // Selected model
  const [selectedModel, setSelectedModel] = useState<CarModel | null>(null);

  // Form state
  const [quantity, setQuantity] = useState(1);
  const [color, setColor] = useState("");
  const [colorHex, setColorHex] = useState("");
  const [priceOverride, setPriceOverride] = useState("");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search
  const search = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `/api/car-models/search?q=${encodeURIComponent(query)}`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.models ?? []);
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      search(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, search]);

  function handleSelectModel(model: CarModel) {
    setSelectedModel(model);
    setSearchQuery("");
    setSearchResults([]);
  }

  function handleColorPreset(preset: { name: string; hex: string }) {
    setColor(preset.name);
    setColorHex(preset.hex);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedModel) return;

    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("car_model_id", selectedModel.id);
    formData.set("quantity", String(quantity));
    formData.set("color", color);
    if (colorHex) formData.set("color_hex", colorHex);
    if (priceOverride) formData.set("credits_per_hour", priceOverride);

    const result = await addModelToFleet(formData);
    setSubmitting(false);

    if (result.success) {
      router.push("/biz/fleet");
    } else {
      setError(result.error ?? "Failed to add model to fleet.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Model search */}
      {!selectedModel && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Search for a car model
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="e.g., BMW M3, Ferrari, Mustang..."
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          {searching && (
            <p className="mt-2 text-sm text-gray-500">Searching...</p>
          )}

          {searchResults.length > 0 && (
            <ul className="mt-2 max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
              {searchResults.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectModel(m)}
                    className="flex w-full items-center gap-3 p-3 text-left hover:bg-gray-50"
                  >
                    {m.image_url && (
                      <div className="relative h-10 w-14 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                        <Image
                          src={m.image_url}
                          alt={m.display_name}
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {m.display_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {m.manufacturer} · {m.class ?? "—"} · PI{" "}
                        {m.stat_pi ?? "—"}
                      </p>
                    </div>
                    {m.suggested_credits_per_hour && (
                      <span className="text-xs text-gray-400">
                        {m.suggested_credits_per_hour} cr/hr
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <p className="mt-2 text-sm text-gray-500">
              No models found for &ldquo;{searchQuery}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Selected model display */}
      {selectedModel && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-4">
            {selectedModel.image_url && (
              <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                <Image
                  src={selectedModel.image_url}
                  alt={selectedModel.display_name}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
            )}
            <div className="flex-1">
              <p className="font-medium text-gray-900">
                {selectedModel.display_name}
              </p>
              <p className="text-sm text-gray-500">
                {selectedModel.manufacturer} · {selectedModel.class ?? "—"} · PI{" "}
                {selectedModel.stat_pi ?? "—"}
              </p>
              {selectedModel.suggested_credits_per_hour && (
                <p className="text-sm text-emerald-600">
                  Suggested: {selectedModel.suggested_credits_per_hour} cr/hr
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedModel(null)}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {/* Form fields */}
      {selectedModel && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Quantity */}
          <div>
            <label
              htmlFor="quantity"
              className="block text-sm font-medium text-gray-700"
            >
              Initial Quantity
            </label>
            <input
              type="number"
              id="quantity"
              min={1}
              max={100}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
              className="mt-1 block w-24 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Number of units to add (1-100)
            </p>
          </div>

          {/* Color */}
          <div>
            <label
              htmlFor="color"
              className="block text-sm font-medium text-gray-700"
            >
              Default Color <span className="text-red-500">*</span>
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleColorPreset(preset)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                    color === preset.name
                      ? "border-indigo-500 bg-indigo-50"
                      : "border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full border border-gray-300"
                    style={{ backgroundColor: preset.hex }}
                  />
                  {preset.name}
                </button>
              ))}
            </div>
            <input
              type="text"
              id="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              required
              placeholder="Or type a custom color..."
              className="mt-2 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Price override */}
          <div>
            <label
              htmlFor="price"
              className="block text-sm font-medium text-gray-700"
            >
              Price Override (optional)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                id="price"
                min={1}
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
                placeholder={String(selectedModel.suggested_credits_per_hour ?? "")}
                className="block w-32 rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-500">credits/hour</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to use suggested price (
              {selectedModel.suggested_credits_per_hour ?? "—"} cr/hr)
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !color}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Adding..." : `Add ${quantity} Unit${quantity !== 1 ? "s" : ""} to Fleet`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
