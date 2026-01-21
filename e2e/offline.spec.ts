import { test, expect } from "@playwright/test";

test("shows offline page", async ({ page }) => {
  await page.goto("/offline.html");

  await expect(page.getByRole("heading", { name: "Mode hors ligne" })).toBeVisible();
});
