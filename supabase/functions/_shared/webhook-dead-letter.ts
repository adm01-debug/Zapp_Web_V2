/**
 * Dead-letter de webhooks (E35): o que gravar quando o processamento da
 * mensagem falha, e como decidir se o provedor deve REENVIAR o evento.
 *
 * Duas responsabilidades, separadas de propósito para serem testadas sem subir
 * o handler:
 *   1) montar a linha de `webhook_failures` — snapshot TRUNCADO e sem telefone
 *      para diagnóstico, hash do snapshot e os argumentos de replay (coluna
 *      restrita ao service_role);
 *   2) classificar o erro do ingest em transitório x permanente. Transitório
 *      devolve 5xx (o provedor reenvia); permanente responde 200 — reenviar um
 *      payload inválido daria exatamente o mesmo erro.
 */
import type { EvolutionDbClient } from './evolution-types.ts';

export const WEBHOOK_DEAD_LETTER_ENDPOINT = 'evolution-webhook';

/** Teto de caracteres por campo de texto do snapshot de diagnóstico. */
const SNAPSHOT_MAX_TEXT = 120;
/** Teto do texto de erro gravado. */
const ERROR_MAX_TEXT = 1000;

export type FailureKind = 'transient' | 'permanent';

// SQLSTATE:
//   22xxx = data exception (payload inválido: tipo/limite) — permanente;
//   23xxx = violação de integridade — permanente (o mesmo payload viola de novo);
//   42xxx = objeto/coluna inexistente — defeito de código, reenviar não conserta;
//   P0xxx = exceção levantada por plpgsql — permanente pelo mesmo motivo.
// Qualquer outro (null, 08/53/57 de conexão/indisponibilidade, erro de rede)
// é TRANSITÓRIO: a próxima tentativa pode dar certo.
const PERMANENT_SQLSTATE_PREFIXES = ['22', '23', '42', 'P0'];

export function classifyIngestFailure(code: string | null | undefined): FailureKind {
  if (typeof code === 'string' && PERMANENT_SQLSTATE_PREFIXES.some((p) => code.startsWith(p))) {
    return 'permanent';
  }
  return 'transient';
}

/** Mascara runs de 8+ dígitos (telefone) em textos que vão para log ou coluna. */
export function maskPhoneLike(text: string): string {
  return text.replace(/\d{8,}/g, (run) => `${run.slice(0, 4)}***${run.slice(-2)}`);
}

function boundedText(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.length > SNAPSHOT_MAX_TEXT ? `${value.slice(0, SNAPSHOT_MAX_TEXT)}...` : value;
}

export interface DeadLetterSnapshotInput {
  event?: unknown;
  instance?: unknown;
  messageId?: unknown;
  fromMe?: unknown;
  messageType?: unknown;
  messageTimestamp?: unknown;
}

/**
 * Snapshot TRUNCADO do evento: lista FECHADA de campos, cada um com tamanho
 * limitado. Telefone/JID, nome do contato e conteúdo da mensagem NÃO têm lugar
 * aqui — o payload bruto nunca é copiado para a dead-letter de diagnóstico.
 */
export function buildDeadLetterSnapshot(input: DeadLetterSnapshotInput): Record<string, unknown> {
  return {
    event: boundedText(input.event),
    instance: boundedText(input.instance),
    messageId: boundedText(input.messageId),
    fromMe: typeof input.fromMe === 'boolean' ? input.fromMe : null,
    messageType: boundedText(input.messageType),
    messageTimestamp:
      typeof input.messageTimestamp === 'number' || typeof input.messageTimestamp === 'string'
        ? input.messageTimestamp
        : null,
  };
}

/** JSON canônico (chaves ordenadas) — o hash não pode depender da ordem. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

/** SHA-256 do snapshot persistido (o payload bruto não é guardado). */
export async function payloadSha256(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Argumentos do ingest_inbound_message, prontos para o replay. */
export interface ReplayArgs extends Record<string, unknown> {
  p_connection_id: string;
  p_phone: string;
  p_push_name: string | null;
  p_content: string | null;
  p_message_type: string;
  p_media_url: string | null;
  p_external_id: string;
  p_created_at: string;
}

export interface DeadLetterInput {
  externalId: string | null;
  eventType: string | null;
  instance: string | null;
  errorCode?: string | null;
  errorMessage: string;
  snapshot: Record<string, unknown>;
  /** null = evento não reprocessável (sem argumentos validados). */
  replayArgs: ReplayArgs | null;
}

/** Monta a linha de `webhook_failures` (puro, para teste sem banco). */
export function buildDeadLetterRow(input: DeadLetterInput, sha256: string): Record<string, unknown> {
  const codigo = input.errorCode ? ` (code ${input.errorCode})` : '';
  return {
    endpoint: WEBHOOK_DEAD_LETTER_ENDPOINT,
    event_type: boundedText(input.eventType),
    instance: boundedText(input.instance),
    payload_truncated: input.snapshot,
    payload_sha256: sha256,
    error_message: `${maskPhoneLike(input.errorMessage)}${codigo}`.slice(0, ERROR_MAX_TEXT),
    external_id: input.externalId,
    replay_payload: input.replayArgs,
  };
}

/**
 * Grava o evento na dead-letter. NUNCA lança: uma falha ao registrar não pode
 * substituir nem esconder o erro original que trouxe o fluxo até aqui (o
 * chamador decide o status pela classificação, não pelo retorno).
 * Devolve true se a linha foi gravada.
 */
export async function recordWebhookFailure(
  supabase: EvolutionDbClient,
  input: DeadLetterInput,
): Promise<boolean> {
  try {
    const row = buildDeadLetterRow(input, await payloadSha256(input.snapshot));
    const { error } = await supabase.from('webhook_failures').insert(row);
    if (error) {
      console.error(
        '[DEAD-LETTER] falha ao gravar webhook_failures:',
        error.code ?? 'sem-code',
        maskPhoneLike(error.message),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      '[DEAD-LETTER] erro inesperado ao gravar webhook_failures:',
      maskPhoneLike(err instanceof Error ? err.message : String(err)),
    );
    return false;
  }
}
