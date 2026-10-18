/**
 * Linha do tempo de SLA por contato — regras puras.
 *
 * O sujeito são as funções de `src/lib/slaTimeline`: situação de um marco, duração
 * legível, montagem dos marcos e filtro de período/tipo. Nenhum dado vem de mensagem:
 * o marco só existe quando `conversation_sla`/`conversation_events` trazem o carimbo.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSlaMilestones,
  filterSlaMilestones,
  formatSlaAttribution,
  formatSlaDuration,
  slaStatusForDuration,
  slaWindowStartMs,
  type SlaMilestone,
  type SlaTimelineEvent,
  type SlaTimelineRow,
} from '../slaTimeline';

const LIMITS = { firstResponseMinutes: 5, resolutionMinutes: 60 };
const T0 = Date.parse('2026-10-12T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const row = (id: string, over: Partial<SlaTimelineRow> = {}): SlaTimelineRow => ({
  id,
  first_message_at: iso(T0),
  first_response_at: null,
  resolved_at: null,
  first_response_breached: null,
  resolution_breached: null,
  ...over,
});

describe('slaStatusForDuration', () => {
  it('sem duração não há situação', () => {
    expect(slaStatusForDuration(null, 5)).toBe('na');
  });

  it('sem prazo válido não há situação', () => {
    expect(slaStatusForDuration(60_000, 0)).toBe('na');
    expect(slaStatusForDuration(60_000, Number.NaN)).toBe('na');
  });

  it('dentro do prazo com folga é "no prazo"', () => {
    expect(slaStatusForDuration(60_000, 5)).toBe('ok');
  });

  it('acima de 70% do prazo é "em risco"', () => {
    expect(slaStatusForDuration(4 * 60_000, 5)).toBe('warning');
  });

  it('no limite exato ainda não é violação (é risco)', () => {
    expect(slaStatusForDuration(5 * 60_000, 5)).toBe('warning');
  });

  it('um milissegundo depois do limite é "estourado"', () => {
    expect(slaStatusForDuration(5 * 60_000 + 1, 5)).toBe('breached');
  });
});

describe('formatSlaDuration', () => {
  it('formata segundos, minutos, horas e dias', () => {
    expect(formatSlaDuration(45_000)).toBe('45s');
    expect(formatSlaDuration(5 * 60_000)).toBe('5min');
    expect(formatSlaDuration(3 * 3_600_000)).toBe('3h');
    expect(formatSlaDuration(2 * 86_400_000)).toBe('2d');
  });

  it('sem duração devolve travessão', () => {
    expect(formatSlaDuration(null)).toBe('—');
  });
});

describe('buildSlaMilestones — abertura e 1ª resposta', () => {
  it('resposta no prazo: marco com a duração real e situação "no prazo"', () => {
    const milestones = buildSlaMilestones(
      [row('r1', { first_response_at: iso(T0 + 30_000) })],
      [],
      LIMITS,
      T0,
    );

    const opened = milestones.find((m) => m.id === 'r1-opened');
    expect(opened).toMatchObject({
      kind: 'opened',
      at: iso(T0),
      deadlineAt: iso(T0 + 5 * 60_000),
      durationMs: null,
      status: 'na',
      limitMinutes: 5,
    });

    expect(milestones.find((m) => m.id === 'r1-first_response')).toMatchObject({
      kind: 'first_response',
      at: iso(T0 + 30_000),
      durationMs: 30_000,
      status: 'ok',
    });
  });

  it('a violação gravada manda sobre o relógio: carimbo dentro do prazo ainda sai "estourado"', () => {
    const milestones = buildSlaMilestones(
      [row('r1', { first_response_at: iso(T0 + 2 * 60_000), first_response_breached: true })],
      [],
      LIMITS,
      T0,
    );

    expect(milestones.find((m) => m.id === 'r1-first_response')).toMatchObject({
      status: 'breached',
      durationMs: 2 * 60_000,
    });
  });

  it('violada sem carimbo da resposta: o marco fica no instante do prazo', () => {
    const milestones = buildSlaMilestones([row('r1', { first_response_breached: true })], [], LIMITS, T0);

    expect(milestones.find((m) => m.id === 'r1-first_response')).toMatchObject({
      at: iso(T0 + 5 * 60_000),
      durationMs: null,
      status: 'breached',
    });
  });

  it('pendente: o marco fica na abertura e a situação é a de AGORA', () => {
    const dentro = buildSlaMilestones([row('r1')], [], LIMITS, T0 + 60_000);
    expect(dentro.find((m) => m.id === 'r1-first_response')).toMatchObject({
      at: iso(T0),
      durationMs: 60_000,
      status: 'ok',
    });

    const estourado = buildSlaMilestones([row('r1')], [], LIMITS, T0 + 6 * 60_000);
    expect(estourado.find((m) => m.id === 'r1-first_response')).toMatchObject({
      durationMs: 6 * 60_000,
      status: 'breached',
    });
  });

  it('encerrada sem resposta: marco fixo no fechamento, não vira "Estourado" com o relógio', () => {
    // Fechada 2min após a abertura e lida 10 dias depois: a duração tem de ser a do
    // fechamento (2min, "no prazo") e não o tempo decorrido até agora (10d, "estourado").
    const milestones = buildSlaMilestones(
      [row('r1', { resolved_at: iso(T0 + 2 * 60_000) })],
      [],
      LIMITS,
      T0 + 10 * 86_400_000,
    );

    expect(milestones.find((m) => m.id === 'r1-closed_no_response')).toMatchObject({
      kind: 'closed_no_response',
      at: iso(T0 + 2 * 60_000),
      durationMs: 2 * 60_000,
      status: 'ok',
      limitMinutes: 5,
    });
    // o marco pendente de 1ª resposta não existe mais para esta linha
    expect(milestones.some((m) => m.id === 'r1-first_response')).toBe(false);
  });

  it('encerrada sem resposta depois do prazo: julgada pelo fechamento, "estourada"', () => {
    const milestones = buildSlaMilestones(
      [row('r1', { resolved_at: iso(T0 + 30 * 60_000) })],
      [],
      LIMITS,
      T0,
    );
    expect(milestones.find((m) => m.id === 'r1-closed_no_response')).toMatchObject({
      at: iso(T0 + 30 * 60_000),
      durationMs: 30 * 60_000,
      status: 'breached',
    });
  });
});

describe('buildSlaMilestones — resolução', () => {
  it('conversa em aberto não tem marco de resolução', () => {
    const milestones = buildSlaMilestones([row('r1', { first_response_at: iso(T0 + 30_000) })], [], LIMITS, T0);
    expect(milestones.some((m) => m.kind === 'resolution')).toBe(false);
  });

  it('resolução dentro do prazo e violação gravada mudam a situação', () => {
    const noPrazo = buildSlaMilestones(
      [row('r1', { resolved_at: iso(T0 + 30 * 60_000) })],
      [],
      LIMITS,
      T0,
    );
    expect(noPrazo.find((m) => m.id === 'r1-resolution')).toMatchObject({
      durationMs: 30 * 60_000,
      status: 'ok',
      limitMinutes: 60,
    });

    const violada = buildSlaMilestones(
      [row('r1', { resolved_at: iso(T0 + 30 * 60_000), resolution_breached: true })],
      [],
      LIMITS,
      T0,
    );
    expect(violada.find((m) => m.id === 'r1-resolution')?.status).toBe('breached');
  });
});

describe('buildSlaMilestones — transferências e linhas inválidas', () => {
  it('só evento de transferência do TR1 vira marco (e sem prazo)', () => {
    const events: SlaTimelineEvent[] = [
      { id: 'e1', event_type: 'transfer', created_at: iso(T0 + 90_000) },
      { id: 'e2', event_type: 'message', created_at: iso(T0 + 95_000) },
      { id: 'e3', event_type: 'queue_transfer', created_at: iso(T0 + 120_000) },
    ];
    const milestones = buildSlaMilestones([], events, LIMITS, T0);
    const transfers = milestones.filter((m) => m.kind === 'transfer');

    expect(transfers.map((m) => m.id)).toEqual(['transfer-e3', 'transfer-e1']);
    expect(transfers[0]).toMatchObject({ deadlineAt: null, durationMs: null, status: 'na', limitMinutes: null });
  });

  it('data inválida não rende marco inventado', () => {
    const milestones = buildSlaMilestones(
      [row('r1', { first_message_at: 'não é data' })],
      [{ id: 'e1', event_type: 'transfer', created_at: '' }],
      LIMITS,
      T0,
    );
    expect(milestones).toEqual([]);
  });

  it('ordena do mais recente para o mais antigo', () => {
    const milestones = buildSlaMilestones(
      [
        row('antiga', { resolved_at: iso(T0 + 60_000) }),
        row('nova', { first_message_at: iso(T0 + 2 * 3_600_000), first_response_at: iso(T0 + 2 * 3_600_000 + 30_000) }),
      ],
      [],
      LIMITS,
      T0 + 3 * 3_600_000,
    );

    const ats = milestones.map((m) => m.at);
    expect([...ats].sort((a, b) => b.localeCompare(a))).toEqual(ats);
    expect(milestones[0].id).toBe('nova-first_response');
  });
});

describe('filterSlaMilestones', () => {
  const aberturas = buildSlaMilestones(
    [
      row('hoje'),
      row('tres-dias', { first_message_at: iso(T0 - 3 * 24 * 3_600_000) }),
    ],
    [{ id: 'e1', event_type: 'transfer', created_at: iso(T0 - 3 * 24 * 3_600_000 + 1_000) }],
    LIMITS,
    T0,
  );

  it('"24h" corta o que passou de um dia', () => {
    const ids = filterSlaMilestones(aberturas, { period: '24h', kinds: 'all' }, T0).map((m) => m.id);
    expect(ids).toContain('hoje-opened');
    expect(ids).not.toContain('tres-dias-opened');
  });

  it('"all" mantém tudo', () => {
    expect(filterSlaMilestones(aberturas, {}, T0)).toHaveLength(aberturas.length);
  });

  it('filtra por tipo', () => {
    const soTransferencia = filterSlaMilestones(aberturas, { kinds: ['transfer'] }, T0);
    expect(soTransferencia.map((m) => m.kind)).toEqual(['transfer']);
  });

  it('"7d" conta dias de calendário e ainda pega o marco de 3 dias atrás', () => {
    expect(filterSlaMilestones(aberturas, { period: '7d' }, T0).map((m) => m.id)).toContain('tres-dias-opened');
  });

  it('o marco anterior à janela de calendário fica de fora', () => {
    const seteDias = buildSlaMilestones(
      [row('limite', { first_message_at: iso(slaWindowStartMs('7d', T0)! - 1) })],
      [],
      LIMITS,
      T0,
    );
    expect(filterSlaMilestones(seteDias, { period: '7d' }, T0)).toEqual([]);
  });
});

describe('buildSlaMilestones — quem respondeu', () => {
  const assign = (
    id: string,
    atMs: number,
    over: Partial<SlaTimelineEvent> = {},
  ): SlaTimelineEvent => ({
    id,
    event_type: 'assign',
    created_at: iso(atMs),
    ...over,
  });

  const comAgente = { to_agent_id: 'ag-1', to_agent: { id: 'ag-1', name: 'Ana' } };
  const resposta = (over: Partial<SlaTimelineRow> = {}) =>
    row('c1', { first_response_at: iso(T0 + 2 * 60_000), ...over });
  const primeiro = (marcos: SlaMilestone[]) =>
    marcos.find((m) => m.kind === 'first_response')!;

  it('usa o agente e a fila do `assign` entre a abertura e a resposta', () => {
    const marcos = buildSlaMilestones(
      [resposta()],
      [
        assign('a1', T0 + 30_000, {
          ...comAgente,
          to_queue_id: 'q-1',
          to_queue: { id: 'q-1', name: 'Suporte' },
        }),
      ],
      LIMITS,
      T0,
    );

    const marco = primeiro(marcos);
    expect(marco.answeredBy).toEqual({
      agentId: 'ag-1',
      agentName: 'Ana',
      queueId: 'q-1',
      queueName: 'Suporte',
    });
    expect(formatSlaAttribution(marco.answeredBy)).toBe('Respondido por Ana (fila Suporte)');
  });

  it('o último `assign` da janela vence o primeiro', () => {
    const marcos = buildSlaMilestones(
      [resposta()],
      [
        assign('a1', T0 + 10_000, { to_agent_id: 'ag-1', to_agent: { name: 'Ana' } }),
        assign('a2', T0 + 60_000, { to_agent_id: 'ag-2', to_agent: { name: 'Beto' } }),
      ],
      LIMITS,
      T0,
    );

    expect(primeiro(marcos).answeredBy?.agentName).toBe('Beto');
    expect(formatSlaAttribution(primeiro(marcos).answeredBy)).toBe('Respondido por Beto');
  });

  it('sem evento de atribuição não há responsável (nada é inventado)', () => {
    const marcos = buildSlaMilestones([resposta()], [], LIMITS, T0);

    expect(primeiro(marcos).answeredBy).toBeNull();
    expect(formatSlaAttribution(primeiro(marcos).answeredBy)).toBeNull();
  });

  it('evento posterior à resposta não atribui a resposta', () => {
    const marcos = buildSlaMilestones(
      [resposta()],
      [assign('a1', T0 + 3 * 60_000, comAgente)],
      LIMITS,
      T0,
    );

    expect(primeiro(marcos).answeredBy).toBeNull();
  });

  it('evento anterior à abertura não conta', () => {
    const marcos = buildSlaMilestones(
      [resposta()],
      [assign('a1', T0 - 1_000, comAgente)],
      LIMITS,
      T0,
    );

    expect(primeiro(marcos).answeredBy).toBeNull();
  });

  it('sem fila no `assign`, usa a fila do último evento com fila na janela', () => {
    const marcos = buildSlaMilestones(
      [resposta()],
      [
        {
          id: 't1',
          event_type: 'queue_transfer',
          created_at: iso(T0 + 10_000),
          to_queue_id: 'q-9',
          to_queue: { id: 'q-9', name: 'Vendas' },
        },
        assign('a1', T0 + 20_000, comAgente),
      ],
      LIMITS,
      T0,
    );

    expect(primeiro(marcos).answeredBy).toEqual({
      agentId: 'ag-1',
      agentName: 'Ana',
      queueId: 'q-9',
      queueName: 'Vendas',
    });
  });

  it('evento de atribuição sozinho não vira marco e não contamina os outros marcos', () => {
    const marcos = buildSlaMilestones(
      [row('c1')],
      [assign('a1', T0 + 10_000, comAgente)],
      LIMITS,
      T0,
    );

    expect(marcos.map((m) => m.kind)).toEqual(['first_response', 'opened']);
    expect(marcos.every((m) => m.answeredBy === null)).toBe(true);
  });

  it('sem nome no `assign` o texto não promete fila nem agente', () => {
    const marcos = buildSlaMilestones(
      [resposta()],
      [assign('a1', T0 + 10_000, { to_agent_id: 'ag-1' })],
      LIMITS,
      T0,
    );

    expect(primeiro(marcos).answeredBy).toEqual({
      agentId: 'ag-1',
      agentName: null,
      queueId: null,
      queueName: null,
    });
    expect(formatSlaAttribution(primeiro(marcos).answeredBy)).toBeNull();
  });
});
