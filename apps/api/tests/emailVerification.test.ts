import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-email-verification"));
});

afterEach(() => {
  delete process.env["REQUIRE_EMAIL_VERIFICATION"];
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

const register = (email: string, role = "jobseeker") =>
  request(app)
    .post("/api/auth/register")
    .field("name", "New User")
    .field("email", email)
    .field("password", "password123")
    .field("role", role);

test("verification off (default): sign-up signs you in, and login works", async () => {
  const res = await register("off-1@test.local");
  assert.equal(res.status, 201);
  assert.ok(res.body.data.token, "sign-up returns an access token");
  assert.equal(res.body.data.user.email, "off-1@test.local");
  assert.equal(res.body.data.user.isVerified, true);
  assert.match(String(res.headers["set-cookie"]), /refresh/i, "refresh cookie set like on login");

  const me = await request(app).get("/api/auth/protected").set("Authorization", `Bearer ${res.body.data.token}`);
  assert.equal(me.status, 200);

  const login = await request(app).post("/api/auth/login").send({ email: "off-1@test.local", password: "password123" });
  assert.equal(login.status, 200);
});

test("verification off: accounts created earlier without verifying can log in", async () => {
  const User = (await import("../src/models/userModel.js")).default;
  const bcrypt = (await import("bcryptjs")).default;
  await User.create({
    name: "Old Unverified",
    email: "old-unverified@test.local",
    password: await bcrypt.hash("password123", 12),
    role: "employer",
    isVerified: false,
  });
  const login = await request(app).post("/api/auth/login").send({ email: "old-unverified@test.local", password: "password123" });
  assert.equal(login.status, 200);
});

test("verification on: sign-up returns no session, and login is refused until verified", async () => {
  process.env["REQUIRE_EMAIL_VERIFICATION"] = "true";
  const res = await register("on-1@test.local");
  assert.equal(res.status, 201);
  assert.equal(res.body.data.token, undefined);

  const login = await request(app).post("/api/auth/login").send({ email: "on-1@test.local", password: "password123" });
  assert.equal(login.status, 400);
});

test("wrong password is still rejected with verification off", async () => {
  await register("off-2@test.local");
  const login = await request(app).post("/api/auth/login").send({ email: "off-2@test.local", password: "nope-nope-nope" });
  assert.equal(login.status, 400);
});
