/**
 * Prova de tela da seção "Linha do tempo de SLA" do painel do contato.
 *
 * Renderiza o componente REAL dentro do acordeão real: o único mock é a rede do
 * Supabase, então a leitura paginada, a montagem dos marcos (`buildSlaMilestones`)
 * e o filtro de período/tipo (`filterSlaMilestones`) são os de produção.
 *
 * A persistência do estado do acordeão NÃO é provada por teste literal: um teste
 * próprio renderiza o `ContactDetails` de verdade — abrir a seção grava
 * `sla-timeline` no `localStorage` e remontar reabre a seção.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  pendente: {} as Record<string, boolean>,
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
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) => {
        if (h.pendente[table]) return new Promise<never>(() => {});
        return Promise.resolve(h.tables[table] ?? { data: [], error: null }).then(ok, falhou);
      };
      return builder;
    },
  },
}));

// Dependências do ContactDetails que não fazem parte desta tela: stub simples, para
// o teste de persistência exercitar o acordeão e a seção de SLA de verdade.
vi.mock('@/hooks/crm/useContactEnrichedData', () => ({ useContactEnrichedData: () => ({ enrichedData: null }) }));
vi.mock('@/hooks/chat/useConversationActions', () => ({ useConversationActions: () => ({ archiveContact: vi.fn() }) }));
vi.mock('@/hooks/inbox/useContactQuickActions', () => ({
  useContactQuickActions: () => ({ tags: [], addTag: vi.fn(), removeTag: vi.fn(), markVip: vi.fn(), block: vi.fn() }),
}));
vi.mock('@/components/inbox/contact-details/ContactHeaderSection', () => ({ ContactHeaderSection: () => null }));
vi.mock('@/components/inbox/contact-details/sidebar/ContactSidebarSections', () => ({ ContactSidebarSections: () => null }));
vi.mock('@/components/inbox/contact-details/EditContactDialog', () => ({ EditContactDialog: () => null }));

import { Accordion } from '@/components/ui/accordion';
import { SIDEBAR_SECTIONS, getStoredSidebarState, saveSidebarState } from '../sidebar/sidebarSections';
import { SlaTimelineSection } from '../SlaTimelineSection';
import { ContactDetails } from '../../ContactDetails';
import type { Conversation } from '@/types/chat';

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

/** Classes do traço (`path`) do trecho da linha pedido. */
function railPathClass(testId: string): string {
  const svg = screen.getByTestId(testId).querySelector('[data-testid="draw-line"]');
  const path = svg?.querySelector('[data-testid="draw-line-path"]');
  return `${svg?.getAttribute('class') ?? ''} ${path?.getAttribute('class') ?? ''}`;
}

beforeEach(() => {
  fm.reduce = false;
  localStorage.clear();
  // jsdom não implementa scrollTo; o painel o chama ao montar.
  if (!Element.prototype.scrollTo) {
    Object.defineProperty(Element.prototype, 'scrollTo', { value: () => {}, writable: true, configurable: true });
  }
  h.pendente = {};
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

    // a linha vertical que liga os marcos é o DrawLine do kit (um por trecho)
    expect(screen.getAllByTestId('draw-line').length).toBeGreaterThan(0);
  });

  it('cada trecho da linha pinta pela situação do marco acima dele', async () => {
    renderSection();
    await screen.findByTestId('sla-timeline-list');

    // ordem: transfer (mais recente), resolução, 1ª resposta e abertura de r1, resolução e 1ª resposta de r2
    for (const [id, status] of [
      ['sla-rail-transfer-e1', 'na'],
      ['sla-rail-r1-resolution', 'ok'],
      ['sla-rail-r1-first_response', 'warning'],
      ['sla-rail-r1-opened', 'na'],
      ['sla-rail-r2-resolution', 'breached'],
      ['sla-rail-r2-first_response', 'breached'],
    ] as const) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-status', status);
    }

    expect(railPathClass('sla-rail-r1-resolution')).toContain('text-success');
    expect(railPathClass('sla-rail-r1-first_response')).toContain('text-warning');
    expect(railPathClass('sla-rail-r2-resolution')).toContain('text-destructive');
    // marco sem prazo: trecho neutro por `--muted-foreground` (não o azul padrão do kit)
    expect(screen.getByTestId('sla-rail-transfer-e1')).toHaveAttribute('data-status', 'na');
    expect(railPathClass('sla-rail-transfer-e1')).toContain('text-muted-foreground');
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

  it('o grupo de tipos navega por setas (roving tabindex) e Enter alterna o chip focado', async () => {
    renderSection();
    await screen.findByTestId('sla-timeline-list');

    const tudo = screen.getByTestId('sla-kind-all');
    // roving tabindex: só o chip corrente entra na ordem do Tab
    expect(tudo).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('sla-kind-resolution')).toHaveAttribute('tabindex', '-1');

    tudo.focus();
    fireEvent.keyDown(tudo, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('sla-kind-opened'));
    expect(screen.getByTestId('sla-kind-opened')).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(screen.getByTestId('sla-kind-opened'), { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('sla-kind-transfer'));

    // Enter alterna o chip focado
    fireEvent.keyDown(screen.getByTestId('sla-kind-transfer'), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByTestId('sla-milestone-r1-opened')).toBeNull());
    expect(screen.getByTestId('sla-kind-transfer')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Esc limpa os filtros ativos sem fechar o painel', async () => {
    renderSection();
    await screen.findByTestId('sla-timeline-list');

    fireEvent.click(screen.getByTestId('segmented-item-24h'));
    fireEvent.click(screen.getByTestId('sla-kind-resolution'));
    await waitFor(() => expect(screen.queryByTestId('sla-milestone-r2-resolution')).toBeNull());

    fireEvent.keyDown(screen.getByTestId('sla-kind-resolution'), { key: 'Escape' });

    await waitFor(() => expect(screen.getByTestId('sla-milestone-r2-resolution')).toBeInTheDocument());
    expect(screen.getByTestId('sla-kind-all')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('sla-kind-resolution')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('segmented-item-all')).toHaveAttribute('aria-checked', 'true');
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

  it('enquanto o prazo carrega mostra o skeleton, não uma lista vazia', async () => {
    h.pendente.sla_rules = true;
    renderSection();

    const carregando = await screen.findByTestId('sla-timeline-loading');
    expect(carregando.querySelectorAll('[data-testid="shimmer-skeleton"]').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('sla-timeline-list')).toBeNull();
  });

  it('com movimento reduzido o traço nasce pronto e nada se desloca', async () => {
    fm.reduce = true;
    renderSection();

    const rails = await screen.findAllByTestId('draw-line');
    expect(rails.length).toBeGreaterThan(0);
    for (const id of ['transfer-e1', 'r1-resolution', 'r1-first_response']) {
      expect(screen.getByTestId(`sla-rail-${id}`)).toHaveAttribute('data-motion', 'reduced');
    }

    // os itens da lista não se deslocam: sem deslocamento inicial (initial={false})
    for (const id of ['r1-opened', 'r1-first_response', 'r1-resolution']) {
      const item = screen.getByTestId(`sla-milestone-${id}`);
      expect(item).toHaveAttribute('data-motion', 'reduced');
      const transform = item.style.transform;
      expect(transform === '' || transform === 'none' || /translate[XY]\(0px\)/.test(transform)).toBe(true);
      expect(item.style.opacity === '' || item.style.opacity === '1').toBe(true);
    }
  });

  it('o estado da seção persiste no mesmo acordeão do painel', () => {
    expect(SIDEBAR_SECTIONS).toContain('sla-timeline');
    saveSidebarState(['professional', 'sla-timeline']);
    expect(getStoredSidebarState()).toEqual(['professional', 'sla-timeline']);
  });
});

describe('ContactDetails — a seção vive no acordeão persistido', () => {
  const CONVERSA = {
    id: 'conv-1',
    contact: { id: 'c1', name: 'Contato de teste', phone: '+5511900000000' },
  } as unknown as Conversation;

  it('abrir a seção grava "sla-timeline" no localStorage e remontar reabre', async () => {
    const primeiro = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })}>
        <ContactDetails conversation={CONVERSA} onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    // nasce recolhida (DEFAULT_OPEN_SECTIONS não inclui sla-timeline)
    expect(screen.getByTestId('sidebar-section-sla-timeline')).toBeInTheDocument();
    const gatilho = screen.getByRole('button', { name: /Linha do tempo de SLA/i });
    expect(gatilho).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(gatilho);

    await waitFor(() => expect(gatilho).toHaveAttribute('aria-expanded', 'true'));
    const salvo = JSON.parse(localStorage.getItem('contact-sidebar-accordion-state@v2') ?? '[]') as string[];
    expect(salvo).toContain('sla-timeline');

    // remontar o painel reabre a seção a partir do estado salvo
    primeiro.unmount();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })}>
        <ContactDetails conversation={CONVERSA} onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: /Linha do tempo de SLA/i })).toHaveAttribute('aria-expanded', 'true');
  });
});
