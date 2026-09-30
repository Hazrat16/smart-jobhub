const { test, expect } = require("@playwright/test");

/**
 * Real sign-up and sign-in against a running API (not mocked).
 * Needs the API on API_PROXY_TARGET (default http://127.0.0.1:5000) with a
 * disposable MongoDB. The seeded-login test also needs `npm run seed:demo`
 * run first with DEMO_PASSWORD (skipped when E2E_DEMO_PASSWORD isn't set).
 */

const unique = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function signUp(page, { name, email, password, role }) {
  await page.goto("/register");
  await page.getByPlaceholder("Enter your full name").fill(name);
  await page.getByPlaceholder("Enter your email").fill(email);
  await page.getByRole("button", { name: role === "employer" ? /employer/i : /job seeker/i }).click();
  await page.getByPlaceholder("Create a password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: /create account|sign up|register/i }).click();
}

async function signIn(page, email, password) {
  await page.goto("/login");
  await page.getByPlaceholder("Enter your email").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.locator('button[type="submit"]').click();
}

const storedUser = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("user") || "null"));
const storedToken = (page) => page.evaluate(() => localStorage.getItem("token"));

test("a jobseeker signs up and is logged in straight away", async ({ page }) => {
  const email = `seeker-${unique()}@example.com`;
  await signUp(page, { name: "E2E Seeker", email, password: "password123", role: "jobseeker" });

  await expect(page).toHaveURL(/\/jobs/);
  expect(await storedToken(page)).toBeTruthy();
  expect(await storedUser(page)).toMatchObject({ email, role: "jobseeker" });

  // Still logged in after a reload.
  await page.reload();
  await expect(page).toHaveURL(/\/jobs/);
  expect(await storedToken(page)).toBeTruthy();
});

test("an employer signs up and lands on their jobs page", async ({ page }) => {
  const email = `employer-${unique()}@example.com`;
  await signUp(page, { name: "E2E Employer", email, password: "password123", role: "employer" });

  await expect(page).toHaveURL(/\/my-jobs/);
  expect(await storedUser(page)).toMatchObject({ email, role: "employer" });
});

test("a new account can sign out and sign in again", async ({ page, context }) => {
  const email = `again-${unique()}@example.com`;
  await signUp(page, { name: "E2E Again", email, password: "password123", role: "jobseeker" });
  await expect(page).toHaveURL(/\/jobs/);

  await page.evaluate(() => localStorage.clear());
  await context.clearCookies();

  await signIn(page, email, "password123");
  await expect(page).toHaveURL(/\/jobs/);
  expect(await storedUser(page)).toMatchObject({ email });
});

test("signing up twice with the same email is refused", async ({ page }) => {
  const email = `dup-${unique()}@example.com`;
  await signUp(page, { name: "E2E Dup", email, password: "password123", role: "jobseeker" });
  await expect(page).toHaveURL(/\/jobs/);

  await page.evaluate(() => localStorage.clear());
  await signUp(page, { name: "E2E Dup", email, password: "password123", role: "jobseeker" });
  await expect(page.getByText(/already exists/i)).toBeVisible();
  await expect(page).toHaveURL(/\/register/);
});

test("a seeded demo account can sign in", async ({ page }) => {
  const password = process.env.E2E_DEMO_PASSWORD;
  test.skip(!password, "E2E_DEMO_PASSWORD not set (run the seed first)");

  await signIn(page, "demo.employer@smartjobhub.test", password);
  await expect(page).toHaveURL(/\/my-jobs/);
  expect(await storedUser(page)).toMatchObject({ role: "employer", name: "Demo Employer" });
});
