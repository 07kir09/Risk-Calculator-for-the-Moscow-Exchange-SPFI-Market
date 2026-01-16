import "@testing-library/jest-dom";
import { jest } from "@jest/globals";

// JSDOM может не иметь crypto.randomUUID — используем стабильный мок для тестов.
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => "test-uuid",
  },
});

// Для download в тестах.
Object.defineProperty(globalThis.URL, "createObjectURL", {
  value: jest.fn(() => "blob:mock"),
});
Object.defineProperty(globalThis.URL, "revokeObjectURL", {
  value: () => {},
});

Object.defineProperty(HTMLAnchorElement.prototype, "click", {
  value: jest.fn(),
});

// Отключаем onboarding‑модалку в тестах, чтобы не ломала селекторы.
localStorage.setItem("onboarding_seen_v1", "1");
