import { MessageInputHarness } from "./stories/message-input-harness";
import { test, expect } from "./fixtures";

test("submits trimmed content", async ({ mount, page }) => {
  await mount(<MessageInputHarness />);

  await page.getByPlaceholder("Envoyer un message...").fill("  Bonjour  ");
  await page.getByRole("button", { name: "Envoyer" }).click();

  await expect(page.getByTestId("submitted")).toHaveText("Bonjour");
});

test("accepts photo selection", async ({ mount, page }) => {
  await mount(<MessageInputHarness />);

  const file = {
    name: "photo.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
      "base64"
    ),
  };

  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.getByTestId("photo-name")).toHaveText("photo.png");
});
