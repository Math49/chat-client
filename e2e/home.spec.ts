import { test, expect } from "@playwright/test";

test("home navigation", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Chat Client" })).toBeVisible();

  await page.getByRole("link", { name: "Acceder a la reception" }).click();
  await expect(page).toHaveURL(/\/reception/);
});
