/**
 * [refazer 1] ponto 1 (t_82388172): os filtros salvos viviam SÓ dentro do
 * popover "Filtros" — quem nunca abria o painel nem sabia que existiam.
 * `SavedFilterChips` expõe a lista salva como linha de chips rápidos sempre
 * visível acima da lista (como a linha de chips de etapa).
 *
 * Aqui provo, contra o código real (hook mockado, componente real):
 * - os chips aparecem SEM abrir popover nenhum;
 * - clicar reaplica o filtro (converte datas, fila, tipo e showAll);
 * - sem filtro salvo, nada é renderizado (sem bloco vazio no layout).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { SavedFilterChips } from '../SavedFilterChips';
import type { SavedFilter } from '@/hooks/chat/useSavedFilters';

let salvos: SavedFilter[] = [];

vi.mock('@/hooks/chat/useSavedFilters', () => ({
  useSavedFilters: () => ({ filters: salvos, isLoading: false }),
}));

const SALVO_VIP: SavedFilter = {
  id: 'f1',
  name: 'Só VIP',
  filters: {
    status: ['unread'],
    tags: ['vip'],
    agentId: 'p1',
    contactType: 'individual',
    queueId: 'q1',
    showAll: true,
    dateRange: { from: '2026-10-01', to: '2026-10-08' },
  },
  is_default: false,
  is_shared: false,
  user_id: 'u1',
  created_at: '2026-10-09T12:00:00.000Z',
};

describe('SavedFilterChips — linha de chips rápidos sempre visível', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    salvos = [SALVO_VIP];
  });

  it('mostra os filtros salvos SEM abrir popover nenhum', () => {
    const onFiltersChange = vi.fn();
    render(
      <SavedFilterChips
        onFiltersChange={onFiltersChange}
        onContactTypeChange={vi.fn()}
        onQueueChange={vi.fn()}
        onShowAllChange={vi.fn()}
      />,
    );
    // Nenhum clique em "Filtros" aconteceu — o chip já está na tela.
    expect(screen.getByRole('button', { name: /Só VIP/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filtros salvos' })).toBeInTheDocument();
  });

  it('clicar no chip reaplica o filtro salvo (datas, fila, tipo, showAll)', () => {
    const onFiltersChange = vi.fn();
    const onContactTypeChange = vi.fn();
    const onQueueChange = vi.fn();
    const onShowAllChange = vi.fn();
    render(
      <SavedFilterChips
        onFiltersChange={onFiltersChange}
        onContactTypeChange={onContactTypeChange}
        onQueueChange={onQueueChange}
        onShowAllChange={onShowAllChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Só VIP/ }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith({
      status: ['unread'],
      tags: ['vip'],
      agentId: 'p1',
      dateRange: { from: new Date('2026-10-01'), to: new Date('2026-10-08') },
    });
    expect(onContactTypeChange).toHaveBeenCalledWith('individual');
    expect(onQueueChange).toHaveBeenCalledWith('q1');
    expect(onShowAllChange).toHaveBeenCalledWith(true);
  });

  it('sem filtro salvo não renderiza nada (sem bloco vazio no layout)', () => {
    salvos = [];
    const { container } = render(<SavedFilterChips onFiltersChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('group', { name: 'Filtros salvos' })).not.toBeInTheDocument();
  });
});
