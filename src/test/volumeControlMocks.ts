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
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

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
