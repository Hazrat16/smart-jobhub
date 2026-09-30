import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

// Read by app.ts at import, like in production (ECS sets it per environment).
process.env["CORS_ALLOWED_ORIGINS"] = "https://d1abc234xyz.cloudfront.net";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-cors"));
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

test("the site's own origin can sign up (the browser sends Origin even for same-origin POSTs)", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .set("Origin", "https://d1abc234xyz.cloudfront.net")
    .field("name", "Cors User")
    .field("email", "cors-ok@test.local")
    .field("password", "password123")
    .field("role", "jobseeker");
  assert.equal(res.status, 201);
  assert.equal(res.headers["access-control-allow-origin"], "https://d1abc234xyz.cloudfront.net");
});

test("another origin gets a clear 403, not a 500", async () => {
  const res = await request(app)
    .post("/api/auth/register")
    .set("Origin", "https://evil.example")
    .field("name", "Cors User")
    .field("email", "cors-bad@test.local")
    .field("password", "password123")
    .field("role", "jobseeker");
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "FORBIDDEN");
  assert.match(res.body.message, /Origin not allowed: https:\/\/evil\.example/);
});

test("logged errors show their message and stack instead of {}", async () => {
  const { serializeLog } = await import("../src/utils/logger.js");
  const out = JSON.parse(serializeLog({ message: "Unhandled error", error: new TypeError("boom") }));
  assert.equal(out.error.name, "TypeError");
  assert.equal(out.error.message, "boom");
  assert.match(out.error.stack, /TypeError: boom/);
});
