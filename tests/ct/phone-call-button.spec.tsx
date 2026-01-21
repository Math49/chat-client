import { PhoneCallButton } from "@/components/phone-call-button";
import { test, expect } from "./fixtures";

test("enables for valid number when tel protocol is supported", async ({ mount, page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "tel", {
      value: true,
      configurable: true,
    });
  });
  await page.reload();

  await mount(<PhoneCallButton phoneNumber="06 12 34 56 78" />);

  await expect(page.getByRole("button", { name: "Appeler" })).toBeEnabled();
});

test("disables for invalid number", async ({ mount, page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "tel", {
      value: true,
      configurable: true,
    });
  });
  await page.reload();

  await mount(<PhoneCallButton phoneNumber="123" />);

  await expect(page.getByRole("button", { name: "Appeler" })).toBeDisabled();
});
