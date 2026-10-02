/**
 * Espelho de VOCABULÁRIO e TRANSIÇÕES de estado de job de IA — frente do app (IA-046).
 *
 * Este arquivo é a CÓPIA DECLARADA e PINADA do vocabulário de estados que a
 * interface, o banco e o worker precisam apresentar de forma idêntica. O front
 * NÃO importa de `supabase/functions/_shared/ai-jobs.ts` de propósito: são
 * runtimes diferentes (o bundle do app não empacota o código Deno), então o
 * vocabulário é repetido aqui — é o padrão de vocabulário pinado já usado no
 * projeto, e a cópia vive sob contrato de teste para não divergir.
 *
 * O MESMO vocabulário congelado habita três lugares:
 *   1. a interface .......................... este arquivo (`src/lib/aiJobs/status.ts`);
 *   2. o worker (Deno) ...................... `supabase/functions/_shared/ai-jobs.ts`;
 *   3. o banco (migration) .................. o enum/check de `ai_jobs.status`.
 *
 * Contrato de teste: `tests/contracts/ai-jobs.contract.test.ts` compara este
 * arquivo com o do worker e com a migration e falha se os três divergirem. É
 * exatamente isso que o aceite da IA-046 exige — interface, banco e worker com o
 * MESMO estado, sem confundir parcial com concluído.
 *
 * QUALQUER alteração neste vocabulário precisa ser feita nos TRÊS lugares de uma
 * vez. Não existe oitavo valor: o vocabulário congelado tem exatamente SETE
 * estados — queued, running, partial, succeeded, failed, cancelled e
 * outcome_unknown — e nenhum a mais.
 */

/** Os sete estados possíveis de um job de IA, na ordem canônica do contrato. */
export const AI_JOB_STATUSES = [
  'queued',
  'running',
  'partial',
  'succeeded',
  'failed',
  'cancelled',
  'outcome_unknown',
] as const;

/** Um estado de job de IA — união derivada do vocabulário congelado. */
export type AiJobStatus = (typeof AI_JOB_STATUSES)[number];

/**
 * Estados terminais: a partir deles não há transição. `outcome_unknown` é
 * terminal porque o efeito externo já pode ter acontecido e o sistema não pode
 * decidir sozinho reenviar — a resolução é humana, não uma transição automática.
 */
export const AI_JOB_TERMINAL_STATUSES = [
  'succeeded',
  'failed',
  'cancelled',
  'outcome_unknown',
] as const;

/**
 * `true` quando o estado é terminal (não admite mais transições).
 *
 * O cast para `readonly string[]` alarga a tupla literal (cujo `.includes` só
 * aceitaria o próprio conjunto estreito) para que a consulta aceite a união
 * completa de estados — mesmo comportamento do worker em `_shared/ai-jobs.ts`.
 */
export function isTerminalAiJobStatus(s: AiJobStatus): boolean {
  return (AI_JOB_TERMINAL_STATUSES as readonly string[]).includes(s);
}

/**
 * Grafo de transições permitidas. Espelha o que o worker e o banco aceitam.
 *   queued  → running, cancelled
 *   running → partial, succeeded, failed, cancelled, outcome_unknown
 *   partial → running, succeeded, failed, cancelled, outcome_unknown
 *   terminais (succeeded/failed/cancelled/outcome_unknown) → []
 *
 * `partial` NÃO é terminal: um job parcial pode voltar a `running` (retomada) ou
 * avançar para `succeeded` — nunca é tratado como concluído.
 */
export const AI_JOB_TRANSITIONS: Record<AiJobStatus, readonly AiJobStatus[]> = {
  queued: ['running', 'cancelled'],
  running: ['partial', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'],
  partial: ['running', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'],
  succeeded: [],
  failed: [],
  cancelled: [],
  outcome_unknown: [],
};

/**
 * `true` se `from → to` é uma transição permitida pelo contrato.
 *
 * É consulta, não mutação: uma entrada inválida em runtime devolve `false` em
 * vez de lançar — mesmo comportamento do worker em `_shared/ai-jobs.ts`. A lista
 * de um estado terminal é vazia, então nenhuma saída de terminal passa.
 */
export function canTransitionAiJob(from: AiJobStatus, to: AiJobStatus): boolean {
  const allowed = AI_JOB_TRANSITIONS[from];
  if (!Array.isArray(allowed)) return false;
  return (allowed as readonly AiJobStatus[]).includes(to);
}

/**
 * Rótulos de exibição em pt-BR.
 *
 * Uma mensagem de sucesso é exatamente o que NÃO pode ser dito sobre `partial`
 * nem sobre `outcome_unknown`. Estes rótulos são a razão de o aceite da IA-046
 * falar em "não confundir parcial com concluído":
 *   - `partial` parece pronto pela contagem, mas ainda está em andamento — o
 *     rótulo diz "Parcial — ainda em andamento" para não ser lido como concluído;
 *   - `outcome_unknown` esconde um efeito externo incerto — o rótulo diz
 *     "Resultado incerto — verificar" para não ser lido como sucesso nem falha.
 */
export const AI_JOB_STATUS_LABELS: Record<AiJobStatus, string> = {
  queued: 'Na fila',
  running: 'Em andamento',
  partial: 'Parcial — ainda em andamento',
  succeeded: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado',
  outcome_unknown: 'Resultado incerto — verificar',
};
