/**
 * X053 / T17-008 — indicador de campanha em andamento do cabeçalho do módulo.
 *
 * Casos do aceite: 0 campanhas ativas → não renderiza; 2 → nome da mais recente no
 * cartão e menu com as 2; clique no item navega (`onOpen(id)`). A mais recente sai do
 * `started_at`, não da ordem do array — o caso 2 passa a lista com a MAIS NOVA EM
 * SEGUNDO lugar de propósito: se a ordenação sumisse, o cartão mostraria a antiga.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ActiveCampaignIndicator, type ActiveCampaign } from '../ActiveCampaignIndicator';

// Radix (DropdownMenu) mede o gatilho com ResizeObserver, API ausente no jsdom.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const ANTIGA: ActiveCampaign = { id: 'c1', name: 'Campanha Antiga', status: 'sending', started_at: '2026-10-09T10:00:00.000Z' };
const NOVA: ActiveCampaign = { id: 'c2', name: 'Campanha Nova', status: 'sending', started_at: '2026-10-09T12:00:00.000Z' };

function abrirMenu() {
  fireEvent.keyDown(screen.getByRole('button', { name: /Campanhas em andamento/ }), { key: 'ArrowDown' });
}

describe('ActiveCampaignIndicator — cartão de campanha ativa (X053)', () => {
  it('sem campanha ativa não desenha o cartão (rascunho não conta)', () => {
    const { container } = render(
      <ActiveCampaignIndicator
        campaigns={[{ id: 'd1', name: 'Rascunho', status: 'draft', started_at: null }]}
        onOpen={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('listagem vazia não desenha o cartão', () => {
    const { container } = render(<ActiveCampaignIndicator campaigns={[]} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('2 ativas: mostra a mais recente, "Iniciada às HH:mm" e o menu com as 2', () => {
    render(<ActiveCampaignIndicator campaigns={[ANTIGA, NOVA]} onOpen={vi.fn()} />);

    expect(screen.getByText('Campanha Nova')).toBeInTheDocument();
    expect(screen.getByText(/^Iniciada às \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    // a antiga NÃO aparece no cartão fechado — ela só existe no menu
    expect(screen.queryByText('Campanha Antiga')).not.toBeInTheDocument();

    abrirMenu();
    const itens = screen.getAllByRole('menuitem');
    expect(itens).toHaveLength(2);
    expect(itens[0].textContent).toContain('Campanha Nova');
    expect(itens[1].textContent).toContain('Campanha Antiga');
  });

  it('o clique no item abre aquela campanha', () => {
    const onOpen = vi.fn();
    render(<ActiveCampaignIndicator campaigns={[ANTIGA, NOVA]} onOpen={onOpen} />);

    abrirMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Campanha Antiga/ }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith('c1');
  });

  it('campanha pausada aparece como Pausada (âmbar), não como Em andamento', () => {
    render(<ActiveCampaignIndicator campaigns={[{ ...ANTIGA, status: 'paused' }]} onOpen={vi.fn()} />);

    expect(screen.getByText('Pausada')).toBeInTheDocument();
    expect(screen.queryByText('Em andamento')).not.toBeInTheDocument();
  });
});
