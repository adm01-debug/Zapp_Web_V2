/**
 * Prova de tela da seção "Linha do tempo de SLA" do painel do contato.
 *
 * Renderiza o componente REAL dentro do acordeão real: o único mock é a rede do
 * Supabase, então a leitura paginada, a montagem dos marcos (`buildSlaMilestones`)
 * e o filtro de período/tipo (`filterSlaMilestones`) são os de produção.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
}));
const fm = vi.hoisted(() => ({ reduce: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => fm.reduce };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = () => mesmo();
      builder.eq = () => mesmo();
      builder.in = () => mesmo();
      builder.order = () => mesmo();
      builder.range = () => mesmo();
      builder.limit = () => mesmo();
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(ok, falhou);
      return builder;
    },
  },
}));

import { Accordion } from '@/components/ui/accordion';
import { SIDEBAR_SECTIONS, getStoredSidebarState, saveSidebarState } from '../sidebar/sidebarSections';
import { SlaTimelineSection } from '../SlaTimelineSection';

const MIN = 60_000;
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const RECENT = NOW - 2 * 60 * MIN;
const OLD = NOW - 20 * 24 * 60 * MIN;

const REGRA_CONTATO = {
  id: 'rule-c1',
  name: 'Ouro do contato',
  first_response_minutes: 5,
  resolution_minutes: 10,
  contact_id: 'c1',
  company: null,
  job_title: null,
  contact_type: null,
  queue_id: null,
  agent_id: null,
};

/** r1 (2 h atrás): 1ª resposta em 4/5 min → em risco; resolução em 5/10 min → no prazo. */
const R1 = {
  id: 'r1',
  first_message_at: iso(RECENT),
  first_response_at: iso(RECENT + 4 * MIN),
  resolved_at: iso(RECENT + 5 * MIN),
  first_response_breached: false,
  resolution_breached: false,
};

/** r2 (20 dias atrás): 1ª resposta em 30/5 min e resolução em 50/10 min → estourados. */
const R2 = {
  id: 'r2',
  first_message_at: iso(OLD),
  first_response_at: iso(OLD + 30 * MIN),
  resolved_at: iso(OLD + 50 * MIN),
  first_response_breached: false,
  resolution_breached: false,
};

const TRANSFERENCIA = { id: 'e1', event_type: 'transfer', created_at: iso(RECENT + 10 * MIN) };

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Accordion type="multiple" defaultValue={['sla-timeline']}>
        <SlaTimelineSection contactId="c1" index={3} />
      </Accordion>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fm.reduce = false;
  localStorage.clear();
  h.tables = {
    sla_rules: { data: [REGRA_CONTATO], error: null },
    sla_configurations: { data: [], error: null },
    conversation_sla: { data: [R1, R2], error: null },
    conversation_events: { data: [TRANSFERENCIA], error: null },
  };
});

afterEach(() => {
  fm.reduce = false;
});

describe('SlaTimelineSection — a linha do tempo no painel do contato', () => {
  it('mostra os marcos reais com a situação de cada um', async () => {
    renderSection();

    expect(await screen.findByTestId('sla-timeline-list')).toBeInTheDocument();
    for (const id of ['r1-opened', 'r1-first_response', 'r1-resolution', 'r2-opened', 'r2-first_response', 'r2-resolution', 'transfer-e1']) {
      expect(screen.getByTestId(`sla-milestone-${id}`)).toBeInTheDocument();
    }

    expect(screen.getByTestId('sla-status-r1-first_response')).toHaveTextContent('Em risco');
    expect(screen.getByTestId('sla-status-r1-resolution')).toHaveTextContent('No prazo');
    expect(screen.getByTestId('sla-status-r2-resolution')).toHaveTextContent('Estourado');
    // marco sem prazo (abertura de conversa) não ganha selo
    expect(screen.queryByTestId('sla-status-r1-opened')).toBeNull();

    // a linha vertical que liga os marcos é o DrawLine do kit
    expect(screen.getByTestId('draw-line')).toBeInTheDocument();
  });

  it('o filtro de período esconde o que ficou fora da janela', async () => {
    renderSection();
    await screen.findByTestId('sla-timeline-list');

    fireEvent.click(screen.getByTestId('segmented-item-24h'));

    await waitFor(() => expect(screen.queryByTestId('sla-milestone-r2-resolution')).toBeNull());
    expect(screen.getByTestId('sla-milestone-r1-resolution')).toBeInTheDocument();
    expect(screen.getByTestId('sla-milestone-transfer-e1')).toBeInTheDocument();
  });

  it('o filtro por tipo deixa só os marcos escolhidos', async () => {
    renderSection();
    await screen.findByTestId('sla-timeline-list');

    const chip = screen.getByTestId('sla-kind-resolution');
    fireEvent.click(chip);

    await waitFor(() => expect(screen.queryByTestId('sla-milestone-r1-opened')).toBeNull());
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('sla-milestone-r1-resolution')).toBeInTheDocument();
    expect(screen.getByTestId('sla-milestone-r2-resolution')).toBeInTheDocument();
    expect(screen.queryByTestId('sla-milestone-transfer-e1')).toBeNull();

    // clicar de novo desliga o filtro e a lista volta inteira
    fireEvent.click(chip);
    await waitFor(() => expect(screen.getByTestId('sla-milestone-r1-opened')).toBeInTheDocument());
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('estado vazio ensina o que fazer, sem esconder os filtros', async () => {
    h.tables.conversation_sla = { data: [], error: null };
    h.tables.conversation_events = { data: [], error: null };
    renderSection();

    expect(await screen.findByTestId('sidebar-empty-sla-timeline-vazio')).toBeInTheDocument();
    expect(screen.getByTestId('sliding-segmented')).toBeInTheDocument();

    // com filtro ativo a orientação muda (o vazio é do filtro, não do contato)
    fireEvent.click(screen.getByTestId('sla-kind-resolution'));
    await waitFor(() =>
      expect(screen.getByTestId('sidebar-empty-sla-timeline-vazio')).toHaveTextContent('Amplie o período'),
    );
  });

  it('sem o prazo carregado avisa em vez de mostrar lista vazia', async () => {
    h.tables.sla_rules = { data: null, error: { message: 'falha de leitura' } };
    renderSection();

    expect(await screen.findByTestId('sidebar-empty-sla-timeline-sem-prazo')).toBeInTheDocument();
    expect(screen.queryByTestId('sla-timeline-list')).toBeNull();
  });

  it('falha na leitura dos marcos não vira "sem marcos"', async () => {
    h.tables.conversation_sla = { data: null, error: { message: 'falha de leitura' } };
    renderSection();

    expect(await screen.findByTestId('sidebar-empty-sla-timeline-erro')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-empty-sla-timeline-vazio')).toBeNull();
    expect(screen.queryByTestId('sla-timeline-list')).toBeNull();
  });

  it('com movimento reduzido o traço nasce pronto e nada se desloca', async () => {
    fm.reduce = true;
    renderSection();

    const rail = await screen.findByTestId('draw-line');
    expect(rail).toHaveAttribute('data-motion', 'reduced');
    expect(screen.getByTestId('sliding-segmented')).toHaveAttribute('data-motion', 'reduced');
  });

  it('o estado da seção persiste no acordeão como o das outras', () => {
    expect(SIDEBAR_SECTIONS).toContain('sla-timeline');
    saveSidebarState(['professional', 'sla-timeline']);
    expect(getStoredSidebarState()).toEqual(['professional', 'sla-timeline']);
  });
});
