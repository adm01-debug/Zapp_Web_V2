/**
 * Persistência idempotente da chamada — etapa T11 do plano de finalização.
 *
 * Módulo **puro** (sem React, sem toast, sem logger): fala só com o banco pela
 * RPC `upsert_my_call` (Apêndice B.3, `supabase/migrations/20260926800000`).
 * Quem decide a UI do erro é o consumidor — aqui só se devolve `ok/error`.
 *
 * Regras que este arquivo trava:
 * - **um id por chamada**: as 3 gravações (tocando/atendida/fim) usam o mesmo
 *   `p_id`; o `ON CONFLICT (id) DO UPDATE` transforma retry em atualização, sem
 *   duplicar linha. Por isso o retry repete o MESMO payload;
 * - **`p_status` sempre explícito**: o INSERT do banco faz
 *   `coalesce(p_status,'ringing')`, então omitir status no fim sobrescreveria o
 *   desfecho com `ringing`;
 * - **`undefined` é omitido**: o `supabase-js` serializa o objeto em JSON e
 *   `JSON.stringify` descarta chaves `undefined` — elas ficam fora do `UPDATE`,
 *   e o `coalesce` do banco preserva o valor já gravado.
 */

import { supabase } from '@/integrations/supabase/client';

import type { CallDirection, EndReason, PersistedStatus } from './callStatus';

/** Entrada de `upsertMyCall` em nomes de domínio; o mapa `p_*` é interno. */
export interface UpsertMyCallInput {
  /** Mesmo id nas 3 gravações — é o `sessionId` da máquina de sessão. */
  id: string;
  direction: CallDirection;
  /** Sempre explícito (ver o cabeçalho). */
  status: PersistedStatus;
  channel?: 'voip' | 'whatsapp';
  peerNumber?: string | null;
  peerName?: string | null;
  contactId?: string | null;
  /** Call-ID do SIP — prova de qual sessão do provedor gerou a linha. */
  providerCallId?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  endReason?: EndReason | null;
  talkSeconds?: number | null;
}

export type UpsertMyCallResult = { ok: boolean; error?: unknown };

/** Tentativas com o mesmo `p_id` antes de devolver falha. */
const MAX_TENTATIVAS = 3;

/** Nome da RPC — o contrato é o da migration B.3, não se inventa outro. */
export const UPSERT_MY_CALL_RPC = 'upsert_my_call';

/** `null` e `undefined` significam o mesmo para a RPC (coalesce): omitir. */
function omitirNulo<T>(valor: T | null | undefined): T | undefined {
  return valor ?? undefined;
}

/**
 * UUID v4 — sempre no formato que a coluna `calls.id` (`uuid`) aceita.
 *
 * O fallback é deliberado: `p_id` é `uuid` no banco, então um id fora desse
 * formato derruba as 3 tentativas com `22P02` e **nenhuma linha nasce**
 * (Safari/iOS < 15.4 e contexto não-seguro não têm `crypto.randomUUID`).
 */
export function uuidV4(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < b.length; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Id da linha da chamada: o `sessionId` do provider (um só id por chamada) ou,
 * sem ele, um uuid local (o id vai para `audit_logs`).
 */
export function novoCallId(sessionId?: string | null): string {
  return sessionId || uuidV4();
}

/**
 * Desfecho a persistir no fim da chamada: atendida → `ended`/`completed`;
 * não atendida → `ended` (saída) ou `missed` (entrada), sempre `no_answer`.
 *
 * `persistedStatusForEndReason` (session.ts) não serve aqui: ela mapeia
 * `no_answer` → `ended`, o que é correto para a máquina de sessão — o `missed`
 * da entrada é regra de **persistência** (T11), não do estado.
 */
export function desfechoDaChamada(
  talkSeconds: number | null,
  direction: CallDirection | null,
): { status: PersistedStatus; endReason: EndReason } {
  if (talkSeconds !== null) return { status: 'ended', endReason: 'completed' };
  return {
    status: direction === 'inbound' ? 'missed' : 'ended',
    endReason: 'no_answer',
  };
}

/** Mapa 1:1 com os parâmetros `p_*` da RPC. */
function parametros(input: UpsertMyCallInput) {
  return {
    p_id: input.id,
    p_direction: input.direction,
    p_status: input.status,
    p_channel: omitirNulo(input.channel),
    p_peer_number: omitirNulo(input.peerNumber),
    p_peer_name: omitirNulo(input.peerName),
    p_contact_id: omitirNulo(input.contactId),
    p_provider_call_id: omitirNulo(input.providerCallId),
    p_answered_at: omitirNulo(input.answeredAt),
    p_ended_at: omitirNulo(input.endedAt),
    p_end_reason: omitirNulo(input.endReason),
    p_talk_seconds: omitirNulo(input.talkSeconds),
  };
}

/**
 * Grava/atualiza a chamada com retry idempotente (até 3 tentativas, sempre o
 * mesmo `p_id`). Nunca lança: devolve `{ ok: false, error }` na falha.
 */
export async function upsertMyCall(input: UpsertMyCallInput): Promise<UpsertMyCallResult> {
  const args = parametros(input);
  let erro: unknown;
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa += 1) {
    try {
      const { error } = await supabase.rpc(UPSERT_MY_CALL_RPC, args);
      if (!error) return { ok: true };
      erro = error;
    } catch (falha) {
      erro = falha;
    }
  }
  return { ok: false, error: erro };
}
