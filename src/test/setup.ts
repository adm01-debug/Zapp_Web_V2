import "@testing-library/jest-dom";
import { expect, vi } from "vitest";
// CT-67 — matcher de acessibilidade do axe (`expect(container).toHaveNoViolations()`)
// disponível para TODA a suíte via `setupFiles` (vitest.config.ts). O matcher
// vem de `vitest-axe/dist/matchers` e não do atalho público
// `vitest-axe/matchers`: o `matchers.d.ts` da RAIZ do pacote 0.1.0 é
// `export type * from "./dist/matchers"` — re-export só de tipos — e o TS
// então acusa TS1362 ("cannot be used as a value") ao registrar o matcher. O
// subpath `dist/matchers` está no `files` publicado e re-exporta o valor de
// verdade; o runtime é idêntico (o atalho da raiz só faz `export * from`).
// `AxeMatchers` traz a tipagem e é estendido no módulo `vitest` abaixo —
// mesmo mecanismo que o `@testing-library/jest-dom` usa para registrar as
// asserções dele.
import { toHaveNoViolations } from "vitest-axe/dist/matchers";
import type { AxeMatchers } from "vitest-axe/dist/matchers";

declare module "vitest" {
  // O matcher do axe entra no `Assertion`/`AsymmetricMatchersContaining` do
  // vitest. A interface "vazia" que só estende o mixin é o único jeito de
  // fazer a augmentation — mesmo padrão do `vitest-axe/dist/extend-expect`
  // (que usa o namespace global `Vi`, inócuo no Vitest 4).
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
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

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});
