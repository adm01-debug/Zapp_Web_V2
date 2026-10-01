import { vi } from 'vitest';

/**
 * Mocks e polyfills compartilhados pelos testes do módulo de catálogo.
 *
 * Antes, cada arquivo de teste repetia este mesmo bloco (mock do `sonner`,
 * polyfill de `ResizeObserver` do Radix e mock dos hooks de catálogo) — o que
 * derrubava a métrica de duplicação do SonarCloud (`new_duplicated_lines_density`)
 * sem indicar defeito de código. Extraído para um único módulo de `vi.mock`
 * (lição do Sonar: "mocks repetidos contam").
 */

// CT-59 — o 429 dispara toast do sonner; sem mock, o módulo real montaria o
// Toaster e o teste não conseguiria inspecionar a chamada.
const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: toastError, success: vi.fn() }),
}));

// Radix Select/Slider medem o trigger com `ResizeObserver` (via
// `@radix-ui/react-use-size`), API que o jsdom não implementa e o setup global
// (`src/test/setup.ts`) não faz polyfill (só de `IntersectionObserver`).
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

export { toastError };
