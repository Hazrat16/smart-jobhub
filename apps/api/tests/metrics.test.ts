import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { setupTestApp, teardownTestApp } from "./helpers/testApp.js";

let app: Awaited<ReturnType<typeof setupTestApp>>["app"];
let mongoose: Awaited<ReturnType<typeof setupTestApp>>["mongoose"];
let stopBackgroundJobs: () => void;

before(async () => {
  ({ app, mongoose, stopBackgroundJobs } = await setupTestApp("job-platform-test-metrics"));
});

after(async () => {
  delete process.env["METRICS_TOKEN"];
  await teardownTestApp(mongoose, stopBackgroundJobs);
});

test("/metrics serves Prometheus text with process and dependency metrics", async () => {
  const res = await request(app).get("/metrics");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"] ?? "", /^text\/plain/);
  assert.match(res.text, /process_resident_memory_bytes\{service="job-platform-api"\}/);
  assert.match(res.text, /app_dependency_up\{dependency="mongodb",service="job-platform-api"\} 1/);
});

test("requests are labelled by route template, never by raw URL", async () => {
  const id = new mongoose.Types.ObjectId().toString();
  await request(app).get(`/api/jobs/${id}`);
  await request(app).get("/api/no-such-route-12345");

  const res = await request(app).get("/metrics");
  assert.match(res.text, /http_requests_total\{method="GET",route="\/api\/jobs\/:id",status_code="\d+"/);
  assert.match(res.text, /http_requests_total\{method="GET",route="unmatched",status_code="404"/);
  assert.doesNotMatch(res.text, new RegExp(id));
  assert.doesNotMatch(res.text, /no-such-route-12345/);
  // The scrape itself is not recorded.
  assert.doesNotMatch(res.text, /route="\/metrics"/);
});

test("/metrics requires the bearer token when METRICS_TOKEN is set", async () => {
  process.env["METRICS_TOKEN"] = "scrape-secret";
  assert.equal((await request(app).get("/metrics")).status, 401);
  assert.equal(
    (await request(app).get("/metrics").set("Authorization", "Bearer wrong-secret")).status,
    401,
  );
  const ok = await request(app).get("/metrics").set("Authorization", "Bearer scrape-secret");
  assert.equal(ok.status, 200);
});
