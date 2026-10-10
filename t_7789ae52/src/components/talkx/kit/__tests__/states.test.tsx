import { Info } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  StateShell,
  TalkXEmptyState,
  TalkXFilteredEmptyState,
  TalkXSkeletonRows,
  TalkXErrorState,
  TalkXCrmUnavailableState,
  TalkXWhatsAppDisconnectedState,
  TalkXNoPermissionState,
} from '../states';

/**
 * Compara texto "literal" ignorando apenas acentuação/diacríticos e espaços
 * redundantes. Os rótulos do mock 17 são conferidos palavra a palavra; a
 * normalização existe só porque a fonte do requisito veio sem acentos
 * ("Nao foi possivel carregar as campanhas") enquanto o componente os usa.
 */
function norm(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

afterEach(() => {
  cleanup();
});

describe('Estados do kit (prancha 17)', () => {
  // (1)
  it('TalkXEmptyState preset emptyCampaigns — titulo/descricao/botao literais e onAction', () => {
    const onAction = vi.fn();
    render(<TalkXEmptyState preset="emptyCampaigns" onAction={onAction} />);

    const region = screen.getByRole('status');
    const text = norm(region.textContent);
    expect(text).toContain('Nenhuma campanha encontrada');
    expect(text).toContain(
      'Crie sua primeira campanha no Talk X e comece a se conectar com seus clientes.',
    );

    const button = screen.getByRole('button', { name: /Nova Campanha/ });
    expect(norm(button.textContent)).toContain('Nova Campanha');

    fireEvent.click(button);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  // (2)
  it('TalkXFilteredEmptyState — botao "Limpar filtros" chama onClearFilters', () => {
    const onClearFilters = vi.fn();
    render(<TalkXFilteredEmptyState onClearFilters={onClearFilters} />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /Limpar filtros/ });
    expect(norm(button.textContent)).toContain('Limpar filtros');

    fireEvent.click(button);
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  // (3)
  it('TalkXSkeletonRows — aria-busy e aceita as 4 variantes (rows/cards/kpi/rail)', () => {
    const variants = ['rows', 'cards', 'kpi', 'rail'] as const;

    for (const variant of variants) {
      const { container, unmount } = render(
        <TalkXSkeletonRows rows={3} variant={variant} />,
      );
      const busy = container.querySelector('[aria-busy="true"]');
      expect(busy, `variante ${variant} deve expor aria-busy`).not.toBeNull();
      unmount();
    }
  });

  // (4)
  it('TalkXErrorState entity=campanhas — titulo literal, onRetry e "Ver detalhes" revela error.message', () => {
    const onRetry = vi.fn();
    const error = new Error('Falha exclusiva de rede: servidor X007 indisponivel');
    render(<TalkXErrorState entity="campanhas" error={error} onRetry={onRetry} />);

    const region = screen.getByRole('alert');
    expect(norm(region.textContent)).toContain('Nao foi possivel carregar as campanhas');

    const retry = screen.getByRole('button', { name: /Tentar novamente/ });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    const details = screen.getByRole('button', { name: /Ver detalhes/ });
    expect(screen.queryAllByText(error.message)).toHaveLength(0);

    fireEvent.click(details);
    expect(screen.queryAllByText(error.message).length).toBeGreaterThan(0);
  });

  // (5)
  it('TalkXCrmUnavailableState — "CRM 360 indisponivel" e onViewStatus', () => {
    const onViewStatus = vi.fn();
    render(<TalkXCrmUnavailableState onViewStatus={onViewStatus} />);

    expect(norm(screen.getByRole('status').textContent)).toContain('CRM 360 indisponivel');

    const button = screen.getByRole('button', { name: /Ver status dos serviços/ });
    fireEvent.click(button);
    expect(onViewStatus).toHaveBeenCalledTimes(1);
  });

  // (6)
  it('TalkXWhatsAppDisconnectedState — "Conectar WhatsApp" chama onConnect', () => {
    const onConnect = vi.fn();
    render(<TalkXWhatsAppDisconnectedState onConnect={onConnect} />);

    const button = screen.getByRole('button', { name: /Conectar WhatsApp/ });
    expect(norm(button.textContent)).toContain('Conectar WhatsApp');

    fireEvent.click(button);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  // (7)
  it('TalkXNoPermissionState — "Falar com o administrador" chama onContactAdmin', () => {
    const onContactAdmin = vi.fn();
    render(<TalkXNoPermissionState onContactAdmin={onContactAdmin} />);

    const button = screen.getByRole('button', { name: /Falar com o administrador/ });
    expect(norm(button.textContent)).toContain('Falar com o administrador');

    fireEvent.click(button);
    expect(onContactAdmin).toHaveBeenCalledTimes(1);
  });

  // (8)
  it('StateShell — role="status" e role="alert" na variante de erro', () => {
    const { unmount } = render(
      <StateShell icon={Info} tone="muted" title="Titulo de teste" description="Descricao de teste">
        <span>conteudo</span>
      </StateShell>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    unmount();

    render(<TalkXErrorState entity="campanhas" error={new Error('x')} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
