import { test, expect } from "@playwright/test";

test("renders stored photos from localStorage", async ({ page }) => {
  const photos = [
    {
      id: "photo-1",
      dataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
      createdAt: 1700000000000,
    },
  ];

  await page.addInitScript((seed) => {
    window.localStorage.setItem("chat-client/photos", JSON.stringify(seed));
  }, photos);

  await page.goto("/gallery");

  await expect(page.getByText(/1 photo\(s\) accessibles/)).toBeVisible();
  await expect(page.getByAltText("Photo stockee")).toBeVisible();
});
