"use client";

import { apiClient, getAuthToken, setUser } from "@/utils/api";
import { Download, FileText, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function ProfileResumePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [resumeUrl, setResumeUrl] = useState("");

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await apiClient.getProfile();
      if (cancelled) return;
      if (!res.success || !res.data) {
        toast.error(res.message || "Could not load profile");
        router.replace("/login");
        return;
      }
      if (res.data.role !== "jobseeker") {
        toast.error("Résumé uploads are for job seeker accounts.");
        router.replace("/profile");
        return;
      }
      setResumeUrl(res.data.profile?.resumeUrl ?? "");
      setUser(res.data);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const onUpload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await apiClient.uploadProfileResume(file);
      if (!res.success || !res.data) {
        toast.error(res.message || "Upload failed");
        return;
      }
      setResumeUrl(res.data.resumeUrl);
      setUser(res.data.user);
      toast.success("Résumé updated");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10">
      <div className="max-w-xl mx-auto px-4">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-foreground">Résumé</h1>
          <Link href="/profile" className="text-sm text-accent hover:text-link">
            ← Back to profile
          </Link>
        </div>

        <div className="bg-card shadow rounded-lg p-6 space-y-6">
          <p className="text-fg-muted text-sm">
            Upload a PDF or Word document. Employers see this when you apply or when you
            share your profile. Replacing a file keeps your profile sections unchanged.
          </p>

          {resumeUrl ? (
            <div className="rounded-md border border-border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-3">
                <FileText className="h-10 w-10 text-accent shrink-0" />
                <div>
                  <p className="font-medium text-foreground">Current résumé</p>
                  <p className="text-xs text-fg-subtle break-all mt-1">{resumeUrl}</p>
                </div>
              </div>
              <a
                href={resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-foreground text-white text-sm font-medium rounded-md hover:opacity-90"
              >
                <Download className="h-4 w-4" />
                Open / download
              </a>
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
              You have not uploaded a résumé yet. Adding one improves your profile strength.
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-fg-muted mb-2">
              {resumeUrl ? "Replace file" : "Upload file"}
            </p>
            <label
              className={`inline-flex items-center gap-2 px-4 py-2 border border-border-strong rounded-md ${
                uploading ? "opacity-50 pointer-events-none" : "cursor-pointer hover:bg-card-muted"
              }`}
            >
              <Upload className="h-4 w-4" />
              <span className="text-sm">
                {uploading ? "Uploading…" : "Choose PDF / DOC / DOCX"}
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf"
                className="hidden"
                disabled={uploading}
                onChange={(e) => void onUpload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
