import bcrypt from "bcryptjs";
import mongoose, { type Types } from "mongoose";
import { pathToFileURL } from "node:url";
import Application from "../models/applicationModel.js";
import ChatMessage from "../models/chatModel.js";
import Company from "../models/companyModel.js";
import Conversation from "../models/conversationModel.js";
import Job from "../models/jobModel.js";
import Notification from "../models/notificationModel.js";
import Payment from "../models/paymentModel.js";
import SavedJob from "../models/savedJobModel.js";
import Session from "../models/sessionModel.js";
import User from "../models/userModel.js";

/**
 * Sample data for demos, staging and local dev: every user role, companies, jobs of
 * every type and status, applications at every stage, saved jobs, chats,
 * notifications and payments.
 *
 * Safe to re-run: each run deletes everything owned by the seeded accounts
 * (all on @smartjobhub.test) and recreates it, then signs them out everywhere.
 * Visitors share the demo logins, so a scheduled re-run undoes whatever they
 * changed. Nothing belonging to other users is touched, except their
 * applications to, or chats with, seeded accounts.
 */

/** The two public demo logins (README). */
export const DEMO_EMAILS = {
  jobseeker: "demo.jobseeker@smartjobhub.test",
  employer: "demo.employer@smartjobhub.test",
} as const;

export const DEMO_ADMIN_EMAIL = "admin@smartjobhub.test";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

// --- people -----------------------------------------------------------------

type SeedUser = {
  key: string;
  email: string;
  name: string;
  role: "jobseeker" | "employer";
  suspended?: boolean;
  profile?: Record<string, unknown>;
};

const EMPLOYERS: SeedUser[] = [
  { key: "acme", email: DEMO_EMAILS.employer, name: "Demo Employer", role: "employer",
    profile: { headline: "Head of Engineering, Acme Robotics", location: "Dhaka, Bangladesh" } },
  { key: "padma", email: "farhana.rahman@smartjobhub.test", name: "Farhana Rahman", role: "employer",
    profile: { headline: "Talent Lead, Padma Fintech", location: "Dhaka, Bangladesh" } },
  { key: "meghna", email: "tanvir.hasan@smartjobhub.test", name: "Tanvir Hasan", role: "employer",
    profile: { headline: "CTO, Meghna Health", location: "Chattogram, Bangladesh" } },
];

const JOBSEEKERS: SeedUser[] = [
  {
    key: "demo", email: DEMO_EMAILS.jobseeker, name: "Demo Jobseeker", role: "jobseeker",
    profile: {
      headline: "Full-stack developer (Node.js, React)",
      bio: "Three years building web products end to end. Looking for a product team in Dhaka or remote.",
      phone: "+880 1700-000000", location: "Dhaka, Bangladesh",
      skills: ["TypeScript", "Node.js", "React", "MongoDB", "Docker"],
      github: "https://github.com/demo-jobseeker", resumeUrl: "https://example.com/resumes/demo-jobseeker.pdf",
      experience: [
        { title: "Software Engineer", company: "Shapla Soft", location: "Dhaka", startDate: "2023-01", current: true,
          description: "Built the customer portal and its REST API." },
        { title: "Junior Developer", company: "Karnaphuli Labs", location: "Chattogram", startDate: "2021-06",
          endDate: "2022-12", description: "Maintained Laravel and Vue apps." },
      ],
      education: [{ school: "University of Dhaka", degree: "BSc", field: "Computer Science", startYear: "2017", endYear: "2021" }],
    },
  },
  {
    key: "nusrat", email: "nusrat.jahan@smartjobhub.test", name: "Nusrat Jahan", role: "jobseeker",
    profile: {
      headline: "Frontend engineer who cares about accessibility",
      bio: "React and Next.js, design systems, performance budgets.",
      location: "Remote", skills: ["React", "Next.js", "Tailwind CSS", "Accessibility"],
      portfolio: "https://example.com/nusrat", resumeUrl: "https://example.com/resumes/nusrat.pdf",
      experience: [{ title: "Frontend Engineer", company: "Bonolota Studio", startDate: "2022-03", current: true }],
      education: [{ school: "BUET", degree: "BSc", field: "CSE", startYear: "2016", endYear: "2020" }],
    },
  },
  {
    key: "rafi", email: "rafi.ahmed@smartjobhub.test", name: "Rafi Ahmed", role: "jobseeker",
    profile: {
      headline: "DevOps engineer: AWS, Terraform, Kubernetes",
      location: "Chattogram, Bangladesh", skills: ["AWS", "Terraform", "Kubernetes", "GitHub Actions"],
      linkedIn: "https://linkedin.com/in/rafi-demo", resumeUrl: "https://example.com/resumes/rafi.pdf",
      experience: [{ title: "Cloud Engineer", company: "Surma Cloud", startDate: "2020-08", current: true }],
    },
  },
  {
    key: "sadia", email: "sadia.islam@smartjobhub.test", name: "Sadia Islam", role: "jobseeker",
    profile: {
      headline: "CS student looking for an internship", location: "Sylhet, Bangladesh",
      skills: ["JavaScript", "Python", "Git"], resumeUrl: "https://example.com/resumes/sadia.pdf",
      education: [{ school: "SUST", degree: "BSc", field: "Software Engineering", startYear: "2022", current: true }],
    },
  },
  // Shows the admin's moderation view; can't log in while suspended.
  { key: "suspended", email: "suspended.user@smartjobhub.test", name: "Suspended User", role: "jobseeker",
    suspended: true, profile: { headline: "Account suspended for spam (sample data)" } },
];

// --- companies and jobs -----------------------------------------------------

const COMPANIES = [
  { key: "acme", slug: "demo-acme-robotics", name: "Acme Robotics (demo)", industry: "Robotics", size: "51-200",
    location: "Dhaka, Bangladesh", website: "https://example.com/acme", verified: true,
    description: "Warehouse robots for South Asian logistics. A demo company; everything here resets nightly." },
  { key: "padma", slug: "demo-padma-fintech", name: "Padma Fintech (demo)", industry: "Financial services", size: "201-500",
    location: "Dhaka, Bangladesh", website: "https://example.com/padma", verified: true,
    description: "Mobile payments and micro-savings for small merchants. A demo company." },
  { key: "meghna", slug: "demo-meghna-health", name: "Meghna Health (demo)", industry: "Healthcare", size: "11-50",
    location: "Chattogram, Bangladesh", website: "https://example.com/meghna", verified: false,
    description: "Telemedicine for district hospitals. A demo company." },
] as const;

type SeedJob = {
  key: string;
  company: "acme" | "padma" | "meghna";
  title: string;
  location: string;
  type: "full-time" | "part-time" | "contract" | "internship";
  salary: [number, number];
  status: "active" | "draft" | "closed";
  postedDaysAgo: number;
  featuredDays?: number;
  skills: string[];
  description: string;
};

const JOBS: SeedJob[] = [
  { key: "backend", company: "acme", title: "Senior Backend Engineer (Node.js)", location: "Dhaka, Bangladesh", type: "full-time",
    salary: [150000, 250000], status: "active", postedDaysAgo: 3, featuredDays: 10, skills: ["Node.js", "TypeScript", "MongoDB", "Redis"],
    description: "Own our fleet-management APIs end to end: design, build, run." },
  { key: "frontend", company: "acme", title: "Frontend Engineer (Next.js)", location: "Remote", type: "full-time",
    salary: [120000, 200000], status: "active", postedDaysAgo: 6, skills: ["React", "Next.js", "Tailwind CSS"],
    description: "Build the operator dashboard our customers use all day." },
  { key: "devops", company: "acme", title: "DevOps Engineer (AWS)", location: "Chattogram, Bangladesh", type: "full-time",
    salary: [140000, 230000], status: "active", postedDaysAgo: 9, skills: ["AWS", "Terraform", "ECS", "GitHub Actions"],
    description: "Keep our Fargate platform fast, cheap and boring." },
  { key: "qa", company: "acme", title: "QA Engineer", location: "Dhaka, Bangladesh", type: "contract",
    salary: [80000, 120000], status: "active", postedDaysAgo: 12, skills: ["Playwright", "API testing"],
    description: "Automate end-to-end tests for web and API. Six-month contract." },
  { key: "intern", company: "acme", title: "Software Engineering Intern", location: "Sylhet, Bangladesh", type: "internship",
    salary: [20000, 30000], status: "active", postedDaysAgo: 2, skills: ["JavaScript", "Git"],
    description: "Six months with a mentor, shipping real features." },
  { key: "robotics", company: "acme", title: "Robotics Software Engineer", location: "Dhaka, Bangladesh", type: "full-time",
    salary: [160000, 260000], status: "draft", postedDaysAgo: 1, skills: ["C++", "ROS", "Python"],
    description: "Draft: not visible to candidates yet." },
  { key: "android", company: "padma", title: "Android Developer (Kotlin)", location: "Dhaka, Bangladesh", type: "full-time",
    salary: [110000, 180000], status: "active", postedDaysAgo: 4, skills: ["Kotlin", "Jetpack Compose"],
    description: "Our merchant app is used by 200,000 shops. Help make it faster." },
  { key: "data", company: "padma", title: "Data Analyst", location: "Remote", type: "part-time",
    salary: [50000, 80000], status: "active", postedDaysAgo: 8, skills: ["SQL", "Python", "Metabase"],
    description: "20 hours a week on fraud and growth dashboards." },
  { key: "security", company: "padma", title: "Security Engineer", location: "Dhaka, Bangladesh", type: "full-time",
    salary: [170000, 280000], status: "active", postedDaysAgo: 15, skills: ["AppSec", "OWASP", "AWS"],
    description: "Threat modelling, reviews and incident response for a regulated fintech." },
  { key: "support", company: "padma", title: "Customer Support Lead", location: "Dhaka, Bangladesh", type: "full-time",
    salary: [60000, 90000], status: "closed", postedDaysAgo: 40, skills: ["Support", "Bangla", "English"],
    description: "Closed: this role has been filled." },
  { key: "fullstack", company: "meghna", title: "Full-stack Developer", location: "Chattogram, Bangladesh", type: "full-time",
    salary: [100000, 160000], status: "active", postedDaysAgo: 5, skills: ["TypeScript", "React", "Node.js"],
    description: "Build the doctor and patient apps for our telemedicine service." },
  { key: "ml", company: "meghna", title: "Machine Learning Engineer", location: "Remote", type: "contract",
    salary: [150000, 220000], status: "active", postedDaysAgo: 11, skills: ["Python", "PyTorch", "NLP"],
    description: "Triage symptom descriptions written in Bangla and English." },
  { key: "designer", company: "meghna", title: "Product Designer", location: "Chattogram, Bangladesh", type: "part-time",
    salary: [60000, 90000], status: "active", postedDaysAgo: 18, skills: ["Figma", "User research"],
    description: "Design for patients with low bandwidth and older phones." },
  { key: "nurse-coord", company: "meghna", title: "Clinical Operations Intern", location: "Chattogram, Bangladesh", type: "internship",
    salary: [15000, 20000], status: "closed", postedDaysAgo: 35, skills: ["Operations", "Healthcare"],
    description: "Closed: applications are no longer accepted." },
];

// --- activity ---------------------------------------------------------------

type Stage = "pending" | "reviewed" | "shortlisted" | "rejected" | "accepted";
const PIPELINE: Record<Stage, Stage[]> = {
  pending: ["pending"],
  reviewed: ["pending", "reviewed"],
  shortlisted: ["pending", "reviewed", "shortlisted"],
  rejected: ["pending", "reviewed", "rejected"],
  accepted: ["pending", "reviewed", "shortlisted", "accepted"],
};

const APPLICATIONS: { seeker: string; job: string; stage: Stage; daysAgo: number; coverLetter?: string }[] = [
  { seeker: "demo", job: "backend", stage: "shortlisted", daysAgo: 2, coverLetter: "I've run Node.js APIs in production for three years." },
  { seeker: "demo", job: "fullstack", stage: "reviewed", daysAgo: 4 },
  { seeker: "demo", job: "android", stage: "rejected", daysAgo: 3 },
  { seeker: "demo", job: "qa", stage: "pending", daysAgo: 1 },
  { seeker: "nusrat", job: "frontend", stage: "accepted", daysAgo: 5, coverLetter: "Accessibility is my favourite kind of performance work." },
  { seeker: "nusrat", job: "designer", stage: "pending", daysAgo: 2 },
  { seeker: "nusrat", job: "backend", stage: "pending", daysAgo: 1 },
  { seeker: "rafi", job: "devops", stage: "shortlisted", daysAgo: 7 },
  { seeker: "rafi", job: "security", stage: "reviewed", daysAgo: 10 },
  { seeker: "sadia", job: "intern", stage: "pending", daysAgo: 1 },
  { seeker: "sadia", job: "nurse-coord", stage: "rejected", daysAgo: 30 },
];

const SAVED: { seeker: string; job: string }[] = [
  { seeker: "demo", job: "devops" },
  { seeker: "demo", job: "ml" },
  { seeker: "demo", job: "security" },
  { seeker: "nusrat", job: "fullstack" },
  { seeker: "rafi", job: "backend" },
  { seeker: "sadia", job: "frontend" },
];

const CHATS: { a: string; b: string; messages: { from: "a" | "b"; text: string; hoursAgo: number }[] }[] = [
  {
    a: "acme", b: "demo",
    messages: [
      { from: "a", text: "Hi! Thanks for applying to the Senior Backend role. Are you free for a call this week?", hoursAgo: 30 },
      { from: "b", text: "Thanks for reaching out. Thursday afternoon works for me.", hoursAgo: 28 },
      { from: "a", text: "Great, Thursday 3pm then. I'll send an invite.", hoursAgo: 27 },
      { from: "a", text: "Could you also share a GitHub project you're proud of?", hoursAgo: 2 },
    ],
  },
  {
    a: "meghna", b: "demo",
    messages: [
      { from: "a", text: "Your profile looks like a good fit for our full-stack role.", hoursAgo: 50 },
      { from: "b", text: "Thank you! Is the role on-site in Chattogram?", hoursAgo: 49 },
    ],
  },
  {
    a: "acme", b: "nusrat",
    messages: [
      { from: "a", text: "Congratulations, we'd love to make you an offer!", hoursAgo: 20 },
      { from: "b", text: "That's wonderful news, thank you! 🎉", hoursAgo: 19 },
    ],
  },
  {
    a: "acme", b: "rafi",
    messages: [{ from: "b", text: "Hello, is the DevOps role open to remote candidates?", hoursAgo: 6 }],
  },
];

export type SeedResult = {
  jobseekerId: string;
  employerId: string;
  companyId: string;
  jobIds: string[];
  counts: Record<string, number>;
};

export type SeedOptions = {
  /** Also create admin@smartjobhub.test with this password. Never use the public demo password. */
  adminPassword?: string;
};

export async function seedDemo(password: string, options: SeedOptions = {}): Promise<SeedResult> {
  if (password.length < 10) {
    throw new Error("DEMO_PASSWORD must be at least 10 characters.");
  }
  if (options.adminPassword !== undefined) {
    if (options.adminPassword.length < 12) throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
    if (options.adminPassword === password) throw new Error("SEED_ADMIN_PASSWORD must differ from DEMO_PASSWORD.");
  }
  const passwordHash = await bcrypt.hash(password, 12);

  // 1. Users (upserted, so their IDs are stable across runs).
  const upsertUser = async (u: { email: string; name: string; role: string; suspended?: boolean; profile?: object }, hash: string) =>
    User.findOneAndUpdate(
      { email: u.email },
      {
        $set: {
          name: u.name,
          role: u.role,
          password: hash,
          isVerified: true,
          isSuspended: Boolean(u.suspended),
          profile: u.profile ?? {},
          ...(u.suspended ? { suspendedAt: daysAgo(3) } : {}),
        },
        $unset: {
          deletedAt: "",
          deletedBy: "",
          ...(u.suspended ? {} : { suspendedAt: "" }),
          companyId: "",
          verificationToken: "",
          resetPasswordToken: "",
          resetPasswordExpires: "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).orFail();

  const users = new Map<string, InstanceType<typeof User>>();
  for (const u of [...EMPLOYERS, ...JOBSEEKERS]) {
    users.set(`${u.role}:${u.key}`, await upsertUser(u, passwordHash));
  }
  if (options.adminPassword) {
    await upsertUser(
      { email: DEMO_ADMIN_EMAIL, name: "Site Admin", role: "admin" },
      await bcrypt.hash(options.adminPassword, 12),
    );
  }
  const employer = (key: string) => users.get(`employer:${key}`)!;
  const seeker = (key: string) => users.get(`jobseeker:${key}`)!;
  const seededIds = [...users.values()].map((u) => u._id);

  // 2. Wipe everything the seeded accounts own or take part in.
  const oldJobIds = (await Job.find({ employer: { $in: seededIds } }, { _id: 1 })).map((j) => j._id);
  const oldConversationIds = (await Conversation.find({ participants: { $in: seededIds } }, { _id: 1 })).map((c) => c._id);
  await Promise.all([
    Application.deleteMany({ $or: [{ applicant: { $in: seededIds } }, { job: { $in: oldJobIds } }] }),
    SavedJob.deleteMany({ $or: [{ userId: { $in: seededIds } }, { jobId: { $in: oldJobIds } }] }),
    ChatMessage.deleteMany({ $or: [{ senderId: { $in: seededIds } }, { receiverId: { $in: seededIds } }] }),
    Conversation.deleteMany({ _id: { $in: oldConversationIds } }),
    Notification.deleteMany({ userId: { $in: seededIds } }),
    Payment.deleteMany({ user: { $in: seededIds } }),
    Session.deleteMany({ userId: { $in: seededIds } }),
  ]);
  await Job.deleteMany({ employer: { $in: seededIds } });

  // 3. Companies.
  const companies = new Map<string, InstanceType<typeof Company>>();
  for (const c of COMPANIES) {
    const { key, ...fields } = c;
    const company = await Company.findOneAndUpdate(
      { slug: c.slug },
      { $set: { ...fields, createdBy: employer(key)._id, members: [employer(key)._id] } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).orFail();
    companies.set(key, company);
    await User.updateOne({ _id: employer(key)._id }, { $set: { companyId: company._id } });
  }

  // 4. Jobs, back-dated so listings look like a live site.
  const jobs = new Map<string, Types.ObjectId>();
  const inserted = await Job.insertMany(
    JOBS.map((j) => ({
      title: j.title,
      company: companies.get(j.company)!.name,
      companyId: companies.get(j.company)!._id,
      employer: employer(j.company)._id,
      location: j.location,
      type: j.type,
      salary: { min: j.salary[0], max: j.salary[1], currency: "BDT" },
      skills: j.skills,
      requirements: [`${j.skills[0]} in production`, "Clear written communication"],
      benefits: ["Festival bonuses", "Health insurance", "Learning budget"],
      description: j.description,
      status: j.status,
      ...(j.featuredDays ? { featuredUntil: daysFromNow(j.featuredDays) } : {}),
    })),
  );
  inserted.forEach((doc, i) => jobs.set(JOBS[i]!.key, doc._id as Types.ObjectId));
  await backdate(Job, JOBS.map((j) => ({ _id: jobs.get(j.key)!, at: daysAgo(j.postedDaysAgo) })));

  // 5. Applications with a realistic status history.
  const jobEmployer = (jobKey: string) => employer(JOBS.find((j) => j.key === jobKey)!.company);
  const apps = await Application.insertMany(
    APPLICATIONS.map((a) => {
      const steps = PIPELINE[a.stage];
      return {
        job: jobs.get(a.job)!,
        applicant: seeker(a.seeker)._id,
        resume: `https://example.com/resumes/${a.seeker}.pdf`,
        ...(a.coverLetter ? { coverLetter: a.coverLetter } : {}),
        status: a.stage,
        statusHistory: steps.map((status, i) => ({
          status,
          changedAt: new Date(daysAgo(a.daysAgo).getTime() + i * 6 * 60 * 60 * 1000),
          ...(i > 0 ? { note: `Moved to ${status} by the hiring team` } : {}),
        })),
      };
    }),
  );
  await backdate(Application, apps.map((doc, i) => ({ _id: doc._id as Types.ObjectId, at: daysAgo(APPLICATIONS[i]!.daysAgo) })));

  // 6. Saved jobs.
  await SavedJob.insertMany(SAVED.map((s) => ({ userId: seeker(s.seeker)._id, jobId: jobs.get(s.job)! })));

  // 7. Chats: messages plus the conversation's last message and unread count.
  let messageCount = 0;
  for (const chat of CHATS) {
    const a = employer(chat.a);
    const b = seeker(chat.b);
    const docs = await ChatMessage.insertMany(
      chat.messages.map((m, i) => {
        const [from, to] = m.from === "a" ? [a, b] : [b, a];
        const isLast = i === chat.messages.length - 1;
        return {
          senderId: from._id,
          receiverId: to._id,
          message: m.text,
          messageType: "text",
          timestamp: new Date(Date.now() - m.hoursAgo * 60 * 60 * 1000),
          // Everything is read except the final message, which is waiting for its receiver.
          isRead: !isLast,
          ...(isLast ? {} : { readAt: new Date(Date.now() - (m.hoursAgo - 0.5) * 60 * 60 * 1000) }),
        };
      }),
    );
    messageCount += docs.length;
    const last = docs[docs.length - 1]!;
    const lastMsg = chat.messages[chat.messages.length - 1]!;
    const unreadFor = lastMsg.from === "a" ? b : a;
    await Conversation.create({
      participants: [a._id, b._id],
      isGroupChat: false,
      lastMessage: last._id,
      lastMessageAt: last.timestamp,
      unreadCount: new Map([[String(unreadFor._id), 1]]),
    });
  }

  // 8. Notifications of every type.
  const notifications = [
    ...APPLICATIONS.filter((a) => a.daysAgo <= 3).map((a) => ({
      userId: jobEmployer(a.job)._id,
      type: "application_received",
      title: "New application",
      body: `${seeker(a.seeker).name} applied for ${JOBS.find((j) => j.key === a.job)!.title}.`,
      href: `/my-jobs/${String(jobs.get(a.job))}/applications`,
      read: a.daysAgo > 1,
    })),
    ...APPLICATIONS.filter((a) => a.stage !== "pending").map((a) => ({
      userId: seeker(a.seeker)._id,
      type: "application_status",
      title: `Application ${a.stage}`,
      body: `Your application for ${JOBS.find((j) => j.key === a.job)!.title} is now ${a.stage}.`,
      href: "/applications",
      read: a.stage === "rejected",
    })),
    {
      userId: employer("padma")._id,
      type: "job_closing_soon",
      title: "Job closing soon",
      body: "Security Engineer closes in 3 days.",
      href: `/my-jobs/${String(jobs.get("security"))}/applications`,
      read: false,
    },
  ];
  await Notification.insertMany(notifications);

  // 9. Payments: the completed boost behind the featured job, and one abandoned checkout.
  const tran = (s: string) => `DEMO${s}${Date.now().toString(36)}`.slice(0, 30).toUpperCase();
  await Payment.insertMany([
    { user: employer("acme")._id, tranId: tran("BOOST"), amount: 1000, currency: "BDT", status: "completed",
      purpose: "job_boost", jobId: jobs.get("backend")!, boostDays: 10, bankTranId: "DEMO-BANK-0001" },
    { user: employer("padma")._id, tranId: tran("PEND"), amount: 700, currency: "BDT", status: "cancelled",
      purpose: "job_boost", jobId: jobs.get("security")!, boostDays: 7 },
  ]);

  return {
    jobseekerId: String(seeker("demo")._id),
    employerId: String(employer("acme")._id),
    companyId: String(companies.get("acme")!._id),
    jobIds: JOBS.filter((j) => j.company === "acme").map((j) => String(jobs.get(j.key))),
    counts: {
      users: users.size + (options.adminPassword ? 1 : 0),
      companies: companies.size,
      jobs: JOBS.length,
      applications: APPLICATIONS.length,
      savedJobs: SAVED.length,
      conversations: CHATS.length,
      messages: messageCount,
      notifications: notifications.length,
      payments: 2,
    },
  };
}

/** Sets createdAt/updatedAt directly: Mongoose's timestamps would stamp "now". */
async function backdate(model: mongoose.Model<any>, rows: { _id: Types.ObjectId; at: Date }[]): Promise<void> {
  if (rows.length === 0) return;
  await model.collection.bulkWrite(
    rows.map((r) => ({ updateOne: { filter: { _id: r._id }, update: { $set: { createdAt: r.at, updatedAt: r.at } } } })),
  );
}

// CLI: MONGODB_URI=... DEMO_PASSWORD=... [SEED_ADMIN_PASSWORD=...] SEED_DEMO_CONFIRM=yes node dist/scripts/seedDemo.js
async function main(): Promise<void> {
  const uri = process.env["MONGODB_URI"] || process.env["MONGO_URI"];
  const password = process.env["DEMO_PASSWORD"];
  if (!uri || !password) {
    throw new Error("Set MONGODB_URI and DEMO_PASSWORD.");
  }
  if (process.env["SEED_DEMO_CONFIRM"] !== "yes") {
    throw new Error("This resets the sample accounts' data. Set SEED_DEMO_CONFIRM=yes to run it.");
  }
  const adminPassword = process.env["SEED_ADMIN_PASSWORD"];
  await mongoose.connect(uri);
  try {
    const result = await seedDemo(password, adminPassword ? { adminPassword } : {});
    console.log(JSON.stringify({ message: "demo_seeded", ...result.counts, ...DEMO_EMAILS }));
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
