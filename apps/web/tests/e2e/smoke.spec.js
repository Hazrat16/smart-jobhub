const { test, expect } = require("@playwright/test");

test("home page loads and shows primary CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /browse jobs/i }).first()).toBeVisible();
});

test("jobs page loads with title", async ({ page }) => {
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { name: /jobs/i })).toBeVisible();
});
