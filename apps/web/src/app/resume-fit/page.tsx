"use client";

import { Job, ResumeFitAnalysis, ResumeFitRewrite } from "@/types";
import { apiClient, getUser } from "@/utils/api";
import {
  AlertCircle,
  ClipboardList,
  Languages,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

type LangTab = "en" | "bn" | "both";

function ListBlock({
  title,
  items,
  lang,
}: {
  title: string;
  items: { en: string[]; bn: string[] };
  lang: LangTab;
}) {
  const showEn = lang !== "bn";
  const showBn = lang !== "en";
  return (
    <div className="rounded-2xl border border-border/70 bg-card/75 p-5 shadow-md ring-1 ring-foreground/5 backdrop-blur-md">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-fg-subtle">{title}</h3>
      {showEn && items.en.length > 0 && (
        <ul className="mb-3 list-inside list-disc space-y-1.5 text-sm text-foreground">
          {items.en.map((s, i) => (
            <li key={`en-${i}`}>{s}</li>
          ))}
        </ul>
      )}
      {showBn && items.bn.length > 0 && (
        <ul className="list-inside list-disc space-y-1.5 text-sm text-foreground">
          {items.bn.map((s, i) => (
            <li key={`bn-${i}`} lang="bn">
              {s}
            </li>
          ))}
        </ul>
      )}
      {items.en.length === 0 && items.bn.length === 0 && (
        <p className="text-sm text-fg-subtle">No items listed.</p>
      )}
    </div>
  );
}

function TextBlock({
  title,
  text,
  lang,
}: {
  title: string;
  text: { en: string; bn: string };
  lang: LangTab;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/75 p-5 shadow-md ring-1 ring-foreground/5 backdrop-blur-md">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg-subtle">{title}</h3>
      {(lang === "en" || lang === "both") && text.en && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text.en}</p>
      )}
      {lang === "both" && text.en && text.bn && <hr className="my-4 border-border" />}
      {(lang === "bn" || lang === "both") && text.bn && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground" lang="bn">
          {text.bn}
        </p>
      )}
    </div>
  );
}

export default function ResumeFitPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobId, setJobId] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [analysis, setAnalysis] = useState<ResumeFitAnalysis | null>(null);
  const [rewrite, setRewrite] = useState<ResumeFitRewrite | null>(null);
  const [langTab, setLangTab] = useState<LangTab>("both");

  useEffect(() => {
    if (!getUser()) {
      toast.error("Sign in to use the resume fit analyzer.");
      router.replace("/login");
    }
  }, [router]);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const res = await apiClient.getJobs({ status: "active", limit: 40, sort: "recent" });
      if (!res.success) {
        toast.error(res.message || "Could not load jobs");
        setJobs([]);
        return;
      }
      setJobs(res.data || []);
    } finally {
      setJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const effectiveResumeText = () => resumeText.trim();

  const handleAnalyze = async () => {
    const text = effectiveResumeText();
    if (!resumeFile && text.length < 80) {
      toast.error("Paste your CV (80+ characters) or upload a PDF/TXT file.");
      return;
    }
    if (!jobId.trim() && jobDescription.trim().length < 60) {
      toast.error("Select a job or paste a job description (60+ characters).");
      return;
    }

    setAnalyzing(true);
    setAnalysis(null);
    setRewrite(null);
    try {
      const fd = new FormData();
      if (resumeFile) {
        fd.append("resume", resumeFile);
      }
      if (text.length >= 80) {
        fd.append("resumeText", text);
      }
      if (jobId.trim()) {
        fd.append("jobId", jobId.trim());
      }
      if (jobDescription.trim()) {
        fd.append("jobDescription", jobDescription.trim());
      }

      const res = await apiClient.analyzeResumeFit(fd);
      if (!res.success || !res.data) {
        toast.error(res.message || "Analysis failed");
        return;
      }
      setAnalysis(res.data);
      const echoed = res.meta?.["resumeTextUsed"];
      if (typeof echoed === "string" && echoed.length > 0) {
        setResumeText(echoed);
      }
      toast.success("Analysis ready");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRewrite = async () => {
    const text = effectiveResumeText();
    if (text.length < 80) {
      toast.error("Keep your CV text in the box (80+ characters) to run a rewrite.");
      return;
    }
    if (!jobId.trim() && jobDescription.trim().length < 60) {
      toast.error("Select a job or keep a pasted job description for the rewrite.");
      return;
    }

    setRewriting(true);
    try {
      const res = await apiClient.rewriteResumeFit({
        resumeText: text,
        jobId: jobId.trim() || undefined,
        jobDescription: jobDescription.trim() || undefined,
      });
      if (!res.success || !res.data) {
        toast.error(res.message || "Rewrite failed");
        return;
      }
      setRewrite(res.data);
      toast.success("CV rewrite ready — review both languages.");
    } finally {
      setRewriting(false);
    }
  };

  return (
    <div className="min-h-screen py-10">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-card/70 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-link shadow-sm backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Local market AI
            </p>
            <h1 className="bg-gradient-to-r from-foreground via-accent to-foreground dark:via-accent-end bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl">
              Resume + job fit analyzer
            </h1>
            <p className="mt-2 max-w-2xl text-fg-muted">
              Upload or paste your CV, attach a real job post, and get match scoring, missing
              skills, and plain-language reasons hiring teams might pass—plus optional bilingual
              CV rewrite for Bangladesh roles.
            </p>
          </div>
          <Link
            href="/jobs"
            className="shrink-0 self-start rounded-xl border border-border bg-card/80 px-4 py-2 text-sm font-semibold text-fg-muted shadow-sm backdrop-blur-md transition-colors hover:border-accent/30"
          >
            Browse jobs
          </Link>
        </div>

        <div className="mb-6 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 backdrop-blur-sm">
          <div className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              AI suggestions are estimates—not a guarantee of interview or rejection. Do not share
              confidential employer data you are not allowed to use.
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-accent/40 bg-accent-muted/70 px-4 py-3 text-sm text-foreground backdrop-blur-sm">
          <p className="font-semibold text-foreground">No OpenAI key?</p>
          <p className="mt-1 text-foreground/90">
            Use a{" "}
            <a
              href="https://console.groq.com/keys"
              className="font-medium underline decoration-accent underline-offset-2 hover:text-link"
              target="_blank"
              rel="noreferrer"
            >
              free Groq API key
            </a>{" "}
            on the backend: set{" "}
            <code className="rounded bg-card/80 px-1 py-0.5 text-xs">GROQ_API_KEY</code> and{" "}
            <code className="rounded bg-card/80 px-1 py-0.5 text-xs">
              OPENAI_BASE_URL=https://api.groq.com/openai/v1
            </code>{" "}
            in <code className="rounded bg-card/80 px-1 text-xs">job-platform/.env</code>, then
            restart the API. OpenRouter and other OpenAI-compatible hosts also work—see{" "}
            <code className="rounded bg-card/80 px-1 text-xs">.env.example</code>.
          </p>
        </div>

        <div className="space-y-6 rounded-3xl border border-border/70 bg-card/80 p-6 shadow-xl shadow-foreground/5 ring-1 ring-foreground/5 backdrop-blur-xl sm:p-8">
          <div>
            <label className="mb-2 block text-sm font-semibold text-foreground">
              Your CV (paste text)
            </label>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              rows={10}
              placeholder="Paste full CV text here (recommended for best results). Minimum ~80 characters."
              className="w-full rounded-2xl border border-border bg-card/90 px-4 py-3 text-sm text-foreground shadow-inner shadow-foreground/5 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Upload className="h-4 w-4 text-accent" aria-hidden />
              Or upload PDF / TXT (optional)
            </label>
            <input
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-fg-muted file:mr-4 file:rounded-xl file:border-0 file:bg-accent-muted file:px-4 file:py-2 file:text-sm file:font-semibold file:text-link hover:file:bg-accent-muted"
            />
            {resumeFile && (
              <p className="mt-1 text-xs text-fg-subtle">Selected: {resumeFile.name}</p>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">
                Job from platform
              </label>
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                disabled={jobsLoading}
                className="w-full rounded-xl border border-border bg-card/90 px-3 py-2.5 text-sm text-foreground shadow-inner focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              >
                <option value="">— Optional: pick a live job —</option>
                {jobs.map((j) => (
                  <option key={j._id} value={j._id}>
                    {j.title} · {j.company}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-foreground">
                Or paste job description
              </label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={4}
                placeholder="Paste the job post (title, requirements, responsibilities). ~60+ characters if not using a job from the list."
                className="w-full rounded-xl border border-border bg-card/90 px-3 py-2 text-sm text-foreground shadow-inner focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleAnalyze()}
              disabled={analyzing}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-accent-end px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 transition-all hover:brightness-110 disabled:opacity-60"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Analyzing…
                </>
              ) : (
                <>
                  <ClipboardList className="h-4 w-4" aria-hidden />
                  Run ATS-style fit check
                </>
              )}
            </button>
          </div>
        </div>

        {analysis && (
          <div className="mt-10 space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-xl font-bold text-foreground">Results</h2>
              <div className="inline-flex rounded-xl border border-border bg-card/80 p-1 shadow-sm backdrop-blur-md">
                {(["both", "en", "bn"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setLangTab(tab)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                      langTab === tab
                        ? "bg-accent text-white shadow-sm"
                        : "text-fg-muted hover:bg-card-muted"
                    }`}
                  >
                    <Languages className="h-3.5 w-3.5" aria-hidden />
                    {tab === "both" ? "Both" : tab === "en" ? "English" : "Bangla"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-accent/45 bg-gradient-to-br from-accent to-accent-end p-5 text-white shadow-lg">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/90">
                  Match score
                </p>
                <p className="mt-1 text-4xl font-extrabold">{analysis.matchPercent}%</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-md backdrop-blur-md sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  ATS-style breakdown
                </p>
                <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{analysis.atsScore.overall}</p>
                    <p className="text-xs text-fg-subtle">Overall</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {analysis.atsScore.keywordAlignment}
                    </p>
                    <p className="text-xs text-fg-subtle">Keywords</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {analysis.atsScore.structureClarity}
                    </p>
                    <p className="text-xs text-fg-subtle">Structure</p>
                  </div>
                </div>
              </div>
            </div>

            <TextBlock title="Summary" text={analysis.summary} lang={langTab} />
            <TextBlock title="Role fit (why you match or not)" text={analysis.atsScore.roleFitSummary} lang={langTab} />

            <div className="grid gap-4 md:grid-cols-2">
              <ListBlock title="Missing skills / gaps" items={analysis.missingSkills} lang={langTab} />
              <ListBlock title="Suggestions to improve" items={analysis.suggestions} lang={langTab} />
            </div>
            <ListBlock
              title="Why you might be passed over (honest view)"
              items={analysis.rejectionLikelyReasons}
              lang={langTab}
            />

            <div className="rounded-2xl border border-violet-200/60 bg-violet-50/50 p-5 backdrop-blur-sm">
              <h3 className="mb-2 text-sm font-bold text-violet-900">Improve my CV (bilingual rewrite)</h3>
              <p className="mb-4 text-sm text-violet-900/80">
                Uses the same CV text and job context. Outputs full English and Bangla drafts plus
                a short list of what changed.
              </p>
              <button
                type="button"
                onClick={() => void handleRewrite()}
                disabled={rewriting}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-colors hover:bg-violet-800 disabled:opacity-60"
              >
                {rewriting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Rewriting…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden />
                    Improve my CV
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {rewrite && (
          <div className="mt-10 space-y-6">
            <h2 className="text-xl font-bold text-foreground">CV rewrite</h2>
            <ListBlock title="What we changed" items={rewrite.changeHighlights} lang={langTab} />
            <TextBlock title="Improved CV (edit before sending)" text={rewrite.improvedCv} lang={langTab} />
          </div>
        )}
      </div>
    </div>
  );
}
