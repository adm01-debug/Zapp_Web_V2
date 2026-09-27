import { describe, it, expect } from 'vitest';

import {
  END_REASON_LABEL,
  RESULT_LABEL,
  RESULT_TONE,
  normalizeDirection,
  normalizeStatus,
  sipCodeToEndReason,
  toResult,
  type CallResult,
  type CallStatusRow,
  type EndReason,
  type PersistedStatus,
  type SipEndReason,
} from '../callStatus';

// ─── Plano 2.7 — status persistido (com legado) ─────────────────────

describe('normalizeStatus', () => {
  const persisted: PersistedStatus[] = [
    'ringing',
    'answered',
    'ended',
    'missed',
    'busy',
    'failed',
    'cancelled',
    'declined',
  ];

  for (const status of persisted) {
    it(`mantém o status persistido "${status}"`, () => {
      expect(normalizeStatus(status)).toBe(status);
    });
  }

  it('traduz o legado completed → ended', () => {
    expect(normalizeStatus('completed')).toBe('ended');
  });

  it('traduz o legado ongoing → answered', () => {
    expect(normalizeStatus('ongoing')).toBe('answered');
  });

  it('tolera caixa alta e espaços', () => {
    expect(normalizeStatus('  ENDED ')).toBe('ended');
    expect(normalizeStatus('Ongoing')).toBe('answered');
  });

  it('devolve null para valor desconhecido', () => {
    expect(normalizeStatus('no-answer')).toBeNull();
    expect(normalizeStatus('')).toBeNull();
    expect(normalizeStatus('   ')).toBeNull();
  });

  it('devolve null para valor de tipo errado', () => {
    expect(normalizeStatus(null)).toBeNull();
    expect(normalizeStatus(undefined)).toBeNull();
    expect(normalizeStatus(42)).toBeNull();
    expect(normalizeStatus({ status: 'ended' })).toBeNull();
  });
});

describe('normalizeDirection', () => {
  it('reconhece as duas direções', () => {
    expect(normalizeDirection('inbound')).toBe('inbound');
    expect(normalizeDirection('OUTBOUND')).toBe('outbound');
  });

  it('devolve null quando não reconhece', () => {
    expect(normalizeDirection('in')).toBeNull();
    expect(normalizeDirection(null)).toBeNull();
    expect(normalizeDirection(7)).toBeNull();
  });
});

// ─── Plano 2.7 — tabela de resultado (10 linhas) ────────────────────

const ANSWERED_AT = '2026-09-26T10:00:00.000Z';
const ENDED_AT = '2026-09-26T10:04:18.000Z';

interface ResultCase {
  name: string;
  row: CallStatusRow;
  expected: CallResult;
}

const TABLE_CASES: ResultCase[] = [
  {
    name: 'ended com answered_at → completed (Concluída)',
    row: { status: 'ended', direction: 'outbound', answered_at: ANSWERED_AT, ended_at: ENDED_AT },
    expected: 'completed',
  },
  {
    name: 'ended sem answered_at (inbound) → missed (Perdida)',
    row: { status: 'ended', direction: 'inbound', answered_at: null, ended_at: ENDED_AT },
    expected: 'missed',
  },
  {
    name: 'ended sem answered_at (outbound) → no_answer (Não atendida)',
    row: { status: 'ended', direction: 'outbound', answered_at: null, ended_at: ENDED_AT },
    expected: 'no_answer',
  },
  {
    name: 'missed → missed',
    row: { status: 'missed', direction: 'inbound', answered_at: null, ended_at: ENDED_AT },
    expected: 'missed',
  },
  {
    name: 'busy → busy',
    row: { status: 'busy', direction: 'outbound', answered_at: null, ended_at: ENDED_AT },
    expected: 'busy',
  },
  {
    name: 'failed → failed',
    row: { status: 'failed', direction: 'outbound', answered_at: null, ended_at: ENDED_AT },
    expected: 'failed',
  },
  {
    name: 'cancelled → cancelled',
    row: { status: 'cancelled', direction: 'outbound', answered_at: null, ended_at: ENDED_AT },
    expected: 'cancelled',
  },
  {
    name: 'declined → declined',
    row: { status: 'declined', direction: 'inbound', answered_at: null, ended_at: ENDED_AT },
    expected: 'declined',
  },
  {
    name: 'answered sem ended_at → in_progress (Em andamento)',
    row: { status: 'answered', direction: 'outbound', answered_at: ANSWERED_AT, ended_at: null },
    expected: 'in_progress',
  },
  {
    name: 'ringing sem ended_at → ringing (Tocando)',
    row: { status: 'ringing', direction: 'inbound', answered_at: null, ended_at: null },
    expected: 'ringing',
  },
];

describe('toResult — as 10 linhas da tabela 2.7', () => {
  for (const testCase of TABLE_CASES) {
    it(testCase.name, () => {
      expect(toResult(testCase.row)).toBe(testCase.expected);
    });
  }

  it('lê o legado completed como ended (Concluída quando há answered_at)', () => {
    expect(
      toResult({
        status: 'completed',
        direction: 'outbound',
        answered_at: ANSWERED_AT,
        ended_at: ENDED_AT,
      }),
    ).toBe('completed');
  });

  it('lê o legado ongoing como answered (Em andamento sem ended_at)', () => {
    expect(
      toResult({ status: 'ongoing', direction: 'inbound', answered_at: ANSWERED_AT }),
    ).toBe('in_progress');
  });

  it('answered com ended_at é tratada como concluída (persistência atrasada)', () => {
    expect(
      toResult({
        status: 'answered',
        direction: 'outbound',
        answered_at: ANSWERED_AT,
        ended_at: ENDED_AT,
      }),
    ).toBe('completed');
  });

  it('ringing com ended_at cai na regra de desfecho', () => {
    expect(
      toResult({ status: 'ringing', direction: 'inbound', answered_at: null, ended_at: ENDED_AT }),
    ).toBe('missed');
    expect(
      toResult({
        status: 'ringing',
        direction: 'outbound',
        answered_at: ANSWERED_AT,
        ended_at: ENDED_AT,
      }),
    ).toBe('completed');
  });

  it('ended sem answered_at e sem direção cai em no_answer', () => {
    expect(toResult({ status: 'ended', ended_at: ENDED_AT })).toBe('no_answer');
  });

  it('devolve null para status desconhecido ou linha ausente', () => {
    expect(toResult({ status: 'no-answer', direction: 'inbound' })).toBeNull();
    expect(toResult(null)).toBeNull();
    expect(toResult(undefined)).toBeNull();
  });
});

describe('RESULT_LABEL / RESULT_TONE', () => {
  const labelCases: [CallResult, string][] = [
    ['completed', 'Concluída'],
    ['missed', 'Perdida'],
    ['no_answer', 'Não atendida'],
    ['busy', 'Ocupado'],
    ['failed', 'Falhou'],
    ['cancelled', 'Cancelada'],
    ['declined', 'Recusada'],
    ['in_progress', 'Em andamento'],
    ['ringing', 'Tocando'],
  ];

  for (const [result, label] of labelCases) {
    it(`rótulo pt-BR de ${result}`, () => {
      expect(RESULT_LABEL[result]).toBe(label);
    });
  }

  it('todo resultado tem tom válido entre os tokens permitidos', () => {
    const tones = ['success', 'destructive', 'warning', 'muted', 'primary'];
    for (const value of Object.values(RESULT_TONE)) {
      expect(tones).toContain(value);
    }
    expect(Object.keys(RESULT_TONE)).toEqual(Object.keys(RESULT_LABEL));
  });

  it('perda/falha é destrutiva e concluída é sucesso', () => {
    expect(RESULT_TONE.completed).toBe('success');
    expect(RESULT_TONE.missed).toBe('destructive');
    expect(RESULT_TONE.failed).toBe('destructive');
    expect(RESULT_TONE.no_answer).toBe('warning');
  });

  it('todo end_reason tem rótulo pt-BR não vazio', () => {
    for (const reason of Object.keys(END_REASON_LABEL) as EndReason[]) {
      expect(END_REASON_LABEL[reason].length).toBeGreaterThan(0);
    }
  });
});

// ─── Plano 2.7 — código SIP → motivo (8 códigos) ────────────────────

describe('sipCodeToEndReason', () => {
  const codes: { code: number; expected: SipEndReason; note: string }[] = [
    { code: 200, expected: 'completed', note: 'atendida e encerrada' },
    { code: 486, expected: 'busy', note: 'ocupado' },
    { code: 480, expected: 'no_answer', note: 'destino indisponível' },
    { code: 408, expected: 'no_answer', note: 'timeout de toque' },
    { code: 487, expected: 'cancelled', note: 'cancelada na origem' },
    { code: 603, expected: 'declined', note: 'recusada' },
    { code: 500, expected: 'failed', note: 'falha do servidor' },
    { code: 503, expected: 'failed', note: 'serviço indisponível' },
  ];

  for (const entry of codes) {
    it(`${entry.code} → ${entry.expected} (${entry.note})`, () => {
      expect(sipCodeToEndReason(entry.code)).toBe(entry.expected);
    });
  }

  it('aceita código em string', () => {
    expect(sipCodeToEndReason('486')).toBe('busy');
    expect(sipCodeToEndReason(' 200 ')).toBe('completed');
  });

  it('código desconhecido ou inválido → failed', () => {
    expect(sipCodeToEndReason(999)).toBe('failed');
    expect(sipCodeToEndReason(404)).toBe('failed');
    expect(sipCodeToEndReason(0)).toBe('failed');
    expect(sipCodeToEndReason('abc')).toBe('failed');
    expect(sipCodeToEndReason(undefined)).toBe('failed');
    expect(sipCodeToEndReason(null)).toBe('failed');
  });
});
