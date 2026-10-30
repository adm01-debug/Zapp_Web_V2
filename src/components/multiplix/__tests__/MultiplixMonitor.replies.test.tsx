/**
 * F84 / TL-044 — Sala de retornos no MultiplixMonitor: visao filtrada do Chat com
 * SO quem respondeu. Usa o hook REAL `useMultiplixReplies`; o mock fica no nivel do
 * `supabase.functions.invoke` (formato `data.by_recipient` da TL-044A) e da tabela
 * `contacts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  contacts: [] as { id: string; phone: string }[],
  openContactChat: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) },
    functions: { invoke: (...args: unknown[]) => h.invoke(...args) },
    from: () => {
      let wanted: string[] = [];
      const b = {
        select: () => b,
        or: (f: string) => { wanted = f.split(',').map((p) => p.replace(/^phone\.eq\./, '')); return b; },
        order: () => b,
        limit: () => Promise.resolve({ data: h.contacts.filter((c) => wanted.includes(c.phone)), error: null }),
      };
      return b;
    },
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/catalog/useSendProduct', () => ({ openContactChat: h.openContactChat }));

// Hook de retornos e invokeMultiplixDispatch ficam REAIS; so os demais hooks do monitor sao stub.
vi.mock('@/hooks/integrations/useMultiplixDispatches', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/integrations/useMultiplixDispatches')>()),
  useMultiplixDispatch: () => ({
    data: {
      id: 'd1', name: 'Disparo', message_template: 'oi', status: 'sending',
      total_recipients: 3, sent_count: 1, failed_count: 0, delivered_count: 0,
      outcome_unknown_count: 0, completed_at: null, pause_reason: null, dispatch_version: 1,
    },
  }),
  useMultiplixRecipients: () => ({ data: { rows: [], total: 0, truncated: false }, isError: false, isPending: false }),
  useMultiplixDispatchAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  fetchMultiplixRecipientsTotal: () => Promise.resolve(0),
  useMultiplixEstimate: () => ({ data: undefined, isError: false }),
}));

import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';

const statusBody = (rows: Record<string, unknown>[]) => ({ data: { data: { by_recipient: rows }, meta: {} }, error: null });
const row = (o: Record<string, unknown>) => ({
  recipient_id: 'r', company_id: null, company_name: 'Empresa', destino_e164: '+5511999990001',
  replied_at: null, reply_attribution: null, ...o,
});

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.invoke.mockReset();
  h.openContactChat.mockReset();
  h.contacts = [];
});

describe('MultiplixMonitor — Sala de retornos (F84)', () => {
  it('lista so quem respondeu, com atribuicao legivel e abre a conversa pelo contact_id', async () => {
    h.contacts = [
      { id: 'c-linked', phone: '+5511999990001' },
      { id: 'c-inferred', phone: '+5511999990002' },
    ];
    h.invoke.mockResolvedValue(statusBody([
      row({ recipient_id: 'r1', company_name: 'Alfa', destino_e164: '+5511999990001', replied_at: '2026-10-10T12:00:00Z', reply_attribution: 'linked' }),
      row({ recipient_id: 'r2', company_name: 'Beta', destino_e164: '+5511999990002', replied_at: '2026-10-09T12:00:00Z', reply_attribution: 'inferred' }),
      row({ recipient_id: 'r3', company_name: 'Gama', destino_e164: '+5511999990003' }),
    ]));

    renderMonitor();
    const rows = await screen.findAllByTestId('reply-row');

    expect(rows).toHaveLength(2);
    expect(screen.queryByText('Gama')).toBeNull();
    expect(within(rows[0]).getByText('Alfa')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Respondeu à mensagem do disparo')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/10 out 2026/)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/associada pelo telefone/)).toBeInTheDocument();

    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Abrir conversa' }));
    expect(h.openContactChat).toHaveBeenCalledWith('c-linked');
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Abrir conversa' }));
    expect(h.openContactChat).toHaveBeenLastCalledWith('c-inferred');
  });

  it('retorno sem contato unico (contact_id null) nao tem botao de abrir conversa', async () => {
    h.contacts = [];
    h.invoke.mockResolvedValue(statusBody([
      row({ recipient_id: 'r1', company_name: 'Alfa', replied_at: '2026-10-10T12:00:00Z', reply_attribution: 'linked' }),
    ]));

    renderMonitor();
    const rows = await screen.findAllByTestId('reply-row');

    expect(rows).toHaveLength(1);
    expect(within(rows[0]).queryByRole('button', { name: 'Abrir conversa' })).toBeNull();
    expect(h.openContactChat).not.toHaveBeenCalled();
  });

  it('servidor confirmou zero retornos: mostra o vazio, nao erro', async () => {
    h.invoke.mockResolvedValue(statusBody([row({ recipient_id: 'r1' })]));

    renderMonitor();

    expect(await screen.findByText('Nenhum retorno neste disparo ainda')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('erro de contrato da edge aparece como erro com "Tentar de novo", nunca como vazio', async () => {
    // edge anterior a TL-044A: by_recipient sem replied_at/reply_attribution
    h.invoke.mockResolvedValue(statusBody([{ recipient_id: 'r1', company_name: 'Alfa', destino_e164: '+5511999990001' }]));

    renderMonitor();

    expect(await screen.findByText(/Não foi possível carregar os retornos/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhum retorno neste disparo ainda')).toBeNull();

    h.invoke.mockResolvedValue(statusBody([
      row({ recipient_id: 'r1', replied_at: '2026-10-10T12:00:00Z', reply_attribution: 'linked' }),
    ]));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.getAllByTestId('reply-row')).toHaveLength(1));
  });

  it('mostra carregando enquanto a primeira leitura nao volta', async () => {
    h.invoke.mockReturnValue(new Promise(() => {}));
    renderMonitor();
    expect(await screen.findByText('Carregando retornos…')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum retorno neste disparo ainda')).toBeNull();
  });
});
