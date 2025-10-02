import type { Metadata } from "next";
import * as React from "react";
import {HeroUIProvider} from "@heroui/react";
import ServiceWorkerInit from '@/components/sw-init';
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: 'Chat Client',
  description: 'PWA de messagerie',
  manifest: '/manifest.json',
  themeColor: '#000000',
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
      <body>
        <ServiceWorkerInit />
        <HeroUIProvider>
            <header className="w-full flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
              <h1 className="text-lg font-semibold text-neutral-800">Chat Client</h1>
            </header>
            <main>
              {children}
            </main>
        </HeroUIProvider>
      </body>
    </html>
  );
}
