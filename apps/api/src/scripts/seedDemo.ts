import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import Application from "../models/applicationModel.js";
import Company from "../models/companyModel.js";
import Job from "../models/jobModel.js";
import SavedJob from "../models/savedJobModel.js";
import Session from "../models/sessionModel.js";
import User from "../models/userModel.js";

/**
 * Demo accounts for the public live demo. Safe to re-run: every run resets the
 * demo users (password, verified, not suspended), their company, their jobs,
 * applications and saved jobs, and signs them out everywhere. Visitors share
 * these logins, so a scheduled re-run undoes whatever they changed.
 *
 * Only ever touches the two demo accounts and data they own.
 */

export const DEMO_EMAILS = {
  jobseeker: "demo.jobseeker@smartjobhub.test",
  employer: "demo.employer@smartjobhub.test",
} as const;

const DEMO_COMPANY_SLUG = "demo-acme-robotics";

const DEMO_JOBS = [
  {
    title: "Senior Backend Engineer (Node.js)",
    location: "Dhaka, Bangladesh",
    type: "full-time",
    salary: { min: 150000, max: 250000, currency: "BDT" },
    skills: ["Node.js", "TypeScript", "MongoDB", "Redis"],
    description: "Own our job-matching APIs end to end: design, build, run.",
  },
  {
    title: "Frontend Engineer (Next.js)",
    location: "Remote",
    type: "full-time",
    salary: { min: 120000, max: 200000, currency: "BDT" },
    skills: ["React", "Next.js", "Tailwind CSS"],
    description: "Build the candidate and employer experience in Next.js 15.",
  },
  {
    title: "DevOps Engineer (AWS)",
    location: "Chattogram, Bangladesh",
    type: "full-time",
    salary: { min: 140000, max: 230000, currency: "BDT" },
    skills: ["AWS", "Terraform", "ECS", "GitHub Actions"],
    description: "Keep our Fargate platform fast, cheap and boring.",
  },
  {
    title: "QA Engineer",
    location: "Dhaka, Bangladesh",
    type: "contract",
    salary: { min: 80000, max: 120000, currency: "BDT" },
    skills: ["Playwright", "API testing"],
    description: "Automate end-to-end tests for web and API.",
  },
  {
    title: "Software Engineering Intern",
    location: "Sylhet, Bangladesh",
    type: "internship",
    salary: { min: 20000, max: 30000, currency: "BDT" },
    skills: ["JavaScript", "Git"],
    description: "Six months with a mentor, shipping real features.",
  },
] as const;

export type SeedResult = { jobseekerId: string; employerId: string; companyId: string; jobIds: string[] };

export async function seedDemo(password: string): Promise<SeedResult> {
  if (password.length < 10) {
    throw new Error("DEMO_PASSWORD must be at least 10 characters.");
  }
  const passwordHash = await bcrypt.hash(password, 12);

  const upsertUser = (email: string, name: string, role: string) =>
    User.findOneAndUpdate(
      { email },
      {
        $set: { name, role, password: passwordHash, isVerified: true, isSuspended: false },
        $unset: {
          deletedAt: "",
          deletedBy: "",
          suspendedAt: "",
          verificationToken: "",
          resetPasswordToken: "",
          resetPasswordExpires: "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).orFail();

  const jobseeker = await upsertUser(DEMO_EMAILS.jobseeker, "Demo Jobseeker", "jobseeker");
  const employer = await upsertUser(DEMO_EMAILS.employer, "Demo Employer", "employer");

  const company = await Company.findOneAndUpdate(
    { slug: DEMO_COMPANY_SLUG },
    {
      $set: {
        name: "Acme Robotics (demo)",
        description: "A demo company. Everything here resets regularly.",
        industry: "Robotics",
        size: "51-200",
        location: "Dhaka, Bangladesh",
        createdBy: employer._id,
        members: [employer._id],
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).orFail();

  await User.updateOne({ _id: employer._id }, { $set: { companyId: company._id } });

  // Reset everything the demo users own, then recreate the sample jobs.
  const oldJobIds = (await Job.find({ employer: employer._id }, { _id: 1 })).map((j) => j._id);
  await Application.deleteMany({ $or: [{ applicant: jobseeker._id }, { job: { $in: oldJobIds } }] });
  await SavedJob.deleteMany({ $or: [{ userId: jobseeker._id }, { jobId: { $in: oldJobIds } }] });
  await Job.deleteMany({ employer: employer._id });
  await Session.deleteMany({ userId: { $in: [jobseeker._id, employer._id] } });

  const jobs = await Job.insertMany(
    DEMO_JOBS.map((j) => ({
      ...j,
      skills: [...j.skills],
      company: company.name,
      companyId: company._id,
      employer: employer._id,
      status: "active",
    })),
  );

  return {
    jobseekerId: String(jobseeker._id),
    employerId: String(employer._id),
    companyId: String(company._id),
    jobIds: jobs.map((j) => String(j._id)),
  };
}

// CLI: MONGODB_URI=... DEMO_PASSWORD=... SEED_DEMO_CONFIRM=yes node dist/scripts/seedDemo.js
async function main(): Promise<void> {
  const uri = process.env["MONGODB_URI"] || process.env["MONGO_URI"];
  const password = process.env["DEMO_PASSWORD"];
  if (!uri || !password) {
    throw new Error("Set MONGODB_URI and DEMO_PASSWORD.");
  }
  if (process.env["SEED_DEMO_CONFIRM"] !== "yes") {
    throw new Error("This resets the demo accounts' data. Set SEED_DEMO_CONFIRM=yes to run it.");
  }
  await mongoose.connect(uri);
  try {
    const result = await seedDemo(password);
    console.log(JSON.stringify({ message: "demo_seeded", jobs: result.jobIds.length, ...DEMO_EMAILS }));
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(String(err instanceof Error ? err.message : err));
    process.exit(1);
  });
}
