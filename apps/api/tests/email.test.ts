import assert from "node:assert/strict";
import { test } from "node:test";

process.env["RESEND_API_KEY"] ||= "re_test_only_dummy_key";

test("verification link uses the public base URL, not localhost", async () => {
  const { verificationLink } = await import("../src/utils/email.js");
  process.env["API_PUBLIC_BASE_URL"] = "https://jobs.example.com/";
  assert.equal(verificationLink("abc"), "https://jobs.example.com/api/auth/verify-email?token=abc");
});

test("verification link falls back to the local API in dev and encodes the token", async () => {
  const { verificationLink } = await import("../src/utils/email.js");
  delete process.env["API_PUBLIC_BASE_URL"];
  assert.equal(verificationLink("a b&c"), "http://localhost:5000/api/auth/verify-email?token=a%20b%26c");
});
