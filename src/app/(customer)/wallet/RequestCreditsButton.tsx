"use client";

import { useState } from "react";
import { requestCredits } from "./actions";

export default function RequestCreditsButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);

    const result = await requestCredits(formData);
    setPending(false);

    // If we get here without redirect, there was an error
    if (!result.success) {
      setError(result.error ?? "Failed to send request.");
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Request Credits
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-gray-900">Request Credits</h3>
      <p className="mt-1 text-xs text-gray-500">
        Submit a request to receive credits. An admin will review your request.
      </p>

      <form action={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label
            htmlFor="amount"
            className="block text-xs font-medium text-gray-700"
          >
            Amount
          </label>
          <input
            type="number"
            id="amount"
            name="amount"
            min={1}
            required
            placeholder="100"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label
            htmlFor="note"
            className="block text-xs font-medium text-gray-700"
          >
            Note (optional)
          </label>
          <textarea
            id="note"
            name="note"
            rows={2}
            maxLength={500}
            placeholder="Reason for your request…"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setError(null);
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
