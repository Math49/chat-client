/**
 * Jest setup file
 * Initialise l'environnement de test avec les dépendances globales
 */

import "@testing-library/jest-dom";

// Mock de l'API crypto pour les tests
if (typeof global.crypto === "undefined") {
  global.crypto = {
    randomUUID: () =>
      `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  } as any;
}

// Mock de localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
});
