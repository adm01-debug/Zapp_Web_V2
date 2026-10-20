/**
 * chore(perf) — o prefetch por hover do item de menu não tinha efeito:
 * `usePrefetchOnHover` chamava `prefetchQuery({ queryKey, staleTime })` SEM
 * `queryFn`, e 6 das 8 chaves mapeadas (['contacts'], ['messages'],
 * ['dashboard-stats'], ['team-members'], ['knowledge-base-articles'],
 * ['queues']) não correspondem a nenhuma query real do app — o prefetch
 * falhava em silêncio. O prefetch de CHUNKS que funciona continua em
 * `components/performance/hotRoutePrefetch.ts` (fora deste arquivo).
 *
 * Esta é a prova (vermelho antes da correção, verde depois): passar o mouse
 * pelo item de menu NÃO pode disparar `prefetchQuery` nenhuma na tela.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutDashboard } from 'lucide-react';
import { SidebarNavItem } from '@/components/layout/SidebarNavItem';

const item = { id: 'inbox', icon: LayoutDashboard, label: 'Caixa de entrada' };

function renderItem() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const prefetchSpy = vi.spyOn(queryClient, 'prefetchQuery');
  render(
    <QueryClientProvider client={queryClient}>
      <SidebarNavItem
        item={item}
        currentView="dashboard"
        onViewChange={vi.fn()}
        collapsed={false}
      />
    </QueryClientProvider>
  );
  return { prefetchSpy, queryClient };
}

describe('SidebarNavItem — hover não dispara prefetch (chore/perf)', () => {
  it('não chama prefetchQuery ao passar o mouse', () => {
    const { prefetchSpy } = renderItem();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Caixa de entrada' }));
    expect(prefetchSpy).not.toHaveBeenCalled();
    cleanup();
  });

  it('não deixa nenhuma query de hover no cache', () => {
    const { queryClient } = renderItem();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Caixa de entrada' }));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    cleanup();
  });
});
