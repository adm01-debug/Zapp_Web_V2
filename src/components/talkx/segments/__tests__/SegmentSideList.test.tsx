import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';
import type { SegmentLike } from '../SegmentSideList';

// X112 — lista lateral "Meus Segmentos" (tela 03): abas com contadores reais,
// busca, funil (status/origem/tags), cartões e estrela otimista que volta ao
// valor do servidor quando a gravação falha. O componente é renderizado REAL;
// só o perfil (useAuth) vira stub, para o contador da aba "Meus".
//
// Radix Dialog mede o conteúdo com ResizeObserver; o jsdom não implementa a API
// (mesmo polyfill dos testes de catálogo existentes).
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'user-1' } }) }));

import { SegmentSideList } from '../SegmentSideList';

function seg(partial: Partial<SegmentLike> & { id: string; name: string }): SegmentLike {
  return {
    description: 'Descrição do segmento', origin: 'zapp', status: 'active', is_favorite: false,
    rules: { groups: [] }, estimated_count: 120, last_used_at: null,
    created_by: 'user-1', created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-05T12:00:00Z',
    ...partial,
  };
}

const SEGMENTS: SegmentLike[] = [
  seg({ id: 'a', name: 'Base ativa', tags: ['vip'], updated_at: '2026-10-08T12:00:00Z' }),
  seg({ id: 'b', name: 'Campeões RFM', origin: 'crm360', status: 'inactive', is_favorite: true, created_by: 'user-2', tags: ['rfm'], updated_at: '2026-10-06T12:00:00Z' }),
  seg({ id: 'c', name: 'Sem interação', origin: 'custom', updated_at: '2026-10-04T12:00:00Z' }),
];

function renderList(props: Partial<React.ComponentProps<typeof SegmentSideList>> = {}) {
  return render(
    <SegmentSideList segments={SEGMENTS} onSelect={vi.fn()} onNew={vi.fn()} {...props} />,
  );
}

/** Texto de cada cartão, na ordem em que a lista os mostra. */
function cards(): string[] {
  return within(screen.getByTestId('segment-side-list')).getAllByRole('listitem').map((li) => li.textContent ?? '');
}

describe('SegmentSideList · X112', () => {
  it('mostra os contadores reais das três abas', () => {
    renderList();

    expect(screen.getByRole('tab', { name: 'Todos 3' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Meus 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Favoritos 1' })).toBeInTheDocument();
  });

  it('a aba Meus mostra só os criados pelo usuário e Favoritos só os marcados', () => {
    renderList();

    fireEvent.click(screen.getByRole('tab', { name: 'Meus 2' }));
    expect(cards()).toHaveLength(2);
    expect(screen.getByText('Base ativa')).toBeInTheDocument();
    expect(screen.getByText('Sem interação')).toBeInTheDocument();
    expect(screen.queryByText('Campeões RFM')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Favoritos 1' }));
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('Campeões RFM')).toBeInTheDocument();
    expect(screen.queryByText('Base ativa')).not.toBeInTheDocument();
  });

  it('a busca reduz a lista pelo nome', () => {
    renderList();

    fireEvent.change(screen.getByLabelText('Buscar segmentos'), { target: { value: 'campe' } });

    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toContain('Campeões RFM');
  });

  it('o funil filtra por tag e por status', () => {
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Filtrar segmentos' }));
    fireEvent.click(screen.getByRole('button', { name: 'vip' }));
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toContain('Base ativa');

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(cards()).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Inativo' }));
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toContain('Campeões RFM');
  });

  it('favoritar reordena na hora e desfaz quando a gravação falha', async () => {
    const onToggleFavorite = vi.fn().mockRejectedValue(new Error('permission denied'));
    renderList({ onToggleFavorite });

    // Campeões RFM já é favorito e por isso abre a lista.
    expect(cards()[0]).toContain('Campeões RFM');

    fireEvent.click(screen.getByRole('button', { name: 'Favoritar Base ativa' }));

    // Antes da resposta: estrela marcada e cartão no topo.
    const marcada = screen.getByRole('button', { name: 'Remover favorito de Base ativa' });
    expect(marcada).toHaveAttribute('aria-pressed', 'true');
    expect(cards()[0]).toContain('Base ativa');
    expect(screen.getByRole('tab', { name: 'Favoritos 2' })).toBeInTheDocument();
    expect(onToggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), true);

    // A gravação falha: a marca e a ordem voltam ao valor do servidor.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Favoritar Base ativa' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Favoritar Base ativa' })).toHaveAttribute('aria-pressed', 'false');
    expect(cards()[0]).toContain('Campeões RFM');
    expect(screen.getByRole('tab', { name: 'Favoritos 1' })).toBeInTheDocument();
  });

  it('a estrela não carrega o segmento no construtor', () => {
    const onSelect = vi.fn();
    renderList({ onSelect });

    fireEvent.click(screen.getByRole('button', { name: 'Favoritar Base ativa' }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicar no cartão carrega o segmento no construtor', () => {
    const onSelect = vi.fn();
    renderList({ onSelect });

    fireEvent.click(screen.getByRole('button', { name: 'Abrir segmento Sem interação' }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });

  it('na gaveta (abaixo de 1280px) o mesmo conteúdo aparece no painel lateral', () => {
    renderList({ drawer: true, open: true, onOpenChange: vi.fn() });

    const painel = screen.getByRole('dialog');
    expect(within(painel).getByLabelText('Buscar segmentos')).toBeInTheDocument();
    expect(within(painel).getByRole('button', { name: 'Abrir segmento Base ativa' })).toBeInTheDocument();
    expect(within(painel).getByRole('tab', { name: 'Todos 3' })).toBeInTheDocument();
  });

  it('sem nenhum segmento mostra o estado vazio com a ação de criar', () => {
    renderList({ segments: [] });

    expect(screen.getByText('Nenhum segmento salvo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Criar segmento' })).toBeInTheDocument();
  });

  it('erro do servidor não vira lista vazia: mostra o estado de erro e o motivo real', () => {
    renderList({ segments: [], isError: true, error: new Error('permission denied for table talkx_segments'), onRetry: vi.fn() });

    expect(screen.getByText(/Não foi possível carregar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhum segmento salvo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ver detalhes/ }));
    expect(screen.getByText(/permission denied for table talkx_segments/)).toBeInTheDocument();
  });
});
