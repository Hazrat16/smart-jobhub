import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

// Read once at import, like in production (the deploy sets it per task definition).
process.env["APP_VERSION"] = "api-v42";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-health"));
});

after(async () => {
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

test("/api/health/ready is 200 and reports the deployed version", async () => {
  const res = await request(app).get("/api/health/ready");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ready");
  assert.equal(res.body.version, "api-v42");
});

test("/api/health reports the deployed version", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.version, "api-v42");
});
