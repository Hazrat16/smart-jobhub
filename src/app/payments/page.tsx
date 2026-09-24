"use client";

import { Payment } from "@/types";
import { apiClient, getUser } from "@/utils/api";
import { Loader2, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

function PaymentsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("100");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getMyPayments();
      if (!res.success) {
        toast.error(res.message || "Could not load payments");
        setPayments([]);
        return;
      }
      setPayments(res.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "employer") {
      toast.error("Payments are available for employer accounts.");
      router.replace("/");
      return;
    }
    void load();
  }, [load, router]);

  useEffect(() => {
    const ssl = searchParams.get("ssl");
    if (!ssl) return;
    if (ssl === "success") {
      toast.success("Payment completed. Thank you.");
      void load();
    } else if (ssl === "fail") {
      toast.error("Payment did not complete.");
      void load();
    } else if (ssl === "cancel") {
      toast("Payment was cancelled.");
      void load();
    }
    router.replace("/payments");
  }, [searchParams, load, router]);

  const handlePay = async () => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n < 10 || n > 500_000) {
      toast.error("Enter an amount between 10 and 500,000 BDT.");
      return;
    }
    setPaying(true);
    try {
      const res = await apiClient.initSslCommerzPayment(n);
      if (!res.success || !res.data?.gatewayUrl) {
        toast.error(res.message || "Could not start payment");
        return;
      }
      window.location.href = res.data.gatewayUrl;
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent via-accent-end to-hold text-white shadow-lg shadow-accent/30 ring-2 ring-border/50">
            <Wallet className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 className="bg-gradient-to-r from-foreground via-accent to-foreground dark:via-accent-end bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
              Payments (BDT)
            </h1>
            <p className="text-sm text-fg-muted">
              Top up securely via SSLCOMMERZ using cards, mobile banking, and
              other supported payment methods. See the{" "}
              <a
                href="https://developer.sslcommerz.com/doc/v4/"
                className="font-medium text-accent hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                for sandbox test cards
              </a>
              .
            </p>
          </div>
        </div>

        <div className="mb-8 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-xl shadow-foreground/5 ring-1 ring-foreground/5 backdrop-blur-md">
          <h2 className="text-lg font-bold text-foreground">Start a payment</h2>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-sm font-medium text-fg-muted">
                Amount (BDT)
              </span>
              <input
                type="number"
                min={10}
                max={500_000}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-40 rounded-xl border border-border bg-card/90 px-3 py-2 text-foreground shadow-inner shadow-foreground/5 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </label>
            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={paying}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-end px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:brightness-110 disabled:opacity-60"
            >
              {paying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Starting…
                </>
              ) : (
                "Pay with SSLCOMMERZ"
              )}
            </button>
          </div>
        </div>

        <h2 className="mb-3 text-lg font-bold text-foreground">
          Recent activity
        </h2>
        {loading ? (
          <div className="text-fg-subtle">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-accent/40 bg-card/70 p-6 text-fg-muted shadow-inner backdrop-blur-sm">
            No payments yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {payments.map((p) => (
              <li
                key={p._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card/75 px-4 py-3 text-sm shadow-md ring-1 ring-foreground/5 backdrop-blur-sm"
              >
                <div>
                  <span className="font-mono text-foreground">{p.tranId}</span>
                  <span className="mx-2 text-fg-subtle">·</span>
                  <span className="font-semibold text-foreground">
                    ৳{p.amount.toLocaleString("en-BD")}
                  </span>
                  <span className="mx-2 text-fg-subtle">·</span>
                  <span
                    className={
                      p.status === "completed"
                        ? "text-green-700"
                        : p.status === "pending"
                          ? "text-amber-700"
                          : "text-red-700"
                    }
                  >
                    {p.status}
                  </span>
                </div>
                <time className="text-fg-subtle" dateTime={p.createdAt}>
                  {new Date(p.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-center text-sm text-fg-subtle">
          <Link
            href="/my-jobs"
            className="font-medium text-accent hover:underline"
          >
            Back to My Jobs
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-fg-muted">
          Loading…
        </div>
      }
    >
      <PaymentsInner />
    </Suspense>
  );
}
