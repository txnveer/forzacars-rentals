"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { grantCreditsInThread } from "../actions";

interface GrantCreditsButtonProps {
  threadId: string;
  recipientId: string;
  recipientName: string;
}

export default function GrantCreditsButton({
  threadId,
  recipientId,
  recipientName,
}: GrantCreditsButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);
    setPending(true);

    const result = await grantCreditsInThread(formData);
    setPending(false);

    if (!result.success) {
      setError(result.error ?? "Failed to grant credits.");
    } else {
      setSuccess(
        result.newBalance !== undefined
          ? `Credits granted! New balance: ${result.newBalance}`
          : "Credits granted successfully!"
      );
      setTimeout(() => {
        setSuccess(null);
        setIsOpen(false);
        router.refresh();
      }, 2000);
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
      >
        Grant Credits
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-md">
      <h3 className="text-sm font-medium text-gray-900">Grant Credits</h3>
      <p className="mt-1 text-xs text-gray-500">
        Grant credits to <strong>{recipientName}</strong>
      </p>

      <form action={handleSubmit} className="mt-4 space-y-3">
        <input type="hidden" name="thread_id" value={threadId} />
        <input type="hidden" name="user_id" value={recipientId} />

        <div>
          <label
            htmlFor="grant_amount"
            className="block text-xs font-medium text-gray-700"
          >
            Amount
          </label>
          <input
            type="number"
            id="grant_amount"
            name="amount"
            min={1}
            required
            placeholder="100"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div>
          <label
            htmlFor="grant_reason"
            className="block text-xs font-medium text-gray-700"
          >
            Reason
          </label>
          <input
            type="text"
            id="grant_reason"
            name="reason"
            required
            maxLength={200}
            placeholder="e.g., Credit request approved"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 p-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="rounded-md bg-green-50 p-2">
            <p className="text-xs text-green-700">{success}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setError(null);
              setSuccess(null);
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Granting…" : "Grant"}
          </button>
        </div>
      </form>
    </div>
  );
}
