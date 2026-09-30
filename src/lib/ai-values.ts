/**
 * Contrato numérico da IA (etapa IA-023 do plano de IA).
 *
 * Regra dura: NÚMERO AUSENTE OU INVÁLIDO NÃO VIRA NÚMERO. Este módulo nunca
 * devolve valor "padrão" (50, 3, 0, 70%) quando o dado falta ou chega errado —
 * devolve `null` mais o MOTIVO (`issue`), para o chamador omitir/registrar em
 * vez de inventar. Foi assim que nasceram os defeitos máscara do bloco:
 *   - `supabase/functions/ai-conversation-analysis/index.ts:221` → ausência
 *     virava `sentimentScore: 50` (satisfação neutra inventada);
 *   - `src/components/ai/ticketClassification.ts:59` → confiança 0 virava 0,7
 *     (exibia "70%" de confiança que ninguém mediu).
 *
 * Cópia espelhada, byte a byte, em `supabase/functions/_shared/ai-values.ts` e
 * `src/lib/ai-values.ts` (mesma API, sem imports): o edge usa uma, o app usa a
 * outra, e o teste `tests/contracts/ai-values-parity.contract.test.ts` falha se
 * as duas divergirem.
 */

export type ValueIssue =
  | 'absent'
  | 'not_a_number'
  | 'out_of_range'
  | 'wrong_scale'
  | 'not_an_integer';

/** percent = inteiro 0..100 · ratio = 0..1 (confiança) · integer = faixa inteira */
export type ScoreScale = 'percent' | 'ratio' | 'integer';

export interface NormalizedNumber {
  /** `null` sempre que o dado falta ou não é confiável — nunca um default. */
  value: number | null;
  /** `null` quando o valor é utilizável; senão o motivo exato da recusa. */
  issue: ValueIssue | null;
  /** `true` quando o valor precisou de arredondamento registrado (não é invenção). */
  rounded?: boolean;
}

export interface NormalizeScoreOptions {
  min: number;
  max: number;
  scale: ScoreScale;
}

function isAbsent(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'string') return raw.trim() === '';
  return false;
}

/**
 * Valida um número vindo do modelo/banco sem inventar substituto.
 *
 * - ausente (`null`/`undefined`/`''`/espaços) → `{ value: null, issue: 'absent' }`
 * - string numérica (`'80'`) → `not_a_number` (rejeita, não converte)
 * - escala trocada (0,7 querendo dizer 70%) → `wrong_scale`
 * - fora da faixa (110, -3) → `out_of_range`
 * - fração onde só cabe inteiro (CSAT 3.5) → `not_an_integer`
 * - percent fracionário legítimo (50.4) → arredonda e marca `rounded: true`
 */
export function normalizeScore(raw: unknown, opts: NormalizeScoreOptions): NormalizedNumber {
  if (isAbsent(raw)) return { value: null, issue: 'absent' };
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return { value: null, issue: 'not_a_number' };

  const v = raw;

  if (opts.scale === 'ratio') {
    if (v > 1 && v <= 100) return { value: null, issue: 'wrong_scale' }; // veio em percentual
    if (v < 0 || v > 1) return { value: null, issue: 'out_of_range' };
    return { value: v, issue: null };
  }

  // percent / integer: fração entre 0 e 1 é escala trocada (0,7 → 70%)
  if (v > 0 && v < 1) return { value: null, issue: 'wrong_scale' };
  if (v < opts.min || v > opts.max) return { value: null, issue: 'out_of_range' };
  if (!Number.isInteger(v)) {
    if (opts.scale === 'integer') return { value: null, issue: 'not_an_integer' };
    return { value: Math.round(v), issue: null, rounded: true };
  }
  return { value: v, issue: null };
}

export interface AggregateResult {
  /** `null` quando não há nenhuma amostra válida (não é 0 nem 50). */
  average: number | null;
  /** Quantas amostras entraram na média. */
  sampleSize: number;
  /** Quantas foram descartadas por ausência/valor inválido. */
  discarded: number;
}

/**
 * Média que EXCLUI o ausente em vez de tratá-lo como 0 ou 50.
 * Corrige `src/hooks/analytics/useAIStats.ts:88` (`a.sentiment_score || 50`) e
 * `supabase/functions/send-scheduled-report/index.ts:69` (`|| 50`), onde 0 e
 * nulo somavam como 50 e o relatório mentia a média.
 */
export function aggregateScores(values: Array<number | null | undefined>): AggregateResult {
  const valid: number[] = [];
  let discarded = 0;
  for (const raw of values) {
    if (typeof raw === 'number' && Number.isFinite(raw)) valid.push(raw);
    else discarded += 1;
  }
  if (valid.length === 0) return { average: null, sampleSize: 0, discarded };
  const sum = valid.reduce((acc, n) => acc + n, 0);
  return {
    average: Math.round((sum / valid.length) * 100) / 100,
    sampleSize: valid.length,
    discarded,
  };
}
