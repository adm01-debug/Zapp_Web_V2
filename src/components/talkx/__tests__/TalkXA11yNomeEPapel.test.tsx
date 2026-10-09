import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * TX-A11Y-1 — nome acessível e papel nos controles do Talk X.
 *
 * A varredura axe WCAG 2.1 AA (tags wcag2a/wcag2aa/wcag21a/wcag21aa) no Chromium
 * real, com sessão falsa + fixture, reprovava 8 nós de NOME/PAPEL em 5 telas do
 * Talk X. Este teste fixa, no jsdom, o nome de cada um desses controles — o
 * mesmo nome que o axe passou a enxergar depois da correção:
 *
 *   tela 10 · Agendada  — input datetime-local sem `<label>` (`label` [critical]);
 *                         Switch "Janela de envio" e "Somente horário comercial"
 *                         sem nome (`button-name` [critical]); SelectTrigger do
 *                         fuso horário com `role="combobox"` sem nome.
 *   tela 03 · Segmentos — SelectTrigger do operador lógico do grupo e o editor de
 *                         regra (campo/operador/valor) sem nome.
 *   tela 05 · Templates — SelectTrigger de Categoria e Status sem nome.
 *   tela 11 · Monitor   — `<Progress role="progressbar">` sem nome
 *                         (`aria-progressbar-name` [serious]).
 *   tela 16 · Ajuda     — região rolável sem conteúdo focável nem foco próprio
 *                         (`scrollable-region-focusable` [serious]).
 *
 * Vermelho antes do fix: cada asserção de nome abaixo não encontra o elemento.
 * Radix Select (jsdom) precisa da captura de ponteiro falsa, como em
 * TalkXPaginacao.tamanhoPagina.test.tsx.
 */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  // O Radix Select chama `scrollIntoView` na opção destacada; o jsdom não tem.
  Element.prototype.scrollIntoView = () => {};
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', full_name: 'QA' }, user: { id: 'user-1' }, session: null, loading: false }),
}));

vi.mock('@/lib/supabaseHelpers', () => ({
  fromTable: () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.order = () => chain;
    chain.single = () => Promise.resolve({ data: null, error: null });
    chain.then = (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(onFulfilled);
    return chain;
  },
}));

// Um só mock do cliente Supabase serve o Monitor (que lê a campanha por id) e o
// construtor de segmentos (que estima o público pela RPC talkx_resolve_audience).
vi.mock('@/integrations/supabase/client', () => {
  const CAMPANHA_MONITOR = {
    id: 'camp-monitor',
    name: 'Dia do Cliente',
    status: 'sending',
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
  };

  const resolver = (tabela: string) =>
    tabela === 'talkx_campaigns'
      ? { data: CAMPANHA_MONITOR, error: null }
      : { data: [], error: null };

  const makeChain = (tabela: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.not = () => chain;
    chain.or = () => chain;
    chain.is = () => chain;
    chain.order = () => chain;
    chain.limit = () => Promise.resolve(resolver(tabela));
    chain.single = () => Promise.resolve(resolver(tabela));
    chain.then = (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolver(tabela)).then(onFulfilled);
    return chain;
  };

  return {
    supabase: {
      from: (tabela: string) => makeChain(tabela),
      rpc: (_nome: string, args?: { p_mode?: string }) =>
        Promise.resolve({
          data:
            args?.p_mode === 'page'
              ? { mode: 'page', rows: [], has_more: false, next_after: null }
              : { mode: 'count', matched: 42, eligible: 42, suppressed: 0, invalid_phone: 0, legacy_or_deleted: 0 },
          error: null,
        }),
      channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }) }) }),
      removeChannel: () => {},
    },
  };
});

const campanhas = vi.hoisted(() => ({ lista: [] as Array<Record<string, unknown>> }));

vi.mock('@/hooks/integrations/useTalkX', () => ({
  useTalkX: () => ({
    campaigns: campanhas.lista,
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
    refetchCampaigns: vi.fn(),
    updateCampaign: { mutateAsync: vi.fn() },
    startCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    cancelCampaign: vi.fn(),
  }),
}));

vi.mock('@/hooks/integrations/useTalkXMonitor', () => ({
  useTalkXMonitor: () => ({ rateByMinute: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXEvents', () => ({
  useTalkXEvents: () => ({ events: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), logEvent: vi.fn() }),
}));

vi.mock('@/hooks/integrations/useTalkXConnectionStatus', () => ({
  useTalkXConnectionStatus: () => ({ status: null, label: null, loading: false }),
}));

// O motor de regras entra REAL (isRuleComplete/splitRules/rulesToPostgrest); só a
// lista e o CRUD de segmentos viram spies — mesmo padrão de TalkXSegments.builder.
vi.mock('@/hooks/integrations/useTalkXSegments', async (orig) => {
  const actual = await orig<typeof import('@/hooks/integrations/useTalkXSegments')>();
  return {
    ...actual,
    useTalkXSegments: () => ({
      segments: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      createSegment: { mutateAsync: vi.fn() },
      updateSegment: { mutateAsync: vi.fn() },
      deleteSegment: { mutate: vi.fn() },
      refreshEstimates: { mutate: vi.fn() },
    }),
  };
});

vi.mock('@/hooks/integrations/useTalkXTemplates', () => ({
  useTalkXTemplates: () => ({
    templates: [],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    updateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    deleteTemplate: { mutate: vi.fn() },
    duplicateTemplate: { mutate: vi.fn(), mutateAsync: vi.fn() },
    testTemplate: vi.fn(),
    fetchVersionHistory: vi.fn().mockResolvedValue([]),
    fetchVariants: vi.fn().mockResolvedValue([]),
    saveVariant: vi.fn(),
    deleteVariant: vi.fn(),
    countVariantRecipients: vi.fn(),
  }),
}));

import { TalkXCampaignScheduled } from '../TalkXCampaignScheduled';
import { TalkXLiveMonitor } from '../TalkXLiveMonitor';
import { TalkXSegments } from '../TalkXSegments';
import { TalkXTemplateEditor } from '../TalkXTemplateEditor';

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const CAMPANHA_AGENDADA = {
  id: 'camp-agendada-1',
  name: 'Promoção de Outubro',
  message_template: 'Olá {{nome}}, chegou a promoção!',
  variables_config: [],
  typing_delay_min: 1500,
  typing_delay_max: 4000,
  send_interval_min: 8000,
  send_interval_max: 20000,
  status: 'scheduled',
  total_recipients: 1200,
  sent_count: 0,
  failed_count: 0,
  delivered_count: 0,
  whatsapp_connection_id: 'conn-1',
  created_by: 'user-1',
  started_at: null,
  completed_at: null,
  created_at: '2026-10-01T10:00:00.000Z',
  updated_at: '2026-10-01T10:00:00.000Z',
  media_url: null,
  media_type: null,
  scheduled_at: '2026-12-01T15:00:00.000Z',
  schedule_timezone: 'America/Sao_Paulo',
  send_window_start: null,
  send_window_end: null,
  business_hours_only: false,
  speed_profile: 'moderate',
  revision: 1,
};

const TEMPLATE = {
  id: 'tpl-1',
  name: 'Boas-vindas',
  description: null,
  category: 'geral',
  content: 'Olá {{nome}}',
  media_url: null,
  media_type: null,
  tags: [],
  status: 'draft' as const,
  use_count: 0,
  created_by: null,
  custom_variables: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  campanhas.lista = [CAMPANHA_AGENDADA];
});

describe('tela 10 · Agendada — nome acessível dos controles', () => {
  it('data e hora, fuso horário e os dois interruptores têm nome', async () => {
    render(
      <TalkXCampaignScheduled
        campaignId="camp-agendada-1"
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    const data = await screen.findByLabelText('Data e hora');
    expect(data.getAttribute('type')).toBe('datetime-local');

    expect(screen.getByRole('combobox', { name: 'Fuso horário' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Janela de envio' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Somente horário comercial' })).toBeTruthy();
  });

  it('Início e Fim da janela de envio também têm label associado', async () => {
    render(
      <TalkXCampaignScheduled
        campaignId="camp-agendada-1"
        onBack={vi.fn()}
        onEdit={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );

    // A janela só aparece com o interruptor ligado — e os dois `type="time"`
    // estavam sem label exatamente como o datetime-local.
    fireEvent.click(await screen.findByRole('switch', { name: 'Janela de envio' }));

    expect(screen.getByLabelText('Início').getAttribute('type')).toBe('time');
    expect(screen.getByLabelText('Fim').getAttribute('type')).toBe('time');
  });
});

describe('tela 03 · Segmentos — nome acessível do editor de regra', () => {
  it('operador do grupo, campo, operador e valor da condição têm nome', async () => {
    wrap(<TalkXSegments onUseCampaign={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }));

    expect(await screen.findByRole('combobox', { name: 'Operador lógico do grupo' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar condição' }));

    expect(await screen.findByRole('combobox', { name: 'Campo da condição' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Operador da condição' })).toBeTruthy();

    // "Grupo" é um campo de lista: escolher ele troca o valor textual pelo Select
    // de opções — que é o terceiro gatilho do editor.
    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Campo da condição' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Grupo' }));

    expect(await screen.findByRole('combobox', { name: 'Valor da condição' })).toBeTruthy();
  });
});

describe('tela 05 · Templates — nome acessível de Categoria e Status', () => {
  it('os gatilhos de Categoria e Status são nomeados pelos seus labels', () => {
    render(
      <TalkXTemplateEditor
        templates={[TEMPLATE as never]}
        isLoading={false}
        editing={TEMPLATE as never}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Categoria' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeTruthy();
  });
});

describe('tela 11 · Monitor — nome acessível da barra de progresso', () => {
  it('a barra de progresso tem nome e continua com papel de progressbar', async () => {
    wrap(<TalkXLiveMonitor campaignId="camp-monitor" onBack={vi.fn()} />);

    const barra = await screen.findByRole('progressbar', { name: 'Progresso do envio' });
    expect(barra.getAttribute('aria-valuemax')).toBe('100');
  });
});

// tela 16 · Ajuda — a correção original fixava a região rolável de `TalkXHelp.tsx`
// (modal com `ScrollArea`, scrollable-region-focusable). TL-174 (dia de 09/10)
// aposentou esse componente: a Ajuda virou central em tela cheia
// (`help/TalkXHelpCenter.tsx`), sem a região de rolagem com altura fixa que
// causava o defeito original — `TalkXHelp.tsx` não existe mais neste branch
// (`git log --diff-filter=D -- src/components/talkx/TalkXHelp.tsx` na dia) e o
// grep por `overflow-y-auto`/`ScrollArea` no substituto não encontra o padrão
// antigo. Removido o describe desta tela: não há mais o que testar aqui.
