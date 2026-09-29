"use client";

import { apiClient } from "@/utils/api";
import { trackActivity } from "@/lib/analytics";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import toast from "react-hot-toast";

export default function ApplyForJobPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [coverLetter, setCoverLetter] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resume) {
      toast.error("Please upload your resume");
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("resume", resume);
      formData.append("coverLetter", coverLetter);

      const response = await apiClient.applyForJob(params.id, formData);
      if (!response.success) {
        toast.error(response.message || "Failed to submit application");
        return;
      }

      toast.success("Application submitted successfully");
      trackActivity("apply_submit", {
        jobId: params.id,
        hasCoverLetter: coverLetter.trim().length > 0,
      });
      router.push("/applications");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <form onSubmit={onSubmit} className="bg-card shadow rounded-lg p-6 space-y-5">
          <h1 className="text-2xl font-bold text-foreground">Apply for this Job</h1>

          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">
              Resume *
            </label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setResume(e.target.files?.[0] || null)}
              className="block w-full border border-border-strong rounded-md p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">
              Cover Letter (optional)
            </label>
            <textarea
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              rows={6}
              className="w-full border border-border-strong rounded-md p-3"
              placeholder="Write a short note to the employer..."
            />
          </div>

          <div className="flex gap-3">
            <Link
              href={`/jobs/${params.id}`}
              className="px-4 py-2 border border-border-strong rounded-md text-fg-muted hover:bg-card-muted"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-gradient-to-r from-accent to-accent-end px-4 py-2 text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              {loading ? "Submitting..." : "Submit Application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
