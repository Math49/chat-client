import BatteryIndicator from "@/components/battery-indicator";
import { test, expect } from "./fixtures";

test("renders charging state from Battery API", async ({ mount, page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "getBattery", {
      value: () =>
        Promise.resolve({
          charging: true,
          level: 0.5,
          addEventListener: () => {},
          removeEventListener: () => {},
        }),
      configurable: true,
    });
  });
  await page.reload();

  await mount(<BatteryIndicator />);

  await expect(page.getByText("50%")).toBeVisible();
  await expect(page.getByText("en charge")).toBeVisible();
});
