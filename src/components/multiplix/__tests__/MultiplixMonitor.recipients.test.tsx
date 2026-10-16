/**
 * R2-MOD-022 (aceite 2) — "erro de leitura nao aparece como lista vazia confirmada".
 *
 * O monitor lia `const { data: recipients = [] } = useMultiplixRecipients(...)`: numa
 * rejeicao da edge o `data` nao existia, o array caia no default `[]` e a tela dizia
 * "Nenhum destinatario encontrado" — o operador lia um disparo sem destinatarios onde
 * havia uma FALHA de leitura. Este teste fixa a diferenca:
 *  1. erro na consulta de destinatarios -> aviso de falha e NUNCA o vazio confirmado;
 *  2. lista vazia de verdade (consulta OK) -> "Nenhum destinatario encontrado";
 *  3. o total do servidor (a continuacao) aparece na tela, e a amostra e rotulada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  recipients: { rows: [] as unknown[], total: null as number | null, truncated: false },
  recipientsError: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    // O monitor abre um canal realtime; o encadeamento e o mesmo do componente.
    channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
    removeChannel: () => {},
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/hooks/integrations/useMultiplixDispatches', () => ({
  useMultiplixDispatch: () => ({
    data: {
      id: 'd1', name: 'Disparo R2-MOD-022', message_template: 'oi', status: 'sending',
      total_recipients: 3, sent_count: 1, failed_count: 0, delivered_count: 0,
      outcome_unknown_count: 0, started_at: null, paused_at: null, pause_reason: null,
      completed_at: null, created_at: '2026-10-06T10:00:00Z',
    },
  }),
  useMultiplixRecipients: () => ({
    data: h.recipients,
    isError: h.recipientsError !== null,
    error: h.recipientsError,
  }),
  useMultiplixDispatchAction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // F51 (TL-029): o monitor tambem usa o confirm do rascunho — o mock do modulo
  // precisa expor o hook, senao o componente chama uma funcao inexistente.
  useConfirmMultiplixDispatch: () => ({ mutateAsync: vi.fn(), isPending: false }),
  fetchMultiplixRecipientsTotal: () => Promise.resolve(0),
}));

import { MultiplixMonitor } from '@/components/multiplix/MultiplixMonitor';

function recipientRow(id: string) {
  return {
    id,
    company_name_snapshot: `Empresa ${id}`,
    destino_e164: '+5511999999999',
    status: 'failed',
    sent_at: null,
    error_message: null,
    personalized_message: null,
  };
}

function renderMonitor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MultiplixMonitor dispatchId="d1" onBack={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.recipients = { rows: [], total: null, truncated: false };
  h.recipientsError = null;
});

describe('MultiplixMonitor — falha x vazio na lista de destinatarios (R2-MOD-022)', () => {
  it('mostra a falha de leitura e NUNCA o vazio confirmado quando a consulta rejeita', () => {
    h.recipientsError = new Error('Edge Function returned a non-2xx status code');

    renderMonitor();

    expect(screen.getByText(/Não foi possível carregar os destinatários/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhum destinatário encontrado')).toBeNull();
  });

  it('mostra "Nenhum destinatário encontrado" quando a consulta respondeu vazio de verdade', () => {
    h.recipients = { rows: [], total: 0, truncated: false };

    renderMonitor();

    expect(screen.getByText('Nenhum destinatário encontrado')).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível carregar os destinatários/)).toBeNull();
  });

  it('mostra o total do servidor e rotula a amostra quando a lista foi truncada', () => {
    h.recipients = {
      rows: Array.from({ length: 500 }, (_, i) => recipientRow(`r${i + 1}`)),
      total: 1500,
      truncated: true,
    };

    renderMonitor();

    // 500 carregados de 1.500 no servidor — a continuacao nao foi descartada.
    expect(screen.getByText(/500 de 1\.500/)).toBeInTheDocument();
    expect(screen.getByText(/amostra/i)).toBeInTheDocument();
  });
});
