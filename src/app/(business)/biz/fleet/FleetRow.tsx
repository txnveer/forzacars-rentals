"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { incrementFleetQuantity, decrementFleetQuantity } from "./actions";
import UnitImageUpload from "./UnitImageUpload";

interface FleetUnit {
  id: string;
  color: string | null;
  color_hex: string | null;
  credits_per_hour: number | null;
  image_path: string | null;
  thumb_path: string | null;
}

interface FleetModel {
  car_model_id: string;
  display_name: string;
  manufacturer: string | null;
  model: string | null;
  image_url: string | null;
  suggested_credits_per_hour: number | null;
  stat_pi: number | null;
  class: string | null;
  quantity: number;
  effective_price: number | null;
  colors: string[];
  units: FleetUnit[];
}

interface FleetRowProps {
  model: FleetModel;
}

export default function FleetRow({ model }: FleetRowProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(model.quantity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function handleIncrement() {
    setLoading(true);
    setError(null);

    const result = await incrementFleetQuantity(model.car_model_id, quantity);

    if (result.success && result.data?.newQty !== undefined) {
      setQuantity(result.data.newQty);
      router.refresh();
    } else {
      setError(result.error ?? "Failed to add unit");
    }

    setLoading(false);
  }

  async function handleDecrement() {
    if (quantity <= 0) return;

    setLoading(true);
    setError(null);

    const result = await decrementFleetQuantity(model.car_model_id, quantity);

    if (result.success && result.data?.newQty !== undefined) {
      setQuantity(result.data.newQty);
      router.refresh();
    } else {
      setError(result.error ?? "Failed to remove unit");
    }

    setLoading(false);
  }

  return (
    <div>
      {/* Model row */}
      <div className="flex items-center gap-4 p-4">
        {/* Thumbnail */}
        <div className="relative h-16 w-24 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
          {model.image_url ? (
            <Image
              src={model.image_url}
              alt={model.display_name}
              fill
              sizes="96px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-300">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Model info */}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-400">{model.manufacturer}</p>
          <p className="truncate font-medium text-gray-900">
            {model.model ?? model.display_name}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
            {model.class && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium">
                {model.class}
              </span>
            )}
            {model.stat_pi && <span>PI {model.stat_pi}</span>}
            {model.colors.length > 0 && (
              <span className="text-gray-400">
                {model.colors.slice(0, 3).join(", ")}
                {model.colors.length > 3 && ` +${model.colors.length - 3}`}
              </span>
            )}
          </div>
        </div>

        {/* Price */}
        <div className="text-right">
          <p className="text-sm font-medium text-gray-900">
            {model.effective_price ?? "—"} cr/hr
          </p>
          {model.effective_price !== model.suggested_credits_per_hour && (
            <p className="text-xs text-gray-400">
              suggested: {model.suggested_credits_per_hour}
            </p>
          )}
        </div>

        {/* Quantity controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleDecrement}
            disabled={loading || quantity <= 0}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            −
          </button>
          <span className="w-8 text-center font-medium text-gray-900">{quantity}</span>
          <button
            onClick={handleIncrement}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            +
          </button>
        </div>

        {/* Expand/collapse units */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-600 hover:text-indigo-800"
        >
          {expanded ? "Hide units" : "Show units"}
        </button>

        {/* Error display */}
        {error && (
          <p className="text-xs text-red-600 max-w-[150px] truncate" title={error}>
            {error}
          </p>
        )}
      </div>

      {/* Expanded units list */}
      {expanded && model.units.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
            Individual Units ({model.units.length})
          </p>
          <div className="space-y-2">
            {model.units.map((unit) => (
              <div
                key={unit.id}
                className="flex items-center gap-3 rounded-lg bg-white p-3 shadow-sm"
              >
                {/* Unit thumbnail or placeholder */}
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-gray-100">
                  {unit.thumb_path ? (
                    <Image
                      src={`/api/storage/car-images/${unit.thumb_path}`}
                      alt="Unit thumbnail"
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Unit info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {unit.color_hex && (
                      <span
                        className="h-3 w-3 rounded-full border border-gray-300"
                        style={{ backgroundColor: unit.color_hex }}
                      />
                    )}
                    <span className="text-sm font-medium text-gray-900">
                      {unit.color ?? "No color"}
                    </span>
                    {unit.credits_per_hour && (
                      <span className="text-xs text-gray-400">
                        {unit.credits_per_hour} cr/hr
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">
                    ID: {unit.id.slice(0, 8)}...
                  </p>
                </div>

                {/* Upload button */}
                <UnitImageUpload
                  unitId={unit.id}
                  hasImage={!!unit.image_path}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
