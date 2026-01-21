import { test as base, expect } from "@playwright/experimental-ct-react";
import { HeroUIProvider } from "@heroui/react";
import { UserProvider } from "@/contexts/user-context";
import "@/styles/globals.css";

export const test = base.extend({
  mount: async ({ mount }, use) => {
    await use(async (component, options) => {
      return mount(
        <HeroUIProvider>
          <UserProvider>{component}</UserProvider>
        </HeroUIProvider>,
        options
      );
    });
  },
});

export { expect };
