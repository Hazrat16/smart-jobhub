import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

const PASSWORD = "demo-password-123";
const ADMIN_PASSWORD = "admin-password-456";

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-seed-demo"));
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

const login = (email: string, password = PASSWORD) =>
  request(app).post("/api/auth/login").send({ email, password });

const models = async () => ({
  User: (await import("../src/models/userModel.js")).default,
  Job: (await import("../src/models/jobModel.js")).default,
  Application: (await import("../src/models/applicationModel.js")).default,
  Company: (await import("../src/models/companyModel.js")).default,
  SavedJob: (await import("../src/models/savedJobModel.js")).default,
  Conversation: (await import("../src/models/conversationModel.js")).default,
  ChatMessage: (await import("../src/models/chatModel.js")).default,
  Notification: (await import("../src/models/notificationModel.js")).default,
  Payment: (await import("../src/models/paymentModel.js")).default,
});

test("seeds every role, and all active sample accounts can log in", async () => {
  const { seedDemo, DEMO_EMAILS, DEMO_ADMIN_EMAIL } = await import("../src/scripts/seedDemo.js");
  const { User } = await models();
  const result = await seedDemo(PASSWORD, { adminPassword: ADMIN_PASSWORD });

  const seeded = await User.find({ email: /@smartjobhub\.test$/ });
  assert.deepEqual(
    [...new Set(seeded.map((u) => u.role))].sort(),
    ["admin", "employer", "jobseeker"],
    "all three roles are seeded",
  );
  assert.equal(result.counts["users"], seeded.length);

  // Login is rate-limited (10/min per client), so check every password directly
  // and use the real login endpoint for the two public demo accounts.
  for (const u of seeded.filter((u) => u.role !== "admin")) {
    assert.ok(await bcrypt.compare(PASSWORD, u.password), `wrong password hash for ${u.email}`);
    assert.equal(u.isVerified, true);
  }
  assert.equal((await login(DEMO_EMAILS.jobseeker)).status, 200);
  assert.equal((await login(DEMO_EMAILS.employer)).status, 200);

  const admin = await login(DEMO_ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.equal(admin.status, 200);
  assert.equal(admin.body.data.user.role, "admin");
  assert.equal((await login(DEMO_ADMIN_EMAIL, PASSWORD)).status, 400, "admin doesn't use the public demo password");

  assert.ok(seeded.some((u) => u.isSuspended), "a suspended user exists for the admin moderation view");
});

test("jobs cover every type and status; only active ones are public", async () => {
  const { seedDemo } = await import("../src/scripts/seedDemo.js");
  const { Job } = await models();
  await seedDemo(PASSWORD);

  const all = await Job.find({ employer: { $exists: true }, company: /\(demo\)$/ });
  assert.equal(all.length, 14);
  assert.deepEqual([...new Set(all.map((j) => j.type))].sort(), ["contract", "full-time", "internship", "part-time"]);
  assert.deepEqual([...new Set(all.map((j) => j.status))].sort(), ["active", "closed", "draft"]);
  assert.equal(all.filter((j) => j.featuredUntil && j.featuredUntil > new Date()).length, 1, "one boosted job");
  assert.ok(all.every((j) => j.createdAt < new Date(Date.now() - 12 * 60 * 60 * 1000)), "jobs are back-dated");

  const listed = await request(app).get("/api/jobs?limit=50");
  assert.equal(listed.status, 200);
  const body = JSON.stringify(listed.body);
  assert.ok(body.includes("DevOps Engineer (AWS)"), "active jobs are listed");
  assert.ok(!body.includes("Robotics Software Engineer"), "drafts are not listed");
});

test("applications, saved jobs, chats, notifications and payments are seeded", async () => {
  const { seedDemo, DEMO_EMAILS } = await import("../src/scripts/seedDemo.js");
  const { Application, SavedJob, Conversation, ChatMessage, Notification, Payment } = await models();
  const result = await seedDemo(PASSWORD);

  const apps = await Application.find({ applicant: { $exists: true } });
  assert.deepEqual(
    [...new Set(apps.map((a) => a.status))].sort(),
    ["accepted", "pending", "rejected", "reviewed", "shortlisted"],
  );
  const accepted = apps.find((a) => a.status === "accepted")!;
  assert.deepEqual(accepted.statusHistory.map((h) => h.status), ["pending", "reviewed", "shortlisted", "accepted"]);

  assert.equal(await SavedJob.countDocuments(), result.counts["savedJobs"]);
  assert.equal(await Conversation.countDocuments(), 4);
  assert.equal(await ChatMessage.countDocuments(), result.counts["messages"]);
  assert.deepEqual(
    (await Notification.distinct("type")).sort(),
    ["application_received", "application_status", "job_closing_soon"],
  );
  assert.equal(await Payment.countDocuments({ status: "completed", purpose: "job_boost" }), 1);

  // Through the real API, as the demo jobseeker.
  const token = (await login(DEMO_EMAILS.jobseeker)).body.data.token as string;
  const convs = await request(app).get("/api/chat/conversations").set("Authorization", `Bearer ${token}`);
  assert.equal(convs.status, 200);
  assert.equal(convs.body.data.conversations.length, 2, "demo jobseeker chats with two employers");
});

test("re-running resets what visitors changed and leaves real users alone", async () => {
  const { seedDemo, DEMO_EMAILS } = await import("../src/scripts/seedDemo.js");
  const { User, Job, Application, ChatMessage } = await models();

  const first = await seedDemo(PASSWORD);

  const real = await User.create({
    name: "Real Employer",
    email: "real@test.local",
    password: await bcrypt.hash("password123", 12),
    role: "employer",
    isVerified: true,
  });
  const realJob = await Job.create({
    title: "Real job",
    company: "Real Co",
    location: "Dhaka",
    type: "full-time",
    salary: { min: 1, max: 2, currency: "BDT" },
    description: "real",
    employer: real._id,
  });
  await Application.create({ job: realJob._id, applicant: real._id, resume: "r.pdf" });

  // What visitors might do with the shared logins.
  await User.updateOne(
    { email: DEMO_EMAILS.employer },
    { $set: { password: await bcrypt.hash("hijacked-pass", 12), isSuspended: true, name: "Hacked" } },
  );
  await Job.create({
    title: "Spam post",
    company: "x",
    location: "x",
    type: "contract",
    salary: { min: 1, max: 2, currency: "BDT" },
    description: "spam",
    employer: first.employerId,
  });
  await ChatMessage.create({ senderId: first.jobseekerId, receiverId: first.employerId, message: "spam" });

  const before = await ChatMessage.countDocuments();
  const second = await seedDemo(PASSWORD);

  assert.equal(second.employerId, first.employerId, "seeded users are updated, not duplicated");
  assert.equal((await login(DEMO_EMAILS.employer)).status, 200, "password reset and unsuspended");
  assert.equal((await User.findById(second.employerId))!.name, "Demo Employer");
  assert.equal(await Job.countDocuments({ employer: second.employerId }), 6, "spam post removed");
  assert.equal(await ChatMessage.countDocuments(), before - 1, "visitor's chat message removed");
  assert.equal(await User.countDocuments({ email: /@smartjobhub\.test$/ }), second.counts["users"]! + 1, "admin from test 1 kept, nothing duplicated");

  assert.equal(await Job.countDocuments({ _id: realJob._id }), 1, "real user's job untouched");
  assert.equal(await Application.countDocuments({ applicant: real._id }), 1, "real user's application untouched");
});

test("refuses weak or reused passwords", async () => {
  const { seedDemo } = await import("../src/scripts/seedDemo.js");
  await assert.rejects(seedDemo("short"), /at least 10 characters/);
  await assert.rejects(seedDemo(PASSWORD, { adminPassword: "short" }), /at least 12 characters/);
  await assert.rejects(seedDemo("same-password-1", { adminPassword: "same-password-1" }), /must differ/);
});
