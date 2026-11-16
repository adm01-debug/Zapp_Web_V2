import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * X053 — indicador de campanha em andamento no cabeçalho do módulo.
 *
 * O que esta prova cobre:
 * 1. Sem campanhas ativas, o cartão não é renderizado;
 * 2. Com 2 campanhas (sending + paused), mostra a mais recente no topo;
 * 3. Pausada aparece com rótulo em âmbar;
 * 4. Clique em item do menu chama onOpen com o id correto.
 */

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

import { ActiveCampaignIndicator } from '../kit/ActiveCampaignIndicator';
import type { ActiveCampaign } from '../kit/ActiveCampaignIndicator';

const sending: ActiveCampaign = {
  id: 'c-sending', name: 'Camp Sending', status: 'sending',
  started_at: '2026-10-09T10:00:00.000Z',
};
const paused: ActiveCampaign = {
  id: 'c-paused', name: 'Camp Pausada', status: 'paused',
  started_at: '2026-10-09T09:00:00.000Z',
};
const completed: ActiveCampaign = {
  id: 'c-done', name: 'Camp Pronta', status: 'completed',
  started_at: '2026-10-08T08:00:00.000Z',
};

describe('X053 · ActiveCampaignIndicator', () => {
  it('não renderiza nada quando não há campanhas ativas', () => {
    const { container } = render(
      <ActiveCampaignIndicator campaigns={[completed]} onOpen={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('não renderiza nada quando a lista está vazia', () => {
    const { container } = render(
      <ActiveCampaignIndicator campaigns={[]} onOpen={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('mostra a campanha ativa mais recente (sending sobre paused)', () => {
    render(<ActiveCampaignIndicator campaigns={[paused, sending]} onOpen={vi.fn()} />);
    expect(screen.getByText('Camp Sending')).toBeTruthy();
  });

  it('paused aparece com rótulo "Pausada" no botão', () => {
    render(<ActiveCampaignIndicator campaigns={[paused]} onOpen={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Campanhas em andamento/i });
    expect(trigger.textContent).toContain('Pausada');
  });

  it('clique num item do menu chama onOpen com o id correto', () => {
    const onOpen = vi.fn();
    render(<ActiveCampaignIndicator campaigns={[sending, paused]} onOpen={onOpen} />);
    const trigger = screen.getByRole('button', { name: /Campanhas em andamento/i });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const item = screen.getByRole('menuitem', { name: /Camp Pausada/i });
    fireEvent.click(item);
    expect(onOpen).toHaveBeenCalledWith('c-paused');
  });
});
