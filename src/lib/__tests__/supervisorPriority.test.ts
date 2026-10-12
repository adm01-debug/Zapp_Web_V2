/**
 * Contrato P1–P4 da fila do supervisor (porte da V3, E60).
 *
 * As regras valem exatamente como em `PRIORITY_RULES_TEXT`:
 *   P1 Crítica → sem atendente há 30 min ou mais, OU risco ≥ 80, OU urgência da IA.
 *   P2 Alta    → aguardando há 15 min ou mais, OU risco ≥ 60.
 *   P3 Média   → aguardando há 5 min ou mais, OU risco ≥ 40.
 *   P4 Normal  → demais conversas em atendimento.
 *
 * Casos-limite: fronteiras exatas (30/15/5), empates no sort, valor inválido
 * (risco negativo, `updated_at` futuro/inválido), risco `null`, e a leitura de
 * urgência pelo vocabulário canônico (legados `urgent`/`high`/`alta`/`critical`).
 */
import { describe, it, expect } from 'vitest';
import {
  computePriority,
  sortByPriority,
  PRIORITY_META,
  PRIORITY_RULES_TEXT,
  type PriorityLevel,
  type SupervisorConversationInput,
} from '../supervisorPriority';

const NOW = new Date('2026-08-18T12:00:00.000Z');

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function input(overrides: Partial<SupervisorConversationInput> = {}): SupervisorConversationInput {
  return {
    id: 'c1',
    name: 'Contato Teste',
    phone: '5511999999999',
    assigned_to: 'agent-1',
    queue_id: null,
    ai_priority: null,
    risk_score: null,
    updated_at: minutesAgo(1),
    ...overrides,
  };
}

describe('computePriority (regras P1-P4)', () => {
  it('P1: sem atendente há exatamente 30 min (fronteira)', () => {
    const r = computePriority(input({ assigned_to: null, updated_at: minutesAgo(30) }), NOW);
    expect(r.level).toBe('critical');
    expect(r.label).toBe(PRIORITY_META.critical.label);
    expect(r.reason).toBe('Sem atendente há 30 min');
  });

  it('P1: 29 min sem atendente NÃO é P1 (fronteira abaixo)', () => {
    const r = computePriority(input({ assigned_to: null, updated_at: minutesAgo(29) }), NOW);
    expect(r.level).toBe('high');
  });

  it('P1: com atendente, 30 min de espera não dispara a regra de "sem atendente"', () => {
    const r = computePriority(input({ updated_at: minutesAgo(30) }), NOW);
    expect(r.level).toBe('high');
  });

  it('P1: risco ≥ 80 mesmo com atendente e tempo curto', () => {
    const r = computePriority(input({ risk_score: 80, updated_at: minutesAgo(1) }), NOW);
    expect(r.level).toBe('critical');
    expect(r.reason).toBe('Risco alto (80)');
  });

  it('P1: risco 79 não sobe para P1 (fronteira)', () => {
    const r = computePriority(input({ risk_score: 79, updated_at: minutesAgo(1) }), NOW);
    expect(r.level).toBe('high'); // risco ≥ 60 → P2
  });

  it('P1: urgência da IA lida pelo vocabulário canônico (legados EN e pt-BR)', () => {
    for (const token of ['URGENT', 'urgent', 'critical', 'Alta', 'alta', 'critica']) {
      const r = computePriority(input({ ai_priority: token }), NOW);
      expect(r.level, `token ${token}`).toBe('critical');
      expect(r.reason, `token ${token}`).toBe('IA classificou como urgente');
    }
  });

  it('prioridade média da IA não é urgência; token desconhecido não vira P1', () => {
    expect(computePriority(input({ ai_priority: 'high' }), NOW).level).toBe('critical');
    expect(computePriority(input({ ai_priority: 'medium' }), NOW).level).toBe('normal');
    expect(computePriority(input({ ai_priority: 'normal' }), NOW).level).toBe('normal');
    expect(computePriority(input({ ai_priority: 'urgente' }), NOW).level).toBe('normal');
    expect(computePriority(input({ ai_priority: 'valor-invalido' }), NOW).level).toBe('normal');
  });

  it('P2: aguardando há exatamente 15 min (fronteira)', () => {
    const r = computePriority(input({ updated_at: minutesAgo(15) }), NOW);
    expect(r.level).toBe('high');
    expect(r.reason).toBe('Aguardando há 15 min');
  });

  it('P2: 14 min não é P2 (fronteira abaixo) — cai para P3', () => {
    const r = computePriority(input({ updated_at: minutesAgo(14) }), NOW);
    expect(r.level).toBe('medium');
  });

  it('P2: risco ≥ 60 com tempo curto', () => {
    const r = computePriority(input({ risk_score: 60, updated_at: minutesAgo(1) }), NOW);
    expect(r.level).toBe('high');
    expect(r.reason).toBe('Risco 60');
  });

  it('P3: aguardando há exatamente 5 min (fronteira)', () => {
    const r = computePriority(input({ updated_at: minutesAgo(5) }), NOW);
    expect(r.level).toBe('medium');
  });

  it('P3: risco ≥ 40 com tempo curto', () => {
    const r = computePriority(input({ risk_score: 40, updated_at: minutesAgo(1) }), NOW);
    expect(r.level).toBe('medium');
    expect(r.reason).toBe('Risco 40');
  });

  it('P4: conversa normal (1 min, risco baixo)', () => {
    const r = computePriority(input(), NOW);
    expect(r.level).toBe('normal');
    expect(r.reason).toBe('Em atendimento');
  });

  it('P4: 4 min sem atendente não dispara nenhuma regra de tempo', () => {
    const r = computePriority(input({ assigned_to: null, updated_at: minutesAgo(4) }), NOW);
    expect(r.level).toBe('normal');
  });

  it('risco null → tratado como 0 (não dispara regras de risco)', () => {
    const r = computePriority(input({ risk_score: null }), NOW);
    expect(r.level).toBe('normal');
  });

  it('risco negativo → não dispara regras (valor inválido)', () => {
    const r = computePriority(input({ risk_score: -5, updated_at: minutesAgo(1) }), NOW);
    expect(r.level).toBe('normal');
  });

  it('updated_at no futuro → waitingMinutes 0 (P4)', () => {
    const future = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    const r = computePriority(input({ updated_at: future }), NOW);
    expect(r.level).toBe('normal');
    expect(r.waitingMinutes).toBe(0);
  });

  it('updated_at inválido → nenhuma regra de tempo dispara (fail-safe para P4)', () => {
    const r = computePriority(input({ updated_at: 'not-a-date' }), NOW);
    expect(r.level).toBe('normal');
    expect(Number.isNaN(r.waitingMinutes)).toBe(true);
  });

  it('scores seguem a faixa documentada por nível', () => {
    const p1 = computePriority(input({ risk_score: 80 }), NOW);
    const p2 = computePriority(input({ risk_score: 60 }), NOW);
    const p3 = computePriority(input({ risk_score: 40 }), NOW);
    const p4 = computePriority(input(), NOW);
    expect(p1.score).toBe(1000 + p1.waitingMinutes + 80);
    expect(p2.score).toBe(500 + p2.waitingMinutes + 60);
    expect(p3.score).toBe(200 + p3.waitingMinutes + 40);
    expect(p4.score).toBe(p4.waitingMinutes);
  });

  it('prioridade não é calculada pelo relógio do render: `now` é injetado', () => {
    const early = computePriority(input({ updated_at: minutesAgo(20) }), NOW);
    const later = computePriority(
      input({ updated_at: minutesAgo(20) }),
      new Date(NOW.getTime() + 10 * 60_000)
    );
    expect(early.level).toBe('high');
    expect(later.level).toBe('high');
    expect(later.waitingMinutes).toBe(early.waitingMinutes + 10);
  });
});

describe('sortByPriority (ordenação estável)', () => {
  function row(id: string, level: PriorityLevel, score: number) {
    return { id, priority: { level, score, label: level, reason: '', waitingMinutes: 0 } };
  }

  it('ordena por nível (critical → high → medium → normal)', () => {
    const rows = [
      row('n', 'normal', 5),
      row('c', 'critical', 900),
      row('m', 'medium', 300),
      row('h', 'high', 600),
    ];
    const sorted = sortByPriority(rows);
    expect(sorted.map((r) => r.id)).toEqual(['c', 'h', 'm', 'n']);
  });

  it('mesmo nível → maior score primeiro', () => {
    const rows = [row('a', 'high', 500), row('b', 'high', 700), row('c', 'high', 600)];
    const sorted = sortByPriority(rows);
    expect(sorted.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('empate total de score → ordem original preservada (sort estável)', () => {
    const rows = [row('x', 'medium', 100), row('y', 'medium', 100), row('z', 'medium', 100)];
    const sorted = sortByPriority(rows);
    expect(sorted.map((r) => r.id)).toEqual(['x', 'y', 'z']);
  });

  it('não muta o array de entrada', () => {
    const rows = [row('n', 'normal', 5), row('c', 'critical', 900)];
    const copy = [...rows];
    sortByPriority(rows);
    expect(rows).toEqual(copy);
    expect(rows).not.toBe(sortByPriority(rows));
  });

  it('PRIORITY_META mapeia todos os níveis com ordem 0..3', () => {
    expect(PRIORITY_META.critical.order).toBe(0);
    expect(PRIORITY_META.high.order).toBe(1);
    expect(PRIORITY_META.medium.order).toBe(2);
    expect(PRIORITY_META.normal.order).toBe(3);
  });
});

describe('PRIORITY_RULES_TEXT (texto exibido ao supervisor)', () => {
  it('declara as quatro faixas, na ordem P1→P4', () => {
    expect(PRIORITY_RULES_TEXT).toHaveLength(4);
    expect(PRIORITY_RULES_TEXT[0]).toContain('P1');
    expect(PRIORITY_RULES_TEXT[0]).toContain('30 min');
    expect(PRIORITY_RULES_TEXT[0]).toContain('80');
    expect(PRIORITY_RULES_TEXT[1]).toContain('15 min');
    expect(PRIORITY_RULES_TEXT[2]).toContain('5 min');
    expect(PRIORITY_RULES_TEXT[3]).toContain('P4');
  });

  it('o texto que a tela mostra bate com o cálculo (mesmos limiares)', () => {
    const semAtendente = computePriority(
      input({ assigned_to: null, updated_at: minutesAgo(30) }),
      NOW
    );
    const risco = computePriority(input({ risk_score: 80 }), NOW);
    const ia = computePriority(input({ ai_priority: 'urgent' }), NOW);
    expect(semAtendente.level).toBe('critical');
    expect(risco.level).toBe('critical');
    expect(ia.level).toBe('critical');
    expect(PRIORITY_RULES_TEXT[0]).toContain('risco ≥ 80');
  });
});
