"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createThread } from "../actions";

export default function NewThreadForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);

    const result = await createThread(formData);
    setPending(false);

    if (!result.success) {
      setError(result.error ?? "Failed to start conversation.");
    } else if (result.threadId) {
      router.push(`/messages/${result.threadId}`);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      {/* Recipient ID */}
      <div>
        <label
          htmlFor="recipient_id"
          className="block text-sm font-medium text-gray-700"
        >
          Recipient User ID
        </label>
        <input
          type="text"
          id="recipient_id"
          name="recipient_id"
          required
          placeholder="Enter user UUID"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          Enter the UUID of the user you want to message. (User search coming soon.)
        </p>
      </div>

      {/* Subject (optional) */}
      <div>
        <label
          htmlFor="subject"
          className="block text-sm font-medium text-gray-700"
        >
          Subject (optional)
        </label>
        <input
          type="text"
          id="subject"
          name="subject"
          maxLength={200}
          placeholder="e.g., Question about booking"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Message body */}
      <div>
        <label
          htmlFor="body"
          className="block text-sm font-medium text-gray-700"
        >
          Message
        </label>
        <textarea
          id="body"
          name="body"
          rows={5}
          required
          maxLength={2000}
          placeholder="Write your message…"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-gray-500">Max 2000 characters.</p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send Message"}
        </button>
      </div>
    </form>
  );
}
