"use client";

import { FilterSelect } from "@/components/FilterSelect";
import { SkillTagPicker } from "@/components/SkillTagPicker";
import { SuggestedBulletsPicker } from "@/components/SuggestedBulletsPicker";
import { JOB_BENEFIT_SUGGESTIONS } from "@/lib/job-benefit-suggestions";
import { JOB_REQUIREMENT_SUGGESTIONS } from "@/lib/job-requirement-suggestions";
import { trackActivity } from "@/lib/analytics";
import { apiClient } from "@/utils/api";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import {
  AlertCircle,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileText,
  ListChecks,
  MapPin,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { FieldErrors } from "react-hook-form";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import toast from "react-hot-toast";

interface JobFormData {
  title: string;
  company: string;
  location: string;
  type: "full-time" | "part-time" | "contract" | "internship";
  salary: {
    min: number;
    max: number;
    currency: string;
  };
  description: string;
  skills: string[];
  requirements: { value: string }[];
  benefits: { value: string }[];
}

const STEPS = [
  { id: 0, label: "Basics", description: "Role and workplace" },
  { id: 1, label: "Role & pay", description: "Scope and compensation" },
  { id: 2, label: "Finalize", description: "Optional extras & publish" },
] as const;

/** Only the last step may submit the form (avoids Enter key firing create API on earlier steps). */
const LAST_STEP_INDEX = STEPS.length - 1;

const MAX_REQUIREMENT_LINES = 20;
const MAX_BENEFIT_LINES = 15;

export default function PostJobPage() {
  const { ready } = useAuthGuard({ roles: ["employer"] });
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(0);
  const stepRef = useRef(step);
  stepRef.current = step;
  const router = useRouter();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    trigger,
    formState: { errors },
    reset,
  } = useForm<JobFormData>({
    shouldUnregister: false,
    defaultValues: {
      title: "",
      company: "",
      location: "",
      type: "full-time",
      salary: {
        min: 0,
        max: 0,
        currency: "USD",
      },
      description: "",
      skills: [],
      requirements: [],
      benefits: [],
    },
  });

  const {
    fields: requirementFields,
    append: appendRequirement,
    remove: removeRequirement,
  } = useFieldArray({
    control,
    name: "requirements",
  });

  const {
    fields: benefitFields,
    append: appendBenefit,
    remove: removeBenefit,
  } = useFieldArray({
    control,
    name: "benefits",
  });

  const selectedType = watch("type");
  const selectedCurrency = watch("salary.currency");
  const watchedRequirements = watch("requirements");
  const watchedBenefits = watch("benefits");
  const requirementLines = (watchedRequirements ?? []).map((r) => r.value);
  const benefitLines = (watchedBenefits ?? []).map((b) => b.value);

  const goNext = async () => {
    if (step === 0) {
      const ok = await trigger(["title", "company", "location", "type"]);
      if (ok) setStep(1);
      return;
    }
    if (step === 1) {
      const ok = await trigger([
        "salary.min",
        "salary.max",
        "salary.currency",
        "description",
        "skills",
      ]);
      if (ok) setStep(LAST_STEP_INDEX);
    }
  };

  const goBack = () => setStep((s) => Math.max(0, s - 1));

  const onInvalid = (errs: FieldErrors<JobFormData>) => {
    if (errs.title || errs.company || errs.location || errs.type) {
      setStep(0);
      toast.error("Basics need attention — including location — before you can publish.");
      return;
    }
    if (
      errs.salary?.min ||
      errs.salary?.max ||
      errs.salary?.currency ||
      errs.description ||
      errs.skills
    ) {
      setStep(1);
      toast.error("Role & pay needs attention before you can publish.");
      return;
    }
    toast.error("Please fix the highlighted fields.");
  };

  const onSubmit = async (data: JobFormData) => {
    if (stepRef.current !== LAST_STEP_INDEX) {
      return;
    }
    setIsLoading(true);
    try {
      const transformedData = {
        ...data,
        requirements: data.requirements.map((req) => req.value).filter(Boolean),
        benefits: data.benefits.map((ben) => ben.value).filter(Boolean),
        skills: data.skills,
      };

      const response = await apiClient.createJob(transformedData);
      if (!response.success) {
        toast.error(response.message || "Failed to post job. Please try again.");
        return;
      }

      toast.success("Job posted successfully!");
      trackActivity("post_job_submit", {
        type: data.type,
        hasBenefits: transformedData.benefits.length > 0,
        hasRequirements: transformedData.requirements.length > 0,
        skillCount: transformedData.skills.length,
      });
      reset();
      router.push("/my-jobs");
    } catch {
      toast.error("Failed to post job. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const cardClass =
    "rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md";

  return !ready ? (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <span className="text-sm text-fg-muted">Checking access…</span>
    </div>
  ) : (
    <div className="min-h-screen py-8">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Post a job</h1>
          <p className="mt-2 text-fg-muted">
            A short guided flow — add skills from suggestions or type your own.
          </p>
        </div>

        {/* Step indicator */}
        <nav aria-label="Progress" className="mb-8">
          <ol className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {STEPS.map((s, idx) => {
              const active = step === s.id;
              const done = step > s.id;
              return (
                <li key={s.id} className="flex flex-1 items-start gap-3 sm:block sm:text-center">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors sm:mx-auto ${
                      active
                        ? "bg-accent text-white"
                        : done
                          ? "bg-success/15 text-success"
                          : "border border-border bg-card-muted text-fg-subtle"
                    }`}
                  >
                    {done ? "✓" : idx + 1}
                  </div>
                  <div className="min-w-0 sm:mt-2">
                    <p
                      className={`text-sm font-semibold ${active ? "text-foreground" : "text-fg-muted"}`}
                    >
                      {s.label}
                    </p>
                    <p className="hidden text-xs text-fg-subtle sm:block">{s.description}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="space-y-8" role="group" aria-label="Post a job wizard">
          {step === 0 && (
            <div className={cardClass}>
              <h2 className="mb-6 flex items-center text-xl font-semibold text-foreground">
                <Briefcase className="mr-2 h-5 w-5 text-accent" />
                Basic information
              </h2>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor="title" className="mb-2 block text-sm font-medium text-fg-muted">
                    Job title *
                  </label>
                  <input
                    {...register("title", { required: "Job title is required" })}
                    type="text"
                    id="title"
                    placeholder="e.g. Senior Frontend Developer"
                    className={`w-full rounded-lg border bg-background px-3 py-2.5 text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 ${
                      errors.title ? "border-destructive" : "border-border-strong"
                    }`}
                  />
                  {errors.title && (
                    <div className="mt-1 flex items-center text-sm text-destructive">
                      <AlertCircle className="mr-1 h-4 w-4 shrink-0" />
                      {errors.title.message}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <label htmlFor="company" className="mb-2 block text-sm font-medium text-fg-muted">
                    Company *
                  </label>
                  <input
                    {...register("company", { required: "Company name is required" })}
                    type="text"
                    id="company"
                    placeholder="Company name"
                    className={`w-full rounded-lg border bg-background px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${
                      errors.company ? "border-destructive" : "border-border-strong"
                    }`}
                  />
                  {errors.company && (
                    <div className="mt-1 flex items-center text-sm text-destructive">
                      <AlertCircle className="mr-1 h-4 w-4" />
                      {errors.company.message}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <label htmlFor="post-job-work-location" className="mb-2 block text-sm font-medium text-fg-muted">
                    Location *
                  </label>
                  <div
                    className={`flex min-w-0 items-center gap-2 rounded-lg border bg-background px-3 py-2.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 ${
                      errors.location ? "border-destructive ring-2 ring-destructive/25" : "border-border-strong"
                    }`}
                  >
                    <MapPin
                      className="h-4 w-4 shrink-0 text-fg-subtle pointer-events-none"
                      aria-hidden
                    />
                    <input
                      {...register("location", { required: "Location is required" })}
                      type="text"
                      id="post-job-work-location"
                      autoComplete="street-address"
                      placeholder="City, region, or Remote"
                      className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-foreground outline-none ring-0 placeholder:text-fg-subtle focus:ring-0"
                    />
                  </div>
                  {errors.location && (
                    <div className="mt-1 flex items-center text-sm text-destructive">
                      <AlertCircle className="mr-1 h-4 w-4" />
                      {errors.location.message}
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="type" className="mb-2 block text-sm font-medium text-fg-muted">
                    Job type *
                  </label>
                  <FilterSelect
                    id="type"
                    value={selectedType}
                    onChange={(value) =>
                      setValue("type", value as JobFormData["type"], {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    options={[
                      { value: "full-time", label: "Full time" },
                      { value: "part-time", label: "Part time" },
                      { value: "contract", label: "Contract" },
                      { value: "internship", label: "Internship" },
                    ]}
                    className={errors.type ? "rounded-xl ring-2 ring-destructive/40" : ""}
                  />
                  <input type="hidden" {...register("type", { required: "Job type is required" })} />
                  {errors.type && (
                    <div className="mt-1 flex items-center text-sm text-destructive">
                      <AlertCircle className="mr-1 h-4 w-4" />
                      {errors.type.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <>
              <div className={cardClass}>
                <h2 className="mb-6 flex items-center text-xl font-semibold text-foreground">
                  <DollarSign className="mr-2 h-5 w-5 text-accent" />
                  Compensation
                </h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <div>
                    <label htmlFor="salaryMin" className="mb-2 block text-sm font-medium text-fg-muted">
                      Minimum (annual) *
                    </label>
                    <input
                      {...register("salary.min", {
                        required: "Minimum salary is required",
                        min: { value: 1, message: "Enter a positive amount" },
                      })}
                      type="number"
                      id="salaryMin"
                      placeholder="50000"
                      className={`w-full rounded-lg border bg-background px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${
                        errors.salary?.min ? "border-destructive" : "border-border-strong"
                      }`}
                    />
                    {errors.salary?.min && (
                      <div className="mt-1 flex items-center text-sm text-destructive">
                        <AlertCircle className="mr-1 h-4 w-4" />
                        {errors.salary.min.message}
                      </div>
                    )}
                  </div>
                  <div>
                    <label htmlFor="salaryMax" className="mb-2 block text-sm font-medium text-fg-muted">
                      Maximum (annual) *
                    </label>
                    <input
                      {...register("salary.max", {
                        required: "Maximum salary is required",
                        min: { value: 1, message: "Enter a positive amount" },
                      })}
                      type="number"
                      id="salaryMax"
                      placeholder="80000"
                      className={`w-full rounded-lg border bg-background px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${
                        errors.salary?.max ? "border-destructive" : "border-border-strong"
                      }`}
                    />
                    {errors.salary?.max && (
                      <div className="mt-1 flex items-center text-sm text-destructive">
                        <AlertCircle className="mr-1 h-4 w-4" />
                        {errors.salary.max.message}
                      </div>
                    )}
                  </div>
                  <div>
                    <label htmlFor="currency" className="mb-2 block text-sm font-medium text-fg-muted">
                      Currency *
                    </label>
                    <FilterSelect
                      id="currency"
                      value={selectedCurrency}
                      onChange={(value) =>
                        setValue("salary.currency", value, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                      options={[
                        { value: "USD", label: "USD ($)" },
                        { value: "EUR", label: "EUR (€)" },
                        { value: "GBP", label: "GBP (£)" },
                        { value: "CAD", label: "CAD (C$)" },
                        { value: "AUD", label: "AUD (A$)" },
                      ]}
                      className={
                        errors.salary?.currency ? "rounded-xl ring-2 ring-destructive/40" : ""
                      }
                    />
                    <input
                      type="hidden"
                      {...register("salary.currency", { required: "Currency is required" })}
                    />
                    {errors.salary?.currency && (
                      <div className="mt-1 flex items-center text-sm text-destructive">
                        <AlertCircle className="mr-1 h-4 w-4" />
                        {errors.salary.currency.message}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className={cardClass}>
                <h2 className="mb-6 flex items-center text-xl font-semibold text-foreground">
                  <FileText className="mr-2 h-5 w-5 text-accent" />
                  Description & skills
                </h2>
                <div className="space-y-6">
                  <div>
                    <label htmlFor="description" className="mb-2 block text-sm font-medium text-fg-muted">
                      Role description *
                    </label>
                    <textarea
                      {...register("description", {
                        required: "Description is required",
                        minLength: {
                          value: 20,
                          message: "Use at least 20 characters (add responsibilities and context)",
                        },
                      })}
                      id="description"
                      rows={7}
                      placeholder="Responsibilities, team, tools, and what success looks like…"
                      className={`w-full resize-y rounded-lg border bg-background px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 ${
                        errors.description ? "border-destructive" : "border-border-strong"
                      }`}
                    />
                    {errors.description && (
                      <div className="mt-1 flex items-center text-sm text-destructive">
                        <AlertCircle className="mr-1 h-4 w-4 shrink-0" />
                        {errors.description.message}
                      </div>
                    )}
                    <p className="mt-1 text-xs text-fg-subtle">Minimum 20 characters to match posting rules.</p>
                  </div>

                  <div className="rounded-xl border border-border bg-card-muted/30 p-4">
                    <div className="mb-2 flex items-center gap-2 text-foreground">
                      <Sparkles className="h-4 w-4 text-accent" />
                      <span className="text-sm font-semibold">Skills</span>
                    </div>
                    <Controller
                      name="skills"
                      control={control}
                      rules={{
                        validate: (v) =>
                          Array.isArray(v) && v.length >= 1 ? true : "Add at least one skill",
                      }}
                      render={({ field }) => (
                        <SkillTagPicker
                          id="job-skills"
                          value={field.value}
                          onChange={field.onChange}
                          label=""
                          error={errors.skills ? String(errors.skills.message) : undefined}
                        />
                      )}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {step === LAST_STEP_INDEX && (
            <>
              <div className={cardClass}>
                <h2 className="mb-2 flex items-center text-xl font-semibold text-foreground">
                  <ListChecks className="mr-2 h-5 w-5 text-accent" />
                  Requirements
                </h2>
                <p className="mb-4 text-sm text-fg-subtle">Optional bullet points — leave empty if the description covers it.</p>
                <SuggestedBulletsPicker
                  idPrefix="job-requirements"
                  suggestions={JOB_REQUIREMENT_SUGGESTIONS}
                  values={requirementLines}
                  maxItems={MAX_REQUIREMENT_LINES}
                  onAdd={(line) => appendRequirement({ value: line })}
                  addPlaceholder="e.g. Experience leading small teams — Enter or Add"
                  hint="Suggestions add a line instantly; you can still edit or remove rows below."
                />
                <div className="mt-4 space-y-3">
                  {requirementFields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <input
                        {...register(`requirements.${index}.value` as const)}
                        type="text"
                        placeholder="e.g. 3+ years with React"
                        className="flex-1 rounded-lg border border-border-strong bg-background px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                      <button
                        type="button"
                        onClick={() => removeRequirement(index)}
                        className="rounded-lg p-2 text-destructive hover:bg-destructive-muted"
                        aria-label="Remove requirement"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={requirementFields.length >= MAX_REQUIREMENT_LINES}
                    onClick={() => appendRequirement({ value: "" })}
                    className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add empty row (manual)
                  </button>
                </div>
              </div>

              <div className={cardClass}>
                <h2 className="mb-2 flex items-center text-xl font-semibold text-foreground">
                  <Sparkles className="mr-2 h-5 w-5 text-accent" />
                  Benefits & perks
                </h2>
                <p className="mb-4 text-sm text-fg-subtle">Optional — helps candidates compare offers.</p>
                <SuggestedBulletsPicker
                  idPrefix="job-benefits"
                  suggestions={JOB_BENEFIT_SUGGESTIONS}
                  values={benefitLines}
                  maxItems={MAX_BENEFIT_LINES}
                  onAdd={(line) => appendBenefit({ value: line })}
                  addPlaceholder="e.g. Four-day summer weeks — Enter or Add"
                  hint="Pick common perks or type anything specific to your company."
                />
                <div className="mt-4 space-y-3">
                  {benefitFields.map((field, index) => (
                    <div key={field.id} className="flex items-center gap-2">
                      <input
                        {...register(`benefits.${index}.value` as const)}
                        type="text"
                        placeholder="e.g. Health insurance, remote-first, learning budget"
                        className="flex-1 rounded-lg border border-border-strong bg-background px-3 py-2.5 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                      />
                      <button
                        type="button"
                        onClick={() => removeBenefit(index)}
                        className="rounded-lg p-2 text-destructive hover:bg-destructive-muted"
                        aria-label="Remove benefit"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={benefitFields.length >= MAX_BENEFIT_LINES}
                    onClick={() => appendBenefit({ value: "" })}
                    className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-card-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add empty row (manual)
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => (step === 0 ? router.back() : goBack())}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium text-fg-muted transition-colors hover:bg-card-muted"
            >
              {step === 0 ? (
                "Cancel"
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </>
              )}
            </button>

            <div className="flex flex-col gap-3 sm:flex-row">
              {step < LAST_STEP_INDEX ? (
                <button
                  type="button"
                  onClick={() => void goNext()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    if (stepRef.current !== LAST_STEP_INDEX) return;
                    void handleSubmit(onSubmit, onInvalid)();
                  }}
                  className="inline-flex items-center justify-center rounded-xl bg-accent px-8 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Posting…
                    </span>
                  ) : (
                    "Publish job"
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
