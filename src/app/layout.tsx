import type { Metadata } from "next";
import Link from "next/link";
import * as React from "react";
import { HeroUIProvider } from "@heroui/react";
import ServiceWorkerInit from "@/components/sw-init";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Chat Client",
  description: "PWA de messagerie",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/x-icon" href="/images/icons/Logo-192x192.png" />
        <link rel="manifest" href="manifest.json" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="min-h-screen bg-neutral-50">
        <ServiceWorkerInit />
        <HeroUIProvider>
          <header className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3">
            <Link href="/" className="text-lg font-semibold text-neutral-800">
              Chat Client
            </Link>
            <nav className="flex gap-3 text-sm text-neutral-600">
              <Link className="hover:text-neutral-900" href="/camera">
                Camera
              </Link>
              <Link className="hover:text-neutral-900" href="/gallery">
                Galerie
              </Link>
            </nav>
          </header>
          <main className="mx-auto w-full max-w-5xl">
            {children}
          </main>
        </HeroUIProvider>
      </body>
    </html>
  );
}
