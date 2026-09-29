import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

const PASSWORD = "demo-password-123";

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-seed-demo"));
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

async function login(email: string, password = PASSWORD) {
  return request(app).post("/api/auth/login").send({ email, password });
}

test("demo accounts can log in and the employer's jobs are listed", async () => {
  const { seedDemo, DEMO_EMAILS } = await import("../src/scripts/seedDemo.js");
  const result = await seedDemo(PASSWORD);
  assert.equal(result.jobIds.length, 5);

  for (const email of Object.values(DEMO_EMAILS)) {
    const res = await login(email);
    assert.equal(res.status, 200, `demo login failed for ${email}`);
  }

  const jobs = await request(app).get("/api/jobs?limit=50");
  assert.equal(jobs.status, 200);
  const body = JSON.stringify(jobs.body);
  assert.ok(body.includes("DevOps Engineer (AWS)"), "seeded jobs should be publicly listed");
});

test("re-running resets what visitors changed and leaves real users alone", async () => {
  const { seedDemo, DEMO_EMAILS } = await import("../src/scripts/seedDemo.js");
  const User = (await import("../src/models/userModel.js")).default;
  const Job = (await import("../src/models/jobModel.js")).default;
  const Application = (await import("../src/models/applicationModel.js")).default;

  const first = await seedDemo(PASSWORD);

  // A real user with their own job and an application from them.
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

  // What a visitor might do with the shared demo logins.
  await User.updateOne(
    { email: DEMO_EMAILS.employer },
    { $set: { password: await bcrypt.hash("hijacked-pass", 12), isSuspended: true } },
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
  await Application.create({ job: first.jobIds[0], applicant: first.jobseekerId, resume: "cv.pdf" });

  const second = await seedDemo(PASSWORD);

  assert.equal(second.employerId, first.employerId, "demo users are updated, not duplicated");
  assert.equal((await login(DEMO_EMAILS.employer)).status, 200, "password reset and unsuspended");
  assert.equal(await Job.countDocuments({ employer: second.employerId }), 5, "spam post removed");
  assert.equal(await Application.countDocuments({ applicant: second.jobseekerId }), 0, "demo applications removed");
  assert.equal(await User.countDocuments({ email: { $in: Object.values(DEMO_EMAILS) } }), 2);

  assert.equal(await Job.countDocuments({ _id: realJob._id }), 1, "real user's job untouched");
  assert.equal(await Application.countDocuments({ applicant: real._id }), 1, "real user's application untouched");
});

test("refuses a short password", async () => {
  const { seedDemo } = await import("../src/scripts/seedDemo.js");
  await assert.rejects(seedDemo("short"), /at least 10 characters/);
});
