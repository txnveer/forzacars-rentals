"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendMessage } from "../actions";

interface MessageComposerProps {
  threadId: string;
  recipientId: string;
}

export default function MessageComposer({ threadId, recipientId }: MessageComposerProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);

    const result = await sendMessage(formData);
    setPending(false);

    if (!result.success) {
      setError(result.error ?? "Failed to send message.");
    } else {
      formRef.current?.reset();
      router.refresh();
    }
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-4"
    >
      <input type="hidden" name="thread_id" value={threadId} />
      <input type="hidden" name="recipient_id" value={recipientId} />

      <textarea
        name="body"
        rows={3}
        required
        maxLength={2000}
        placeholder="Type your message…"
        className="block w-full resize-none rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
