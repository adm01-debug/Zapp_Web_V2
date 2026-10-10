/**
 * TL-042 (refazer 2) — painel de detalhe do destinatário no monitor.
 *
 * Prova o comportamento novo do `MultiplixMonitor`: clicar na linha abre o
 * detalhe com os dados reais (inclui attempt_count e external_id, que o título
 * do cartão exige), clicar de novo fecha, campos nulos aparecem como '—', o
 * erro sai legível (não o error_message cru) e a linha é operável por teclado
 * (role=button, Enter/Espaço, aria-expanded).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  rows: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useMultiplixDispatch: () => ({
    data: {
      id: 'd1', name: 'Disparo TL-042', message_template: 'oi', status: 'sending',
      dispatch_version: 2,
      total_recipients: 2, sent_count: 1, failed_count: 1, delivered_count: 0,
      outcome_unknown_count: 0, started_at: null, paused_at: null, pause_reason: null,
      completed_at: null, created_at: '2026-10-06T10:00:00Z',
    },
  }),
  useMultiplixRecipients: () => ({
    data: { rows: h.rows, total: (h.rows as unknown[]).length, truncated: false },
    isError: false,
    error: null,
    isPending: false,
  }),
  useMultiplixDispatchAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  fetchMultiplixRecipientsTotal: () => Promise.resolve(0),
}));

import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.rows = [
    {
      id: 'r-cheio',
      company_name_snapshot: 'Empresa Cheia',
      destino_e164: '+551****9999',
      status: 'failed',
      sent_at: '2026-10-06T11:00:00Z',
      delivered_at: null,
      error_message: 'Contato na lista negra (opt-out)',
      personalized_message: 'Olá, Empresa Cheia',
      attempt_count: 3,
      external_id: 'ext-123',
      eligibility: 'eligible',
      eligibility_reason: null,
      inclusion_reason: 'contato_pessoa',
    },
    {
      id: 'r-nulo',
      company_name_snapshot: null,
      destino_e164: null,
      status: 'pending',
      sent_at: null,
      delivered_at: null,
      error_message: null,
      personalized_message: null,
      attempt_count: null,
      external_id: null,
      eligibility: null,
      eligibility_reason: null,
      inclusion_reason: null,
    },
  ];
});

describe('MultiplixMonitor — detalhe do destinatário (TL-042)', () => {
  it('clicar na linha abre o detalhe com os dados reais; clicar de novo fecha', () => {
    renderMonitor();

    expect(screen.queryByLabelText('Detalhe do destinatário')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Empresa Cheia/ }));

    const detalhe = screen.getByLabelText('Detalhe do destinatário');
    expect(detalhe).toBeInTheDocument();
    expect(detalhe).toHaveTextContent('ext-123');
    expect(detalhe).toHaveTextContent('3');

    fireEvent.click(screen.getByRole('button', { name: /Empresa Cheia/ }));
    expect(screen.queryByLabelText('Detalhe do destinatário')).toBeNull();
  });

  it('mostra o erro de forma legível, sem vazar o error_message cru', () => {
    renderMonitor();

    fireEvent.click(screen.getByRole('button', { name: /Empresa Cheia/ }));

    const detalhe = screen.getByLabelText('Detalhe do destinatário');
    expect(detalhe).toHaveTextContent(/optou por não receber mensagens/);
    expect(detalhe).not.toHaveTextContent(/Contato na lista negra \(opt-out\)/);
  });

  it('campos nulos aparecem como — (sem "null"/"undefined" na tela)', () => {
    renderMonitor();

    fireEvent.click(screen.getByRole('button', { name: /sem nome/ }));

    const detalhe = screen.getByLabelText('Detalhe do destinatário');
    expect(detalhe).toHaveTextContent('—');
    expect(detalhe.textContent).not.toMatch(/null|undefined/);
  });

  it('a linha é operável por teclado (Enter abre, Espaço fecha, aria-expanded)', () => {
    renderMonitor();

    const linha = screen.getByRole('button', { name: /Empresa Cheia/ });
    expect(linha).toHaveAttribute('aria-expanded', 'false');

    fireEvent.keyDown(linha, { key: 'Enter' });
    expect(screen.getByLabelText('Detalhe do destinatário')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Empresa Cheia/ })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(screen.getByRole('button', { name: /Empresa Cheia/ }), { key: ' ' });
    expect(screen.queryByLabelText('Detalhe do destinatário')).toBeNull();
  });
});
