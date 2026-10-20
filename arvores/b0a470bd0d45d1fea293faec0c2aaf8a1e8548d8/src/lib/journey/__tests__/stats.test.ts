import { describe, it, expect } from 'vitest';
import { computeJourneyStats } from '@/lib/journey/stats';
import type { StatsInput, StatsRange, StatsUserProfile } from '@/lib/journey/stats';

/**
 * Estatísticas do contato (S073–S083).
 *
 * Todos os instantes são montados em hora LOCAL (`new Date(ano, mes, dia, hora, min)`) e
 * conferidos em hora local: assim o teste não depende do fuso da máquina que roda a suíte.
 */
function at(ano: number, mes: number, dia: number, hora = 9, minuto = 0): string {
  return new Date(ano, mes - 1, dia, hora, minuto).toISOString();
}

/** Período do cartão: 01/10/2026 00:00 → 07/10/2026 23:59:59 (hora local). */
const PERIODO: StatsRange = { from: new Date(2026, 9, 1, 0, 0, 0), to: new Date(2026, 9, 7, 23, 59, 59) };
/** Período anterior equivalente: 24/09/2026 → 30/09/2026. */
const ANTERIOR = { from: new Date(2026, 8, 24, 0, 0, 0), to: new Date(2026, 8, 30, 23, 59, 59) };
/** `now` fixo, para `daysSinceLast` e para a tarefa atrasada não dependerem do relógio. */
const AGORA = new Date(2026, 9, 9, 21, 0, 0);

const USUARIOS: Record<string, StatsUserProfile> = {
  u1: { name: 'Ana Souza', avatarUrl: 'https://exemplo.test/ana.png' },
  u2: { name: 'Bruno Lima', avatarUrl: null },
};

function entradaVazia(): StatsInput {
  return {
    messages: [],
    calls: [],
    emails: [],
    notes: [],
    tasks: [],
    files: [],
    deals: [],
    transfers: [],
    cases: [],
    csat: { average: null, count: 0 },
  };
}

/**
 * Base do cartão: 32 interações no período (6 + 8 + 8 + 4 + 1 + 4 + 1 por dia, de 01/10 a 07/10),
 * com o período anterior (24–30/09) semeado para a tendência.
 */
function entradaBase(): StatsInput {
  return {
    messages: [
      // período — 5 recebidas, 4 enviadas
      { id: 'msg1', sender: 'contact', agentId: null, at: at(2026, 10, 1, 10, 0) },
      { id: 'msg2', sender: 'agent', agentId: 'u1', at: at(2026, 10, 1, 10, 30) }, // +30 min = 1ª resposta
      { id: 'msg3', sender: 'contact', agentId: null, at: at(2026, 10, 2, 9, 0) },
      { id: 'msg4', sender: 'contact', agentId: null, at: at(2026, 10, 2, 9, 5) }, // rajada: só a última casa
      { id: 'msg5', sender: 'agent', agentId: 'u2', at: at(2026, 10, 2, 9, 20) }, // +15 min
      { id: 'msg6', sender: 'contact', agentId: null, at: at(2026, 10, 3, 8, 0) },
      { id: 'msg7', sender: 'agent', agentId: null, at: at(2026, 10, 3, 12, 0) }, // +240 min, sem autor
      { id: 'msg8', sender: 'contact', agentId: null, at: at(2026, 10, 4, 10, 0) },
      { id: 'msg9', sender: 'agent', agentId: 'u2', at: at(2026, 10, 7, 21, 0) }, // +83 h: FORA da janela
      // período anterior — resposta de 40 e 60 min (média 50)
      { id: 'prev1', sender: 'contact', agentId: null, at: at(2026, 9, 25, 10, 0) },
      { id: 'prev2', sender: 'agent', agentId: 'u2', at: at(2026, 9, 25, 10, 40) },
      { id: 'prev3', sender: 'contact', agentId: null, at: at(2026, 9, 26, 10, 0) },
      { id: 'prev4', sender: 'agent', agentId: 'u1', at: at(2026, 9, 26, 11, 0) },
    ],
    calls: [
      { id: 'call1', direction: 'inbound', status: 'ended', agentId: 'u1', at: at(2026, 10, 2, 14, 0), talkSeconds: 120, durationSeconds: 150 },
      { id: 'call2', direction: 'inbound', status: 'missed', agentId: null, at: at(2026, 10, 3, 14, 0), talkSeconds: null, durationSeconds: 12 },
      { id: 'call3', direction: 'outbound', status: 'answered', agentId: 'u2', at: at(2026, 10, 5, 14, 0), talkSeconds: 300, durationSeconds: 320 },
      { id: 'call4', direction: 'outbound', status: 'busy', agentId: 'u2', at: at(2026, 10, 6, 14, 0), talkSeconds: null, durationSeconds: 8 },
      { id: 'prevCall', direction: 'inbound', status: 'missed', agentId: null, at: at(2026, 9, 26, 14, 0), talkSeconds: null, durationSeconds: 5 },
    ],
    emails: [
      { id: 'e1', threadId: 't1', direction: 'inbound', at: at(2026, 10, 1, 11, 0) },
      { id: 'e2', threadId: 't1', direction: 'outbound', at: at(2026, 10, 1, 12, 0) },
      { id: 'e3', threadId: 't2', direction: 'inbound', at: at(2026, 10, 2, 11, 0) },
      { id: 'e4', threadId: 't2', direction: 'inbound', at: at(2026, 10, 2, 11, 30) },
      { id: 'e5', threadId: 't3', direction: 'outbound', at: at(2026, 10, 3, 11, 0) },
      // mesma conversa t1, mas depois da resposta: continua sem resposta DEPOIS dele
      { id: 'e6', threadId: 't1', direction: 'inbound', at: at(2026, 10, 3, 12, 0) },
    ],
    notes: [
      { id: 'n1', at: at(2026, 10, 2, 15, 0) },
      { id: 'prevNote', at: at(2026, 9, 27, 10, 0) },
    ],
    tasks: [
      { id: 't1', status: 'done', dueDate: at(2026, 10, 1, 12, 0), completedAt: at(2026, 10, 2, 12, 0), at: at(2026, 10, 1, 9, 0) },
      { id: 't2', status: 'open', dueDate: at(2026, 10, 5, 9, 0), completedAt: null, at: at(2026, 10, 4, 9, 0) }, // atrasada
      { id: 't3', status: 'pending', dueDate: null, completedAt: null, at: at(2026, 10, 6, 9, 0) }, // prazo nulo
      { id: 't4', status: 'in_progress', dueDate: at(2026, 10, 20, 9, 0), completedAt: null, at: at(2026, 10, 6, 10, 0) }, // futuro
      { id: 't5', status: 'open', dueDate: null, completedAt: at(2026, 10, 6, 12, 0), at: at(2026, 10, 6, 11, 0) }, // carimbo vence o status
    ],
    files: [
      { id: 'f1', at: at(2026, 10, 3, 9, 0) },
      { id: 'f2', at: at(2026, 10, 3, 9, 30) },
    ],
    deals: [
      { id: 'd1', value: 1000, status: 'won', at: at(2026, 10, 1, 12, 0) },
      { id: 'd2', value: 500, status: 'lost', at: at(2026, 10, 2, 12, 0) },
      { id: 'd3', value: null, status: 'open', at: at(2026, 10, 3, 12, 0) },
    ],
    transfers: [
      { id: 'tr1', at: at(2026, 10, 4, 9, 0) },
      { id: 'tr2', at: at(2026, 10, 4, 9, 30) },
    ],
    cases: [
      { id: 'c1', kind: 'closed', at: at(2026, 10, 5, 10, 0) },
      { id: 'c2', kind: 'reopened', at: at(2026, 10, 6, 10, 0) },
      { id: 'c3', kind: 'closed', at: at(2026, 10, 7, 10, 0) },
    ],
    csat: { average: 4.5, count: 8 },
  };
}

function base() {
  return computeJourneyStats(entradaBase(), PERIODO, ANTERIOR, AGORA, USUARIOS);
}

describe('computeJourneyStats — totais por categoria (S074)', () => {
  it('conta cada categoria separada e a soma em `all`', () => {
    const s = base();
    expect(s.totals).toEqual({
      messages: 9,
      messagesSent: 4,
      messagesReceived: 5,
      emails: 6,
      emailsSent: 2,
      emailsReceived: 4,
      calls: 4,
      notes: 1,
      tasks: 5,
      files: 2,
      deals: 3,
      transfers: 2,
      all: 32,
    });
  });

  it('linha com data inválida não entra na conta nem produz NaN', () => {
    const input = entradaBase();
    input.messages.push({ id: 'quebrada', sender: 'contact', agentId: null, at: 'não-é-data' });
    input.calls.push({ id: 'quebrada', direction: 'inbound', status: 'missed', agentId: null, at: '', talkSeconds: null, durationSeconds: null });
    const s = computeJourneyStats(input, PERIODO, ANTERIOR, AGORA, USUARIOS);
    expect(s.totals).toEqual(base().totals);
    expect(JSON.stringify(s)).not.toContain('NaN');
    expect(JSON.stringify(s)).not.toContain('Infinity');
  });

  it('entrada vazia devolve zeros sem estourar', () => {
    const s = computeJourneyStats(entradaVazia(), PERIODO, ANTERIOR, AGORA, USUARIOS);
    expect(s.totals).toEqual({
      messages: 0,
      messagesSent: 0,
      messagesReceived: 0,
      emails: 0,
      emailsSent: 0,
      emailsReceived: 0,
      calls: 0,
      notes: 0,
      tasks: 0,
      files: 0,
      deals: 0,
      transfers: 0,
      all: 0,
    });
  });

  it('período invertido (de > até) não casa com nada', () => {
    const s = computeJourneyStats(
      entradaBase(),
      { from: new Date(2026, 9, 7), to: new Date(2026, 9, 1) },
      null,
      AGORA,
      USUARIOS,
    );
    expect(s.totals.all).toBe(0);
    expect(s.dailySeries).toEqual([]);
  });

  it('conta o período anterior separado, sem contaminar o atual', () => {
    const s = base();
    expect(s.previous?.totals).toEqual({
      messages: 4,
      messagesSent: 2,
      messagesReceived: 2,
      emails: 0,
      emailsSent: 0,
      emailsReceived: 0,
      calls: 1,
      notes: 1,
      tasks: 0,
      files: 0,
      deals: 0,
      transfers: 0,
      all: 6,
    });
  });
});

describe('primeira e última interação (S075)', () => {
  it('usa TODO o histórico, inclusive o que está fora do período', () => {
    const s = base();
    expect(s.firstInteractionAt).toBe(at(2026, 9, 25, 10, 0));
    expect(s.lastInteractionAt).toBe(at(2026, 10, 7, 21, 0));
  });

  it('daysSinceLast em dias inteiros até `now` (piso)', () => {
    expect(base().daysSinceLast).toBe(2); // última interação 07/10 21:00, `now` 09/10 21:00
    const outro = computeJourneyStats(entradaBase(), PERIODO, ANTERIOR, new Date(2026, 9, 9, 23, 0, 0), USUARIOS);
    expect(outro.daysSinceLast).toBe(2);
    const maisTarde = computeJourneyStats(entradaBase(), PERIODO, ANTERIOR, new Date(2026, 9, 10, 3, 0, 0), USUARIOS);
    expect(maisTarde.daysSinceLast).toBe(2); // 6 h a mais, ainda o 2º dia
  });

  it('entrada vazia → null', () => {
    const s = computeJourneyStats(entradaVazia(), PERIODO, ANTERIOR, AGORA, USUARIOS);
    expect(s.firstInteractionAt).toBeNull();
    expect(s.lastInteractionAt).toBeNull();
    expect(s.daysSinceLast).toBeNull();
  });
});

describe('tempo de resposta (S076)', () => {
  it('1ª resposta, média e mediana do período (rajada conta uma vez)', () => {
    const s = base();
    expect(s.response.firstResponseMin).toBe(30);
    expect(s.response.avgResponseMin).toBe(95); // (30 + 15 + 240) / 3
    expect(s.response.medianResponseMin).toBe(30);
    expect(s.response.sampleSize).toBe(3);
  });

  it('ignora a resposta que veio depois de 72 h', () => {
    const input = entradaVazia();
    input.messages = [
      { id: 'c', sender: 'contact', agentId: null, at: at(2026, 10, 4, 10, 0) },
      { id: 'a', sender: 'agent', agentId: 'u1', at: at(2026, 10, 7, 21, 0) }, // 83 h
    ];
    const s = computeJourneyStats(input, PERIODO, null, AGORA, USUARIOS);
    expect(s.response.sampleSize).toBe(0);
    expect(s.response.avgResponseMin).toBeNull();
    expect(s.response.firstResponseMin).toBeNull();
    expect(s.response.medianResponseMin).toBeNull();
  });

  it('aceita exatamente 72 h', () => {
    const input = entradaVazia();
    input.messages = [
      { id: 'c', sender: 'contact', agentId: null, at: at(2026, 10, 4, 10, 0) },
      { id: 'a', sender: 'agent', agentId: 'u1', at: at(2026, 10, 7, 10, 0) }, // 72 h cravadas
    ];
    const s = computeJourneyStats(input, PERIODO, null, AGORA, USUARIOS);
    expect(s.response.sampleSize).toBe(1);
    expect(s.response.avgResponseMin).toBe(4320);
  });

  it('período anterior equivalente alimenta a tendência', () => {
    const s = base();
    expect(s.previous?.response.firstResponseMin).toBe(40);
    expect(s.previous?.response.avgResponseMin).toBe(50);
    expect(s.previous?.response.medianResponseMin).toBe(50);
    // média subiu de 50 para 95 → +90 %
    expect(s.trendPct).toBe(90);
  });

  it('sem período anterior não há tendência', () => {
    const s = computeJourneyStats(entradaBase(), PERIODO, null, AGORA, USUARIOS);
    expect(s.previous).toBeNull();
    expect(s.trendPct).toBeNull();
    expect(s.response.avgResponseMin).toBe(95);
  });

  it('período anterior sem nenhuma resposta também não dá base', () => {
    const input = entradaVazia();
    input.messages = [
      { id: 'c', sender: 'contact', agentId: null, at: at(2026, 10, 2, 10, 0) },
      { id: 'a', sender: 'agent', agentId: 'u1', at: at(2026, 10, 2, 10, 30) },
      { id: 'pc', sender: 'contact', agentId: null, at: at(2026, 9, 26, 10, 0) }, // sem resposta
    ];
    const s = computeJourneyStats(input, PERIODO, ANTERIOR, AGORA, USUARIOS);
    expect(s.previous?.response.sampleSize).toBe(0);
    expect(s.previous?.response.avgResponseMin).toBeNull();
    expect(s.trendPct).toBeNull();
  });

  it('tendência negativa quando a resposta fica mais rápida', () => {
    const input = entradaVazia();
    input.messages = [
      { id: 'pc', sender: 'contact', agentId: null, at: at(2026, 9, 26, 10, 0) },
      { id: 'pa', sender: 'agent', agentId: 'u1', at: at(2026, 9, 26, 11, 40) }, // 100 min
      { id: 'c', sender: 'contact', agentId: null, at: at(2026, 10, 2, 10, 0) },
      { id: 'a', sender: 'agent', agentId: 'u1', at: at(2026, 10, 2, 10, 10) }, // 10 min
    ];
    const s = computeJourneyStats(input, PERIODO, ANTERIOR, AGORA, USUARIOS);
    expect(s.trendPct).toBe(-90);
  });

  it('trava a tendência em ±999', () => {
    const input = entradaVazia();
    input.messages = [
      { id: 'pc', sender: 'contact', agentId: null, at: at(2026, 9, 26, 10, 0) },
      { id: 'pa', sender: 'agent', agentId: 'u1', at: at(2026, 9, 26, 10, 1) }, // 1 min de base
      { id: 'c', sender: 'contact', agentId: null, at: at(2026, 10, 2, 10, 0) },
      { id: 'a', sender: 'agent', agentId: 'u1', at: at(2026, 10, 2, 19, 0) }, // 540 min
    ];
    const s = computeJourneyStats(input, PERIODO, ANTERIOR, AGORA, USUARIOS);
    expect(s.trendPct).toBe(999);
  });
});

describe('ligações (S077)', () => {
  it('total, atendidas, perdidas e tempo falado', () => {
    const s = base();
    expect(s.calls.total).toBe(4);
    expect(s.calls.answered).toBe(2); // `ended` com talkSeconds + `answered`
    expect(s.calls.missed).toBe(1); // status `missed`
    expect(s.calls.unanswered).toBe(2); // perdida + ocupada
    expect(s.calls.talkSecondsTotal).toBe(420); // 120 + 300
    expect(s.calls.avgTalkSeconds).toBe(210); // só as duas com duração
  });

  it('entrada vazia → zeros e média null (sem divisão por zero)', () => {
    const s = computeJourneyStats(entradaVazia(), PERIODO, null, AGORA, USUARIOS);
    expect(s.calls).toEqual({ total: 0, answered: 0, missed: 0, unanswered: 0, talkSecondsTotal: 0, avgTalkSeconds: null });
  });
});

describe('e-mails (S078)', () => {
  it('enviados, recebidos e sem resposta', () => {
    const s = base();
    expect(s.emails.sent).toBe(2); // e2, e5
    expect(s.emails.received).toBe(4); // e1, e3, e4, e6
    expect(s.emails.unansweredInbound).toBe(3); // e3, e4 (t2 sem resposta) e e6 (resposta ANTES dele em t1)
  });

  it('resposta enviada depois do recebido resolve a conversa', () => {
    const input = entradaVazia();
    input.emails = [
      { id: 'e1', threadId: 't1', direction: 'inbound', at: at(2026, 10, 1, 11, 0) },
      { id: 'e2', threadId: 't1', direction: 'outbound', at: at(2026, 10, 1, 12, 0) },
    ];
    const s = computeJourneyStats(input, PERIODO, null, AGORA, USUARIOS);
    expect(s.emails).toEqual({ sent: 1, received: 1, unansweredInbound: 0 });
  });

  it('entrada vazia → zeros', () => {
    const s = computeJourneyStats(entradaVazia(), PERIODO, null, AGORA, USUARIOS);
    expect(s.emails).toEqual({ sent: 0, received: 0, unansweredInbound: 0 });
  });
});

describe('atendimentos, resoluções e reaberturas (S079)', () => {
  it('conta episódios separados por mais de 24 h sem interação', () => {
    // 12:00 de 01/10 → 09:00 de 02/10 (21 h) seguem; 14:00 de 02/10 → 08:00 de 03/10 (18 h) seguem;
    // 10:00 de 04/10 → 14:00 de 05/10 (28 h) abrem episódio; 14:00 de 05/10 → 14:00 de 06/10 (24 h
    // cravadas) NÃO abrem; 14:00 de 06/10 → 21:00 de 07/10 (31 h) abrem.
    expect(base().episodes.episodes).toBe(3);
    expect(base().episodes.resolutions).toBe(2);
    expect(base().episodes.reopenings).toBe(1);
  });

  it('24 h cravadas continuam no mesmo episódio; 24 h e 1 min abrem outro', () => {
    const limite = entradaVazia();
    limite.messages = [
      { id: 'a', sender: 'contact', agentId: null, at: at(2026, 10, 2, 9, 0) },
      { id: 'b', sender: 'contact', agentId: null, at: at(2026, 10, 3, 9, 0) },
    ];
    expect(computeJourneyStats(limite, PERIODO, null, AGORA, USUARIOS).episodes.episodes).toBe(1);

    const passou = entradaVazia();
    passou.messages = [
      { id: 'a', sender: 'contact', agentId: null, at: at(2026, 10, 2, 9, 0) },
      { id: 'b', sender: 'contact', agentId: null, at: at(2026, 10, 3, 9, 1) },
    ];
    expect(computeJourneyStats(passou, PERIODO, null, AGORA, USUARIOS).episodes.episodes).toBe(2);
  });

  it('nota interna não cria episódio de atendimento', () => {
    const input = entradaVazia();
    input.messages = [{ id: 'a', sender: 'contact', agentId: null, at: at(2026, 10, 2, 9, 0) }];
    input.notes = [{ id: 'n', at: at(2026, 10, 4, 9, 0) }];
    expect(computeJourneyStats(input, PERIODO, null, AGORA, USUARIOS).episodes.episodes).toBe(1);
  });

  it('entrada vazia → zero', () => {
    const s = computeJourneyStats(entradaVazia(), PERIODO, null, AGORA, USUARIOS);
    expect(s.episodes).toEqual({ episodes: 0, resolutions: 0, reopenings: 0 });
  });
});

describe('ranking de quem interagiu (S080)', () => {
  it('conta mensagens de atendente e ligações, com nome e foto do perfil', () => {
    const s = base();
    expect(s.users.total).toBe(6); // u2: msg5, msg9, call3, call4 · u1: msg2, call1
    expect(s.users.ranking.map((u) => [u.agentId, u.count, u.pct])).toEqual([
      ['u2', 4, 66.7],
      ['u1', 2, 33.3],
    ]);
    expect(s.users.ranking[0]).toMatchObject({ name: 'Bruno Lima', avatarUrl: null });
    expect(s.users.ranking[1]).toMatchObject({ name: 'Ana Souza', avatarUrl: 'https://exemplo.test/ana.png' });
    expect(s.users.top3).toHaveLength(2);
  });

  it('empate desempata pelo id (crescente) e usuário sem perfil vem com nome nulo', () => {
    const input = entradaVazia();
    input.messages = [
      { id: 'a', sender: 'agent', agentId: 'u9', at: at(2026, 10, 2, 9, 0) },
      { id: 'b', sender: 'agent', agentId: 'u10', at: at(2026, 10, 2, 10, 0) },
    ];
    const s = computeJourneyStats(input, PERIODO, null, AGORA, { u9: { name: 'Zeca', avatarUrl: null } });
    expect(s.users.ranking.map((u) => u.agentId)).toEqual(['u10', 'u9']);
    expect(s.users.ranking[0]).toMatchObject({ name: null, avatarUrl: null, pct: 50 });
    expect(s.users.ranking[1]).toMatchObject({ name: 'Zeca', pct: 50 });
  });

  it('mensagem de atendente sem autor não entra no ranking', () => {
    const input = entradaVazia();
    input.messages = [{ id: 'a', sender: 'agent', agentId: null, at: at(2026, 10, 2, 9, 0) }];
    const s = computeJourneyStats(input, PERIODO, null, AGORA, USUARIOS);
    expect(s.users.ranking).toEqual([]);
    expect(s.users.total).toBe(0);
  });

  it('a lista corta em 3 para o topo, mas o ranking completo fica', () => {
    const input = entradaVazia();
    input.messages = ['i1', 'i2', 'i3', 'i4'].map((id, i) => ({
      id,
      sender: 'agent' as const,
      agentId: `u${i + 1}`,
      at: at(2026, 10, 2, 9, i),
    }));
    const s = computeJourneyStats(input, PERIODO, null, AGORA, USUARIOS);
    expect(s.users.ranking).toHaveLength(4);
    expect(s.users.top3).toHaveLength(3);
    expect(s.users.total).toBe(4);
  });
});

describe('tarefas, notas, arquivos e propostas (S081)', () => {
  it('abertas, concluídas e atrasadas (prazo nulo nunca atrasa)', () => {
    const s = base();
    // t1 (`done`) e t5 (status legado + carimbo de conclusão) fechadas; t2, t3 e t4 abertas.
    expect(s.tasks).toEqual({ total: 5, open: 3, done: 2, overdue: 1 });
  });

  it('contagem de arquivos e notas vem dos totais do período', () => {
    const s = base();
    expect(s.totals.notes).toBe(1);
    expect(s.totals.files).toBe(2);
  });

  it('propostas: quantidade, valor total e valor ganho', () => {
    const s = base();
    expect(s.deals).toEqual({ count: 3, valueTotal: 1500, valueWon: 1000, won: 1, lost: 1 });
  });

  it('valor nulo ou inválido não vira NaN', () => {
    const input = entradaVazia();
    input.deals = [
      { id: 'd1', value: null, status: 'won', at: at(2026, 10, 2, 9, 0) },
      { id: 'd2', value: Number.NaN, status: 'open', at: at(2026, 10, 2, 10, 0) },
    ];
    const s = computeJourneyStats(input, PERIODO, null, AGORA, USUARIOS);
    expect(s.deals).toEqual({ count: 2, valueTotal: 0, valueWon: 0, won: 1, lost: 0 });
  });
});

describe('CSAT (S082)', () => {
  it('repassa média e contagem sem recalcular', () => {
    expect(base().csat).toEqual({ average: 4.5, count: 8 });
  });
});

describe('série diária e picos (S083)', () => {
  it('preenche os dias do período, inclusive os vazios', () => {
    const s = base();
    expect(s.dailySeries).toEqual([
      { date: '2026-10-01', count: 6 },
      { date: '2026-10-02', count: 8 },
      { date: '2026-10-03', count: 8 },
      { date: '2026-10-04', count: 4 },
      { date: '2026-10-05', count: 1 },
      { date: '2026-10-06', count: 4 },
      { date: '2026-10-07', count: 1 },
    ]);
  });

  it('dia sem interação vira 0, sem sumir da série', () => {
    const input = entradaVazia();
    input.messages = [
      { id: 'a', sender: 'contact', agentId: null, at: at(2026, 10, 1, 10, 0) },
      { id: 'b', sender: 'contact', agentId: null, at: at(2026, 10, 3, 10, 0) },
    ];
    const s = computeJourneyStats(
      input,
      { from: new Date(2026, 9, 1, 0, 0, 0), to: new Date(2026, 9, 4, 23, 59, 59) },
      null,
      AGORA,
      USUARIOS,
    );
    expect(s.dailySeries).toEqual([
      { date: '2026-10-01', count: 1 },
      { date: '2026-10-02', count: 0 },
      { date: '2026-10-03', count: 1 },
      { date: '2026-10-04', count: 0 },
    ]);
  });

  it('período longo é cortado em 120 dias, terminando no fim do período', () => {
    const s = computeJourneyStats(
      entradaVazia(),
      { from: new Date(2026, 0, 1, 0, 0, 0), to: new Date(2026, 9, 7, 23, 59, 59) },
      null,
      AGORA,
      USUARIOS,
    );
    expect(s.dailySeries).toHaveLength(120);
    expect(s.dailySeries[0].date).toBe('2026-06-10');
    expect(s.dailySeries[119].date).toBe('2026-10-07');
  });

  it('período "qualquer data" usa os últimos 90 dias até `now`', () => {
    const s = computeJourneyStats(entradaVazia(), { from: null, to: null }, null, AGORA, USUARIOS);
    expect(s.dailySeries).toHaveLength(90);
    expect(s.dailySeries[0].date).toBe('2026-07-12'); // 12/07 a 09/10 = 90 dias
    expect(s.dailySeries[89].date).toBe('2026-10-09');
  });

  it('horário e dia da semana mais ativos vêm das mensagens do CONTATO', () => {
    const s = base();
    // contato às 10:00 (msg1), 09:00 (msg3), 09:05 (msg4), 08:00 (msg6), 10:00 (msg8)
    // horas: 9 → 2, 10 → 2, 8 → 1 · empate desempata pela hora menor
    expect(s.peakHour).toBe(9);
    // 01/10 qui, 02/10 sex (2), 03/10 sáb, 04/10 dom
    expect(s.peakWeekday).toBe(5);
  });

  it('sem mensagem do contato → picos null', () => {
    const s = computeJourneyStats(entradaVazia(), PERIODO, null, AGORA, USUARIOS);
    expect(s.peakHour).toBeNull();
    expect(s.peakWeekday).toBeNull();
  });
});
