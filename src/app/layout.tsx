import type { Metadata } from "next";
import * as React from "react";
import {HeroUIProvider} from "@heroui/react";
import ServiceWorkerInit from '@/components/sw-init';
import {ThemeProvider} from '@/components/theme/theme-provider';
import {ThemeToggle} from '@/components/theme/theme-toggle';
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
        <script dangerouslySetInnerHTML={{__html: `(()=>{try{const t=localStorage.getItem('app-theme');if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`}} />
      </head>
      <body>
        <ServiceWorkerInit />
        <HeroUIProvider>
          <ThemeProvider>
            <header className="w-full flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900">
              <h1 className="text-lg font-semibold text-neutral-800 dark:text-neutral-100">Chat Client</h1>
              <ThemeToggle />
            </header>
            <main>
              {children}
            </main>
          </ThemeProvider>
        </HeroUIProvider>
      </body>
    </html>
  );
}
