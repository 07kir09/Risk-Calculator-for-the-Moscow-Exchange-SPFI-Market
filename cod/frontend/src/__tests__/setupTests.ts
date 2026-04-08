import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";
import { jest } from "@jest/globals";

jest.mock("framer-motion", () => {
  const React = require("react");

  const createMotionComponent = (tag = "div") =>
    React.forwardRef(({ children, ...props }: any, ref) => React.createElement(tag, { ref, ...props }, children));

  const motion = new Proxy(
    {},
    {
      get: (_target, key) => createMotionComponent(typeof key === "string" ? key : "div"),
    }
  );

  return {
    __esModule: true,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
    motion,
    useInView: () => true,
  };
});

configure({ asyncUtilTimeout: 5000 });
jest.setTimeout(15000);

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

// Framer Motion использует viewport observers, которых нет в jsdom.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [0];

  disconnect() {}

  observe() {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve() {}
}

Object.defineProperty(globalThis, "IntersectionObserver", {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

beforeEach(() => {
  localStorage.clear();
  // Отключаем onboarding‑модалку в тестах, чтобы не ломала селекторы.
  localStorage.setItem("onboarding_seen_v1", "1");
});
