/**
 * @fileoverview Layout racine de l'application.
 * 
 * Wrapper principal fournissant:
 * - HeroUIProvider pour composants HeroUI stylisés
 * - UserProvider pour contexte utilisateur global
 * - Header sticky avec navigation + indicateur batterie
 * - Main container avec max-width pour responsive
 * 
 * Composant racine pour tous les enfants de layout.tsx.
 * 
 * @module components/app-shell
 */

"use client";

import { PropsWithChildren } from "react";
import Link from "next/link";
import { HeroUIProvider } from "@heroui/react";

import BatteryIndicator from "@/components/battery-indicator";
import { UserProvider } from "@/contexts/user-context";

/**
 * Composant racine AppShell.
 * 
 * Responsabilités:
 * 1. Initialise HeroUIProvider (UI library theme)
 * 2. Initialise UserProvider (auth context)
 * 3. Affiche header sticky avec nav + batterie
 * 4. Affiche main container avec max-width responsive
 * 
 * @param {React.PropsWithChildren} props - Children à afficher dans main
 * @returns {JSX.Element} Layout complet avec providers et header
 * 
 * @example
 * // Dans layout.tsx
 * import { AppShell } from "@/components/app-shell";
 * export default function RootLayout({ children }) {
 *   return <AppShell>{children}</AppShell>;
 * }
 */
export function AppShell({ children }: PropsWithChildren) {
  return (
    <HeroUIProvider>
      <UserProvider>
        {/* Header sticky avec navigation */}
        <header className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 sticky top-0 z-50">
          <Link href="/" className="text-lg font-semibold text-neutral-800 hover:text-neutral-600 transition">
            Chat Client
          </Link>
          
          {/* Navigation principale */}
          <nav className="flex flex-wrap items-center gap-3 text-sm text-neutral-600">
            <Link className="hover:text-neutral-900 transition" href="/reception">
              Reception
            </Link>
            <Link className="hover:text-neutral-900 transition" href="/camera">
              Camera
            </Link>
            <Link className="hover:text-neutral-900 transition" href="/gallery">
              Galerie
            </Link>
          </nav>
          
          {/* Indicateur batterie device */}
          <BatteryIndicator />
        </header>
        
        {/* Contenu principal avec max-width */}
        <main className="mx-auto w-full max-w-5xl">
          {children}
        </main>
      </UserProvider>
    </HeroUIProvider>
  );
}
