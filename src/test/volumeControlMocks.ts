/**
 * Registro ÚNICO dos mocks comuns aos testes de componente dos controles de volume
 * (alertas e mídias). Os arquivos de teste importam este módulo (efeito colateral)
 * em vez de repetir o mesmo bloco de `vi.mock(...)` — a repetição era exatamente o
 * que o SonarCloud contava como duplicação em código novo.
 */
import React from 'react';
import { vi } from 'vitest';

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  getLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn() })),
  createLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), withCorrelation: vi.fn() })),
}));

vi.mock('framer-motion', () => {
  // Um elemento estático por tag: descarta as props de animação e devolve a tag nativa,
  // preservando `className`/`data-*` que os testes leem do DOM.
  const semAnimacao = (tag: 'div' | 'span') =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    motion: { div: semAnimacao('div'), span: semAnimacao('span') },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    // O `VolumeDial` (e a entrada do painel) consultam o movimento reduzido; nos testes de
    // componente tratamos como "movimento reduzido LIGADO": o dial mostra o valor direto e
    // nenhuma animação fica pendente entre asserções (o teste dedicado do dial cobre a
    // contagem animada, que o jsdom não traz).
    useReducedMotion: () => true,
    animate: () => ({ stop: () => {} }),
  };
});

// jsdom não traz ResizeObserver, que o Popper do Radix usa para medir o conteúdo
// do popover. Stub mínimo (atribuição direta, para sobreviver ao `unstubAllGlobals`).
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}
