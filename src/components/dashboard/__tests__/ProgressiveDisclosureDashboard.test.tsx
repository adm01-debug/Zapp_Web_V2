import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { EnhancedProgressiveDisclosure } from '../ProgressiveDisclosureDashboard';

/**
 * L7 — o carimbo "Atualizado HH:mm" vinha de `new Date()` a cada render (hora do
 * desenho, não da busca). A prova aqui usa o cache do React Query de verdade:
 * com uma busca registrada em `['dashboard-kpi']`, o carimbo tem que ser a hora
 * do `dataUpdatedAt` dessa busca.
 */

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal();
  const motion = new Proxy(
      {},
      {
        get: () => (props: Record<string, unknown>) => {
          const { initial, animate, exit, transition, layoutId, variants, ...rest } = props;
          return React.createElement('div', rest);
        },
      },
    );
  return {
    ...actual,

    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
  };
});

function renderComCache(queryClient: QueryClient, ui: React.ReactNode) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('EnhancedProgressiveDisclosure — carimbo Atualizado (L7)', () => {
  it('mostra a hora da última busca do React Query e não a hora do desenho', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Busca de 3h atrás: a hora do desenho (agora) é diferente, então a prova
    // distingue o carimbo real do `new Date()` antigo.
    const buscaEm = Date.now() - 3 * 60 * 60 * 1000;
    queryClient.setQueryData(['dashboard-kpi'], { ok: true }, { updatedAt: buscaEm });
    const esperado = new Date(buscaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    renderComCache(
      queryClient,
      <EnhancedProgressiveDisclosure sections={[]} renderWidget={() => null} onRefresh={vi.fn()} />,
    );

    expect(screen.getByText(`Atualizado ${esperado}`)).toBeInTheDocument();
  });

  it('o botão Atualizar chama o refetch passado pelo pai', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onRefresh = vi.fn();

    renderComCache(
      queryClient,
      <EnhancedProgressiveDisclosure sections={[]} renderWidget={() => null} onRefresh={onRefresh} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
