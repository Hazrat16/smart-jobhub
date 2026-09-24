"use client";

import { useAuthGuard } from "@/hooks/useAuthGuard";
import { Company, CompanySize, COMPANY_SIZES } from "@/types";
import { apiClient } from "@/utils/api";
import { Building2, ExternalLink, Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

type CreateFormValues = {
  name: string;
  description: string;
  industry: string;
  size?: string;
  website?: string;
  location?: string;
};

type EditFormValues = {
  description: string;
  industry: string;
  size?: string;
  website?: string;
  location?: string;
};

export default function CompanyPage() {
  const { ready } = useAuthGuard({ roles: ["employer"] });
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [saving, setSaving] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  const createForm = useForm<CreateFormValues>();
  const editForm = useForm<EditFormValues>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.getMyCompany();
      if (res.success && res.data) {
        setCompany(res.data);
        editForm.reset({
          description: res.data.description,
          industry: res.data.industry,
          size: res.data.size,
          website: res.data.website,
          location: res.data.location,
        });
      } else {
        setCompany(null);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  const onCreate = async (values: CreateFormValues) => {
    setSaving(true);
    try {
      const res = await apiClient.createCompany(values);
      if (!res.success || !res.data) {
        toast.error(res.message || "Could not create company");
        return;
      }
      setCompany(res.data);
      toast.success("Company created");
    } finally {
      setSaving(false);
    }
  };

  const onUpdate = async (values: EditFormValues) => {
    if (!company) return;
    setSaving(true);
    try {
      const res = await apiClient.updateCompany(company._id, {
        ...values,
        size: (values.size || undefined) as CompanySize | undefined,
      });
      if (!res.success || !res.data) {
        toast.error(res.message || "Could not update company");
        return;
      }
      setCompany(res.data);
      toast.success("Company updated");
    } finally {
      setSaving(false);
    }
  };

  const onAddMember = async () => {
    if (!company || !memberEmail.trim()) return;
    setAddingMember(true);
    try {
      const res = await apiClient.addCompanyMember(company._id, memberEmail.trim());
      if (!res.success || !res.data) {
        toast.error(res.message || "Could not add member");
        return;
      }
      setCompany(res.data);
      setMemberEmail("");
      toast.success("Member added");
    } finally {
      setAddingMember(false);
    }
  };

  if (!ready || loading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-border-strong bg-background px-3 py-2.5 text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20";
  const labelClass = "mb-2 block text-sm font-medium text-fg-muted";

  if (!company) {
    return (
      <div className="min-h-[calc(100vh-4rem)] py-10">
        <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <Building2 className="h-7 w-7 text-accent" aria-hidden />
              Create your company
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              A company page lists all your open roles in one place and lets
              teammates share job postings under the same account.
            </p>
          </div>

          <form
            onSubmit={createForm.handleSubmit(onCreate)}
            className="space-y-5 rounded-2xl border border-border bg-card p-6"
          >
            <div>
              <label htmlFor="name" className={labelClass}>Company name *</label>
              <input
                id="name"
                className={inputClass}
                placeholder="Acme Robotics"
                {...createForm.register("name", { required: true, minLength: 2 })}
              />
            </div>
            <div>
              <label htmlFor="industry" className={labelClass}>Industry *</label>
              <input
                id="industry"
                className={inputClass}
                placeholder="Robotics, Fintech, Healthcare…"
                {...createForm.register("industry", { required: true, minLength: 2 })}
              />
            </div>
            <div>
              <label htmlFor="description" className={labelClass}>Description *</label>
              <textarea
                id="description"
                rows={4}
                className={inputClass}
                placeholder="What does your company do? (min 20 characters)"
                {...createForm.register("description", { required: true, minLength: 20 })}
              />
            </div>
            <div>
              <label htmlFor="size" className={labelClass}>Company size</label>
              <select id="size" className={inputClass} {...createForm.register("size")}>
                <option value="">Select…</option>
                {COMPANY_SIZES.map((s) => (
                  <option key={s} value={s}>{s} employees</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="website" className={labelClass}>Website</label>
              <input id="website" className={inputClass} placeholder="https://…" {...createForm.register("website")} />
            </div>
            <div>
              <label htmlFor="location" className={labelClass}>Location</label>
              <input id="location" className={inputClass} placeholder="Remote, Dhaka, …" {...createForm.register("location")} />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-end px-5 py-2.5 font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
            >
              {saving ? "Creating…" : "Create company"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10">
      <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              <Building2 className="h-7 w-7 text-accent" aria-hidden />
              {company.name}
            </h1>
            <p className="mt-1 text-sm text-fg-muted">
              {company.verified ? "Verified company" : "Not yet verified by an admin"}
            </p>
          </div>
          <Link
            href={`/companies/${company.slug}`}
            target="_blank"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-foreground hover:bg-card-muted"
          >
            View page
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        <form
          onSubmit={editForm.handleSubmit(onUpdate)}
          className="space-y-5 rounded-2xl border border-border bg-card p-6"
        >
          <div>
            <label htmlFor="edit-industry" className={labelClass}>Industry</label>
            <input id="edit-industry" className={inputClass} {...editForm.register("industry", { required: true, minLength: 2 })} />
          </div>
          <div>
            <label htmlFor="edit-description" className={labelClass}>Description</label>
            <textarea id="edit-description" rows={4} className={inputClass} {...editForm.register("description", { required: true, minLength: 20 })} />
          </div>
          <div>
            <label htmlFor="edit-size" className={labelClass}>Company size</label>
            <select id="edit-size" className={inputClass} {...editForm.register("size")}>
              <option value="">Select…</option>
              {COMPANY_SIZES.map((s) => (
                <option key={s} value={s}>{s} employees</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-website" className={labelClass}>Website</label>
            <input id="edit-website" className={inputClass} {...editForm.register("website")} />
          </div>
          <div>
            <label htmlFor="edit-location" className={labelClass}>Location</label>
            <input id="edit-location" className={inputClass} {...editForm.register("location")} />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-gradient-to-r from-accent to-accent-end px-5 py-2.5 font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>

        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Users className="h-5 w-5 text-accent" />
            Team ({company.members.length})
          </h2>
          <p className="mb-3 text-sm text-fg-muted">
            Add another employer account by email so they can post jobs under
            this company too. They must already have an employer account with
            no company of their own.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder="teammate@company.com"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => void onAddMember()}
              disabled={addingMember || !memberEmail.trim()}
              className="shrink-0 rounded-lg border border-border-strong px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-card-muted disabled:opacity-60"
            >
              {addingMember ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
