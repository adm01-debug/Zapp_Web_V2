import "@testing-library/jest-dom";
import { expect, vi } from "vitest";
import { toHaveNoViolations } from "vitest-axe/dist/matchers";
import type { AxeMatchers } from "vitest-axe/dist/matchers";

declare module "vitest" {
  interface Assertion<T = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

expect.extend({ toHaveNoViolations });

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: MockResizeObserver,
});
Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: MockResizeObserver,
});

const HOST_SUPABASE = /(^|\.)supabase\.(co|in)$/i;
const fetchReal = globalThis.fetch;

globalThis.fetch = ((input: unknown, init?: unknown) => {
  const url =
    typeof input === 'string'
      ? input
      : ((input as { url?: string } | null)?.url ?? String(input));
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // URL relativa (jsdom) ou entrada nao-URL: segue o fluxo normal.
  }
  if (HOST_SUPABASE.test(host)) {
    return Promise.reject(
      new Error(
        `[guarda-de-rede] teste tentou falar com o Supabase REAL (${host}). ` +
          'Mocke o modulo que faz a chamada (ex.: ' +
          'vi.mock("@/integrations/supabase/client")) ou o hook ' +
          '(ex.: vi.mock("@/hooks/integrations/useCatalogRecentSends")). ' +
          'Teste nao fala com producao.'
      )
    );
  }
  return (fetchReal as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
}) as typeof fetch;