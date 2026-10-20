/**
 * TL-162 (X159) — "Checklist para retomar" da campanha pausada (tela 13).
 *
 * Renderiza o componente REAL com o hook REAL; o Supabase é o único mock (as
 * leituras do precheck e a gravação CAP-056). Prova:
 *  - `window_open=false` → item 3 com "Fora do horário de envio" e selo "Atenção";
 *  - template `approved` → item 2 "Todos os templates OK" e "Verificado agora";
 *  - marcação salva na pausa atual volta marcada ao reabrir a tela;
 *  - marcar o item 1 chama `log_talkx_campaign_checklist` com a chave do item.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, { data?: unknown; count?: number | null; error?: unknown }>,
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    rpcResults: {} as Record<string, { data?: unknown; error?: unknown }>,
  };

  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'order', 'limit', 'maybeSingle', 'single']) {
        q[method] = () => q;
      }
      q.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(state.rows[table] ?? { data: null, count: null, error: null }).then(onFulfilled, onRejected);
      return q;
    },
    rpc(name: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ name, args });
      return Promise.resolve(state.rpcResults[name] ?? { data: null, error: null });
    },
  };

  return { state, client };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.client }));

import { TalkXResumeChecklist } from '../tracking/TalkXResumeChecklist';
import {
  useTalkXResumeChecklist,
  type TalkXResumeChecklistCampaign,
} from '@/hooks/integrations/useTalkXResumeChecklist';

const CAMPAIGN: TalkXResumeChecklistCampaign = {
  id: 'camp-1',
  status: 'paused',
  template_id: 'tpl-1',
  whatsapp_connection_id: 'conn-1',
  scheduled_at: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
  paused_at: '2026-10-09T01:00:00.000Z',
};

function loadPrecheckRows(marksMessage: string | null) {
  h.state.rows = {
    talkx_campaign_segments: { data: [{ status: 'pending' }, { status: 'done' }, { status: 'pending' }], error: null },
    talkx_templates: { data: { status: 'approved' }, error: null },
    whatsapp_connections: { data: { status: 'connected' }, error: null },
    talkx_settings: { data: { value: '"Pare para sair"' }, error: null },
    talkx_optout_keywords: { data: null, count: 3, error: null },
    talkx_campaign_events: { data: marksMessage ? [{ message: marksMessage }] : [], error: null },
  };
  h.state.rpcCalls = [];
  h.state.rpcResults = { talkx_engine_window_open: { data: false, error: null } };
}

function Harness() {
  const checklist = useTalkXResumeChecklist(CAMPAIGN);
  return <TalkXResumeChecklist items={checklist.items} onToggle={checklist.toggle} />;
}

function renderChecklist() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

function rowOf(title: string): HTMLElement {
  return screen.getByText(title).closest('li') as HTMLElement;
}

beforeEach(() => {
  h.state.rows = {};
  h.state.rpcCalls = [];
  h.state.rpcResults = {};
});

describe('TalkXResumeChecklist — verificação automática e persistência (X159)', () => {
  it('janela fechada vira "Fora do horário de envio" com selo de atenção, e o template aprovado fica verificado', async () => {
    loadPrecheckRows('[{"key":"segments","checked":true},{"key":"autoresponse","checked":false}]');
    renderChecklist();

    const limites = rowOf('Verificar limites e janelas de envio');
    await waitFor(() => expect(within(limites).getByText('Fora do horário de envio')).toBeInTheDocument());
    expect(within(limites).getByText('Atenção')).toBeInTheDocument();

    const templates = rowOf('Confirmar mensagens e templates');
    expect(within(templates).getByText('Todos os templates OK')).toBeInTheDocument();
    expect(within(templates).getByText('Verificado agora')).toBeInTheDocument();

    const segmentos = rowOf('Revisar segmentação dos públicos');
    expect(within(segmentos).getByText('2 segmentos pendentes')).toBeInTheDocument();

    const respostas = rowOf('Revisar respostas automáticas');
    expect(within(respostas).getByText('Resposta de saída configurada · 3 palavras-chave')).toBeInTheDocument();

    const agendamentos = rowOf('Validar agendamentos');
    expect(within(agendamentos).getByText(/^Próximo envio em /)).toBeInTheDocument();
  });

  it('a marcação salva na pausa atual volta marcada ao reabrir a tela', async () => {
    loadPrecheckRows('[{"key":"segments","checked":true},{"key":"autoresponse","checked":false}]');
    renderChecklist();

    const segmentos = screen.getByRole('checkbox', { name: /Revisar segmentação dos públicos/ });
    await waitFor(() => expect(segmentos).toBeChecked());

    // O item 5 foi gravado como desmarcado na mesma pausa: continua pendente.
    expect(screen.getByRole('checkbox', { name: /Revisar respostas automáticas/ })).not.toBeChecked();
  });

  it('marcar o item 1 grava pela CAP-056 com a chave do item', async () => {
    loadPrecheckRows(null);
    renderChecklist();

    const segmentos = screen.getByRole('checkbox', { name: /Revisar segmentação dos públicos/ });
    await waitFor(() => expect(screen.getByText('2 segmentos pendentes')).toBeInTheDocument());
    expect(segmentos).not.toBeChecked();
    fireEvent.click(segmentos);

    await waitFor(() => {
      const gravacao = h.state.rpcCalls.find((call) => call.name === 'log_talkx_campaign_checklist');
      expect(gravacao).toBeTruthy();
      expect(gravacao?.args.p_campaign_id).toBe('camp-1');
      expect(gravacao?.args.p_items).toEqual([
        { key: 'segments', checked: true },
        { key: 'templates', checked: false },
        { key: 'limits', checked: false },
        { key: 'schedule', checked: false },
        { key: 'autoresponse', checked: false },
      ]);
    });
  });
});
