"use client";

import { useState, useRef } from "react";
import { grantCredits } from "./actions";

export default function GrantCreditsForm({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setResult(null);
    const res = await grantCredits(formData);
    if (!res.success) {
      setError(res.error ?? "Failed");
    } else {
      setResult(
        `Granted! New balance: ${res.newBalance ?? "—"}`
      );
      formRef.current?.reset();
      setTimeout(() => {
        setResult(null);
        setOpen(false);
      }, 3000);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-indigo-600 hover:text-indigo-800"
      >
        Grant credits
      </button>
    );
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex items-center gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <input
        name="amount"
        type="number"
        min={1}
        required
        placeholder="Amt"
        className="h-7 w-16 rounded border border-gray-300 px-1 text-xs"
      />
      <input
        name="reason"
        required
        placeholder="Reason"
        className="h-7 w-28 rounded border border-gray-300 px-1 text-xs"
      />
      <button
        type="submit"
        className="h-7 rounded bg-indigo-600 px-2 text-xs font-medium text-white hover:bg-indigo-500"
      >
        Grant
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
          setResult(null);
        }}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
      {result && <span className="text-xs text-green-600">{result}</span>}
    </form>
  );
}
