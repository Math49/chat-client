import type { Metadata } from "next";
import ServiceWorkerInit from "@/components/sw-init";
import { AppShell } from "@/components/app-shell";
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
    <html lang="fr">
      <head>
        <link rel="icon" type="image/x-icon" href="/images/icons/Logo-192x192.png" />
        <link rel="manifest" href="manifest.json" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body className="min-h-screen bg-neutral-50">
        <ServiceWorkerInit />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
