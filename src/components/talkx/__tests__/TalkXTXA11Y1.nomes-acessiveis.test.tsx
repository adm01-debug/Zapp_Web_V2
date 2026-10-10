import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * TX-A11Y-1 [refazer 1] — nome e papel dos controles do Talk X.
 *
 * O DEFEITO (defeito 1 da recusa): três telas renderizavam controles sem nome
 * acessível — a barra de progresso do monitor (`role="progressbar"` sem
 * `aria-label`), os `SelectTrigger` de Categoria/Status do editor de templates
 * (`Label` sem `htmlFor` + `SelectTrigger` sem `id`) e os três `SelectTrigger`
 * da linha de condição de segmentos (sem `aria-label`).
 *
 * COMO A PROVA É FEITA: o teste MONTA os três componentes reais e consulta os
 * controles pelo papel + nome acessível, como um leitor de tela faz. Sem a
 * correção as consultas falham (vermelho); com ela, passam (verde). Nenhum
 * `getByTestId` nem leitura de texto-fonte: trocar o atributo no componente
 * muda o resultado.
 */

const h = vi.hoisted(() => ({
  status: 'sending' as string,
  startCampaign: vi.fn(),
  pauseCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
  updateCampaign: { mutateAsync: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const campanha = () => ({
    id: 'camp-1',
    name: 'Campanha Monitor A11Y',
    status: h.status,
    message_template: 'mensagem de teste',
    total_recipients: 10,
    sent_count: 3,
    delivered_count: 2,
    failed_count: 1,
    outcome_unknown_count: 0,
    started_at: null,
    completed_at: null,
    whatsapp_connection_id: null,
    created_at: '2026-10-05T10:00:00.000Z',
  });

  const resolveChain = (table: string, id: string | null) => {
    if (table === 'talkx_campaigns') {
      if (id !== 'camp-1') return Promise.resolve({ data: null, error: new Error('campanha inesperada: ' + id) });
      return Promise.resolve({ data: campanha(), error: null });
    }
    return Promise.resolve({ data: [], error: null });
  };

  const makeChain = (table: string) => {
    let id: string | null = null;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (col: string, value: unknown) => { if (col === 'id') id = String(value); return chain; };
    chain.order = () => chain;
    chain.limit = () => resolveChain(table, id);
    chain.single = () => resolveChain(table, id);
    return chain;
  };

  return {
    supabase: {
      from: (table: string) => makeChain(table),
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
      removeChannel: () => {},
    },
  };
});

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    startCampaign: h.startCampaign,
    pauseCampaign: h.pauseCampaign,
    cancelCampaign: h.cancelCampaign,
    updateCampaign: h.updateCampaign,
  }),
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), logEvent: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));

vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({ rateByMinute: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: [],
    isLoading: false,
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    duplicateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn(),
    fetchVariants: vi.fn(),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

import { TalkXLiveMonitor } from '../TalkXLiveMonitor';
import { TalkXTemplateEditor } from '../TalkXTemplateEditor';
import { RuleRow } from '../segments/RuleRow';

const tpl = {
  id: 'tpl-1', name: 'Boas-vindas', description: null, category: 'geral', content: 'olá {{nome}}',
  media_url: null, media_type: null, tags: [], status: 'approved' as const, use_count: 0, created_by: null,
  custom_variables: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

// Regra sobre campo enum (tem opções): renderiza os TRÊS selects (campo,
// operador e valor). É o caminho que o defeito 4 cobre.
const regraEnum = { id: 'r1', field: 'consent_status', op: 'eq', value: 'granted' } as never;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TX-A11Y-1 — nome acessível dos controles (defeito 1)', () => {
  it('monitor: a barra de progresso tem o nome "Progresso do envio"', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <TalkXLiveMonitor campaignId="camp-1" onBack={vi.fn()} />
      </QueryClientProvider>,
    );
    await screen.findByText('Campanha Monitor A11Y');
    expect(screen.getByRole('progressbar', { name: 'Progresso do envio' })).toBeTruthy();
  });

  it('editor de templates: os selects de Categoria e Status têm nome via rótulo', () => {
    render(
      <TalkXTemplateEditor templates={[tpl as never]} isLoading={false} editing={tpl as never} onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText('Categoria')).toBeTruthy();
    expect(screen.getByLabelText('Status')).toBeTruthy();
  });

  it('linha de condição: os três selects têm nome (campo, operador e valor)', () => {
    render(<RuleRow rule={regraEnum} onChange={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Campo da condição' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Operador da condição' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Valor da condição' })).toBeTruthy();
  });
});
