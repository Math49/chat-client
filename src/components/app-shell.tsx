"use client";

import { PropsWithChildren } from "react";
import Link from "next/link";
import { HeroUIProvider } from "@heroui/react";

import BatteryIndicator from "@/components/battery-indicator";
import { UserProvider } from "@/contexts/user-context";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <HeroUIProvider>
      <UserProvider>
        <header className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-neutral-800">
            Chat Client
          </Link>
          <nav className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
            <Link className="hover:text-neutral-900" href="/reception">
              Reception
            </Link>
            <Link className="hover:text-neutral-900" href="/camera">
              Camera
            </Link>
            <Link className="hover:text-neutral-900" href="/gallery">
              Galerie
            </Link>
          </nav>
          <BatteryIndicator />
        </header>
        <main className="mx-auto w-full max-w-5xl">{children}</main>
      </UserProvider>
    </HeroUIProvider>
  );
}
