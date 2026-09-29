"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { apiClient } from "@/utils/api";
import { FormEvent, useState } from "react";
import toast from "react-hot-toast";

export default function DataDeletionPage() {
  const { ready } = useAuthGuard({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiClient.requestDataDeletion(reason);
      if (!res.success) {
        toast.error(res.message || "Could not submit request");
        return;
      }
      toast.success("Deletion request submitted");
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-6">
          <h1 className="text-2xl font-bold text-foreground">Request data deletion</h1>
          <p className="mt-2 text-sm text-fg-muted">
            This sends a deletion request to admins for review and processing.
          </p>
          <label className="mt-4 block text-sm font-medium text-fg-muted">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={5}
            className="mt-2 w-full rounded-lg border border-border p-3"
            placeholder="Explain why you want account/data deletion..."
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-4 rounded-lg bg-gradient-to-r from-accent to-accent-end px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Submitting..." : "Submit deletion request"}
          </button>
        </form>
      </div>
    </div>
  );
}
