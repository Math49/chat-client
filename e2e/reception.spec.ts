import { test, expect } from "@playwright/test";

test("requires pseudo before joining a room", async ({ page }) => {
  await page.goto("/reception");

  await expect(page.getByRole("button", { name: /#general/i })).toBeVisible();
  await page.getByRole("button", { name: /#general/i }).click();
  const alert = page.getByRole("alert").filter({ hasText: /Indique un pseudo/i });
  await expect(alert).toBeVisible();
});

test("adds a custom room", async ({ page }) => {
  await page.goto("/reception");

  await expect(page.getByRole("button", { name: /#general/i })).toBeVisible();
  const input = page.getByPlaceholder("Nom d'un nouveau salon");
  await expect(input).toBeEnabled();
  await input.fill("Mon Salon");
  await input.press("Enter");

  await expect(page.locator("button", { hasText: "#mon-salon" })).toBeVisible();
});
