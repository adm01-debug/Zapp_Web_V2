/**
 * X079 — Tabela da Visão geral nas colunas do mock, sobre `TalkXTable`.
 *
 * O defeito (X079, Fase 7 do plano Talk X V4): a Visão geral montava a tabela à
 * mão (`Th`/`Td`), com tile por objetivo no lugar da miniatura, ícone genérico no
 * canal, "0%" sem barra na agendada, "0%" no rascunho com destinatários, a 2ª
 * linha de resultados sempre com falhas/"% de sucesso" (nunca ENTREGUES), data
 * absoluta e nenhuma ordenação por coluna — e as células que a X043 já tinha
 * criado no kit (`EntityCell`, `ChannelCell`, `ProgressCell`, `ResultsCell`,
 * `DateByCell`) não eram usadas em lugar nenhum.
 *
 * A prova monta a TELA REAL (`TalkXOverview`), com as cinco linhas do mock, e
 * confere o que a tabela passa a MOSTRAR em cada coluna. Sem a troca para
 * `TalkXTable` + células do kit, os casos de miniatura, canal, progresso do
 * rascunho, entregues e ordenação falham.
 *
 * Relógio congelado em horário LOCAL (sem `Z`) para "Hoje, 10:00" / "Ontem,
 * 16:20" valerem em qualquer fuso — mesmo padrão do teste da X043.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const f = vi.hoisted(() => ({
  insights: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/hooks/integrations/useTalkXInsights', () => ({
  useTalkXInsights: () => ({ data: f.insights, isLoading: false, isError: false, error: null }),
}));

vi.mock('@/components/talkx/useTalkXLifecycle', () => ({
  useTalkXLifecycle: () => ({
    intent: null, isPending: false, error: null, reason: '',
    setReason: vi.fn(), request: vi.fn().mockReturnValue(true),
    confirm: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockReturnValue(true), clearError: vi.fn(),
  }),
  TalkXLifecycleDialog: () => null,
}));

vi.mock('@/hooks/integrations/useTalkXOverviewStats', () => ({
  useTalkXOverviewStats: () => ({ data: null, isLoading: false, isError: false, error: null }),
}));

// Radix (DropdownMenu do ⋮ por linha) mede o gatilho com ResizeObserver, API ausente no jsdom.
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

import { TalkXOverview } from '../TalkXOverview';
import type { TalkXCampaign } from '@/hooks/integrations/useTalkX';
import type { TalkXSegment } from '@/hooks/integrations/useTalkXSegments';

function campanha(over: Partial<TalkXCampaign> & { id: string; name: string; status: string }): TalkXCampaign {
  return {
    message_template: 'Olá {{nome}}',
    variables_config: [],
    typing_delay_min: 1,
    typing_delay_max: 2,
    send_interval_min: 1,
    send_interval_max: 2,
    total_recipients: 0,
    sent_count: 0,
    failed_count: 0,
    delivered_count: 0,
    whatsapp_connection_id: null,
    created_by: 'u1',
    started_at: null,
    completed_at: null,
    created_at: '2026-09-20T09:00:00',
    updated_at: '2026-09-20T09:00:00',
    media_url: null,
    media_type: null,
    scheduled_at: null,
    ...over,
  } as TalkXCampaign;
}

/**
 * As cinco linhas do mock, na ordem em que a consulta entrega (created_at desc).
 * O nome de cada uma é a única coisa que muda entre os estados, para a ordenação
 * por "Campanha" ser observável.
 */
const CAMPANHAS: TalkXCampaign[] = [
  campanha({
    id: 'c-delta', name: 'Delta campanha', status: 'sending',
    description: 'Produtos em destaque para escritórios',
    total_recipients: 1250, sent_count: 850, delivered_count: 821, failed_count: 4,
    started_at: '2026-09-20T10:00:00',
    media_url: 'https://exemplo.invalid/midia/campanha.png', media_type: 'image',
    segment_id: 'seg-1',
  }),
  campanha({
    id: 'c-bravo', name: 'Bravo campanha', status: 'scheduled',
    total_recipients: 100, scheduled_at: '2026-09-19T16:20:00',
    segment_id: null, audience_source: 'contacts',
  }),
  campanha({
    id: 'c-echo', name: 'Echo campanha', status: 'completed',
    total_recipients: 100, sent_count: 100, delivered_count: 100,
    started_at: '2026-09-15T09:30:00', segment_id: 'seg-1',
  }),
  campanha({
    id: 'c-charlie', name: 'Charlie campanha', status: 'paused',
    total_recipients: 100, sent_count: 42, segment_id: null, audience_source: 'crm360',
  }),
  campanha({
    id: 'c-alfa', name: 'Alfa campanha', status: 'draft',
    total_recipients: 10, segment_id: null, audience_source: 'contacts',
  }),
];

const SEGMENTOS = [{ id: 'seg-1', name: 'Empresas' }] as unknown as TalkXSegment[];

/** A tabela é única na tela; o rail repete nomes, então as consultas vão dentro dela. */
const tabela = () => screen.getByRole('table');
const linhaDe = (nome: string) => within(tabela()).getByText(nome).closest('tr') as HTMLElement;
const celula = (nome: string, coluna: number) => linhaDe(nome).querySelector(`td:nth-child(${coluna})`) as HTMLElement;
/** Colunas: 1 seleção · 2 Campanha · 3 Segmento · 4 Canal · 5 Status · 6 Progresso · 7 Resultados · 8 Agendada em · 9 Ações */
const progressoDe = (nome: string) => celula(nome, 6);
const resultadosDe = (nome: string) => celula(nome, 7);
const dataDe = (nome: string) => celula(nome, 8);
const nomesNaTabela = () => Array.from(tabela().querySelectorAll('tbody tr'))
  .map((tr) => tr.querySelector('button p')?.textContent ?? '');

function renderOverview() {
  const props = {
    campaigns: CAMPANHAS,
    segments: SEGMENTOS,
    creators: { u1: 'Ana Silva' },
    isLoading: false,
    onNew: vi.fn(),
    onEdit: vi.fn(),
    onView: vi.fn(),
    onViewScheduled: vi.fn(),
    onViewRunning: vi.fn(),
    onDuplicate: vi.fn(),
    onStart: vi.fn(),
    onPause: vi.fn(),
    onCancel: vi.fn(),
    onDelete: vi.fn(),
    onGoTab: vi.fn(),
  };
  render(<TalkXOverview {...props} />);
  return props;
}

describe('X079 — a tabela da Visão geral usa as colunas e células do mock', () => {
  beforeAll(() => { Element.prototype.hasPointerCapture = () => false; });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(2026, 8, 20, 12, 0, 0)); // 20/09/2026 12:00 local
    sessionStorage.clear();
    f.insights = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it('cabeçalhos na ordem do mock, mais a coluna de ações do kit', () => {
    renderOverview();
    const cabecalhos = within(tabela()).getAllByRole('columnheader').map((th) => th.textContent);
    expect(cabecalhos).toEqual([
      '', 'Campanha', 'Segmento / Público', 'Canal', 'Status', 'Progresso', 'Resultados', 'Agendada em', 'Ações',
    ]);
  });

  it('Campanha: miniatura quando a mídia é imagem, tile quando não é, nome e descrição', () => {
    renderOverview();

    const comImagem = linhaDe('Delta campanha');
    expect(comImagem.querySelector('img')?.getAttribute('src')).toBe('https://exemplo.invalid/midia/campanha.png');
    expect(within(comImagem).getByText('Produtos em destaque para escritórios')).toBeTruthy();

    // Sem mídia: o tile do objetivo continua sendo o fallback (nada de <img>).
    const semImagem = linhaDe('Bravo campanha');
    expect(semImagem.querySelector('img')).toBeNull();
    expect(semImagem.querySelector('.talkx-tile')).not.toBeNull();
  });

  it('Segmento / Público: chip do segmento (ou a origem) e a contagem de contatos', () => {
    renderOverview();
    const segmento = celula('Delta campanha', 3);
    expect(within(segmento).getByText('Empresas')).toBeTruthy();
    expect(within(segmento).getByText('1.250 contatos')).toBeTruthy();

    expect(within(celula('Bravo campanha', 3)).getByText('Seleção manual')).toBeTruthy();
    expect(within(celula('Charlie campanha', 3)).getByText('CRM 360°')).toBeTruthy();
  });

  it('Canal: logo do WhatsApp em todas as linhas', () => {
    renderOverview();
    expect(within(tabela()).getAllByRole('img', { name: 'WhatsApp' })).toHaveLength(CAMPANHAS.length);
  });

  it('Status: pill do kit e ponto pulsante só na campanha em andamento', () => {
    renderOverview();

    const pulsos = tabela().querySelectorAll('.talkx-dot-pulse');
    expect(pulsos).toHaveLength(1);
    expect(pulsos[0].closest('tr')).toBe(linhaDe('Delta campanha'));
    expect(within(linhaDe('Delta campanha')).getByText('Em andamento')).toBeTruthy();

    expect(within(linhaDe('Bravo campanha')).getByText('Agendada')).toBeTruthy();
    expect(within(linhaDe('Echo campanha')).getByText('Concluída')).toBeTruthy();
    expect(within(linhaDe('Charlie campanha')).getByText('Pausada')).toBeTruthy();
    expect(within(linhaDe('Alfa campanha')).getByText('Rascunho')).toBeTruthy();
  });

  it('Progresso: 68% com barra, agendada 0% com barra VAZIA, concluída 100%, pausada 42%, rascunho —', () => {
    renderOverview();

    const emAndamento = progressoDe('Delta campanha');
    expect(within(emAndamento).getByText('68%')).toBeTruthy();
    expect(emAndamento.querySelector('div[style*="width: 68%"]')).not.toBeNull();

    const agendada = progressoDe('Bravo campanha');
    expect(within(agendada).getByText('0%')).toBeTruthy();
    expect(agendada.querySelector('div[style*="width"]')).toBeNull();

    expect(within(progressoDe('Echo campanha')).getByText('100%')).toBeTruthy();
    expect(within(progressoDe('Charlie campanha')).getByText('42%')).toBeTruthy();

    // Rascunho mostra o traço, nunca "0%" — mesmo com destinatários no rascunho.
    const rascunho = progressoDe('Alfa campanha');
    expect(within(rascunho).getByText('—')).toBeTruthy();
    expect(within(rascunho).queryByText('0%')).toBeNull();
  });

  it('Resultados: enviados e ENTREGUES com a taxa; falhas só no title', () => {
    renderOverview();

    const resultados = resultadosDe('Delta campanha');
    expect(within(resultados).getByText('850 enviados')).toBeTruthy();
    expect(within(resultados).getByText('821 entregues (96,6%)')).toBeTruthy();
    expect(within(resultados).getByTitle('4 falhas')).toBeTruthy();

    // Sem envio ainda: traço, e nenhuma taxa inventada.
    expect(within(resultadosDe('Bravo campanha')).getByText('—')).toBeTruthy();
    expect(within(resultadosDe('Echo campanha')).queryByText(/de sucesso/)).toBeNull();
  });

  it('Agendada em: "Hoje, 10:00", "Ontem, 16:20" e a data anterior, com o criador', () => {
    renderOverview();

    expect(within(dataDe('Delta campanha')).getByText('Hoje, 10:00')).toBeTruthy();
    expect(within(dataDe('Delta campanha')).getByText('por Ana Silva')).toBeTruthy();

    expect(within(dataDe('Bravo campanha')).getByText('Ontem, 16:20')).toBeTruthy();
    expect(within(dataDe('Echo campanha')).getByText('15 set, 09:30')).toBeTruthy();
  });

  it('ordenação: clique no cabeçalho reordena as linhas e ajusta o aria-sort', () => {
    renderOverview();

    const cabecalho = () => within(tabela()).getByRole('columnheader', { name: 'Campanha' });
    expect(cabecalho()).toHaveAttribute('aria-sort', 'none');
    // Ordem de chegada da consulta (created_at desc) — a tabela não a inventa.
    expect(nomesNaTabela()).toEqual([
      'Delta campanha', 'Bravo campanha', 'Echo campanha', 'Charlie campanha', 'Alfa campanha',
    ]);

    fireEvent.click(within(tabela()).getByRole('button', { name: 'Campanha' }));
    expect(cabecalho()).toHaveAttribute('aria-sort', 'ascending');
    expect(nomesNaTabela()).toEqual([
      'Alfa campanha', 'Bravo campanha', 'Charlie campanha', 'Delta campanha', 'Echo campanha',
    ]);

    fireEvent.click(within(tabela()).getByRole('button', { name: 'Campanha' }));
    expect(cabecalho()).toHaveAttribute('aria-sort', 'descending');
    expect(nomesNaTabela()).toEqual([
      'Echo campanha', 'Delta campanha', 'Charlie campanha', 'Bravo campanha', 'Alfa campanha',
    ]);

    fireEvent.click(within(tabela()).getByRole('button', { name: 'Campanha' }));
    expect(cabecalho()).toHaveAttribute('aria-sort', 'none');
    expect(nomesNaTabela()[0]).toBe('Delta campanha');
  });

  it('clique no nome abre a campanha', () => {
    const props = renderOverview();
    fireEvent.click(within(linhaDe('Delta campanha')).getByRole('button', { name: /^Delta campanha/ }));
    expect(props.onView).toHaveBeenCalledTimes(1);
    expect(props.onView.mock.calls[0][0]).toMatchObject({ id: 'c-delta' });
  });

  it('N35: os blocos que o mock não tem ficam ABAIXO da tabela e recolhidos por padrão', () => {
    f.insights = [{ id: 'i1', type: 'timing', title: 'Melhor horário', description: 'Envie às 10h.', priority: 'high' }];
    renderOverview();

    const rascunhos = screen.getByRole('button', { name: /Rascunhos pendentes/ });
    const insights = screen.getByRole('button', { name: /Insights/ });
    expect(rascunhos).toHaveAttribute('aria-expanded', 'false');
    expect(insights).toHaveAttribute('aria-expanded', 'false');
    expect(tabela().compareDocumentPosition(rascunhos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tabela().compareDocumentPosition(insights) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Recolhido não é apagado: o título e a contagem ficam à vista e o conteúdo abre no clique.
    expect(rascunhos.textContent).toContain('(1)');
    expect(insights.textContent).toContain('(1)');
    expect(screen.queryByText('Retomar')).toBeNull();
    expect(screen.queryByText('Melhor horário')).toBeNull();

    fireEvent.click(rascunhos);
    fireEvent.click(insights);
    expect(rascunhos).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Retomar')).toBeTruthy();
    expect(screen.getByText('Melhor horário')).toBeTruthy();
  });

  // Recusa do revisor: `selectionKey` não incluía `channel` nem o período, então
  // uma linha marcada continuava "selecionada" por dentro ao trocar esses dois
  // filtros (mesmo quando a linha seguia visível, como aqui). Os dois casos
  // provam que `selectionResetKey` muda e a `TalkXTable` zera a seleção.
  it('trocar o período zera a seleção (mesmo com a linha ainda visível)', () => {
    renderOverview();
    const checkbox = within(linhaDe('Delta campanha')).getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'Período' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '7 dias' }));

    expect(linhaDe('Delta campanha')).toBeTruthy(); // a linha continua na tabela
    expect(within(linhaDe('Delta campanha')).getByRole('checkbox')).not.toBeChecked();
  });

  it('trocar o filtro de canal zera a seleção', () => {
    renderOverview();
    const checkbox = within(linhaDe('Delta campanha')).getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    fireEvent.click(screen.getByRole('combobox', { name: 'Todos os canais' }));
    fireEvent.click(screen.getByRole('option', { name: 'WhatsApp' }));

    expect(within(linhaDe('Delta campanha')).getByRole('checkbox')).not.toBeChecked();
  });
});
