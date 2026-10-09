/**
 * Comportamento do vocabulário de estados de job de IA (`src/lib/aiJobs/status.ts`):
 * terminal, transições permitidas e rótulos. A paridade literal entre app/worker/migration
 * é assunto de `tests/contracts/ai-vocabulary*.contract.test.ts` e não é repetida aqui.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_JOB_STATUSES,
  AI_JOB_STATUS_LABELS,
  AI_JOB_TERMINAL_STATUSES,
  AI_JOB_TRANSITIONS,
  canTransitionAiJob,
  isTerminalAiJobStatus,
  type AiJobStatus,
} from '../status';

const STATUS_ESPERADOS: AiJobStatus[] = [
  'queued',
  'running',
  'partial',
  'succeeded',
  'failed',
  'cancelled',
  'outcome_unknown',
];

describe('vocabulário', () => {
  it('tem exatamente os sete estados, na ordem canônica', () => {
    expect([...AI_JOB_STATUSES]).toEqual(STATUS_ESPERADOS);
  });

  it('os quatro terminais são um subconjunto próprio do vocabulário', () => {
    expect([...AI_JOB_TERMINAL_STATUSES]).toEqual([
      'succeeded',
      'failed',
      'cancelled',
      'outcome_unknown',
    ]);
    expect(AI_JOB_TERMINAL_STATUSES.length).toBeLessThan(AI_JOB_STATUSES.length);
  });
});

describe('isTerminalAiJobStatus', () => {
  it('marca só os terminais', () => {
    expect(AI_JOB_TERMINAL_STATUSES.map(isTerminalAiJobStatus)).toEqual([true, true, true, true]);
    expect((['queued', 'running', 'partial'] as AiJobStatus[]).map(isTerminalAiJobStatus)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('coincide com "não tem transição de saída" — as duas listas não podem divergir', () => {
    for (const status of AI_JOB_STATUSES) {
      expect(isTerminalAiJobStatus(status), `divergência em ${status}`).toBe(
        AI_JOB_TRANSITIONS[status].length === 0,
      );
    }
  });
});

describe('AI_JOB_TRANSITIONS', () => {
  it('cobre todos os estados, e só aponta para estados do vocabulário', () => {
    expect(Object.keys(AI_JOB_TRANSITIONS).sort()).toEqual([...AI_JOB_STATUSES].sort());
    for (const [de, destinos] of Object.entries(AI_JOB_TRANSITIONS)) {
      for (const para of destinos) expect(AI_JOB_STATUSES, `${de} → ${para}`).toContain(para);
    }
  });

  it('nenhum estado transiciona para si mesmo e nenhum terminal tem saída', () => {
    for (const de of AI_JOB_STATUSES) {
      expect(canTransitionAiJob(de, de), `${de} → ${de}`).toBe(false);
      for (const para of AI_JOB_STATUSES) {
        if (isTerminalAiJobStatus(de)) {
          expect(canTransitionAiJob(de, para), `${de} → ${para}`).toBe(false);
        }
      }
    }
  });
});

describe('canTransitionAiJob', () => {
  it.each<[AiJobStatus, AiJobStatus, boolean]>([
    ['queued', 'running', true],
    ['queued', 'cancelled', true],
    ['queued', 'succeeded', false],
    ['queued', 'failed', false],
    ['queued', 'partial', false],
    ['running', 'partial', true],
    ['running', 'succeeded', true],
    ['running', 'failed', true],
    ['running', 'cancelled', true],
    ['running', 'outcome_unknown', true],
    ['running', 'queued', false],
    ['partial', 'running', true],
    ['partial', 'succeeded', true],
    ['partial', 'outcome_unknown', true],
    ['partial', 'queued', false],
    ['succeeded', 'running', false],
    ['failed', 'running', false],
    ['cancelled', 'queued', false],
    ['outcome_unknown', 'running', false],
  ])('%s → %s = %s', (de, para, esperado) => {
    expect(canTransitionAiJob(de, para)).toBe(esperado);
  });

  it('devolve false (não lança) para estado fora do vocabulário em runtime', () => {
    expect(canTransitionAiJob('finished' as AiJobStatus, 'running')).toBe(false);
    expect(canTransitionAiJob(undefined as unknown as AiJobStatus, 'running')).toBe(false);
  });
});

describe('AI_JOB_STATUS_LABELS', () => {
  it('rotula todos os estados com texto não vazio e distinto', () => {
    expect(Object.keys(AI_JOB_STATUS_LABELS).sort()).toEqual([...AI_JOB_STATUSES].sort());
    const rotulos = AI_JOB_STATUSES.map((s) => AI_JOB_STATUS_LABELS[s]);
    for (const rotulo of rotulos) expect(rotulo.trim()).not.toBe('');
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it('não deixa "parcial" nem "resultado incerto" serem lidos como concluído', () => {
    // Aceite da IA-046: parcial NÃO é concluído e outcome_unknown não é sucesso
    // nem falha — o rótulo é a única coisa que o operador lê.
    const sucesso = /\b(conclu|sucesso|pronto|ok)\b/i;
    expect(AI_JOB_STATUS_LABELS.partial).not.toMatch(sucesso);
    expect(AI_JOB_STATUS_LABELS.outcome_unknown).not.toMatch(sucesso);
    expect(AI_JOB_STATUS_LABELS.partial).toMatch(/ainda em andamento/i);
    expect(AI_JOB_STATUS_LABELS.outcome_unknown).toMatch(/verificar/i);
  });
});
