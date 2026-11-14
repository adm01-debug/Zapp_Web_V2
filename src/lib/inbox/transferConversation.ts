/**
 * Chamada ÚNICA da RPC `transfer_conversation` (chat, lista, lote e handoff).
 *
 * Compare-and-set do dono que a tela mostrou:
 *   - `expectedAgentId` string  → `p_expected_agent_id` (40001 se mudou de mão);
 *   - `expectedAgentId` null    → a tela viu a conversa SEM dono: `p_expect_unassigned`
 *     (migration 20261113130500; 40001 se alguém assumiu no meio-tempo);
 *   - `expectedAgentId` undefined → a tela não sabe o dono: sem compare-and-set.
 * Enquanto a 20261113130500 não estiver aplicada, a RPC não conhece
 * `p_expect_unassigned` (PostgREST PGRST202): repete UMA vez sem ele, para a
 * transferência nunca quebrar por ordem de deploy.
 */
import { supabase } from '@/integrations/supabase/client';

export interface TransferConversationInput {
  contactId: string;
  toAgentId?: string;
  toQueueId?: string;
  note?: string;
  expectedAgentId?: string | null;
}

interface RpcError { code?: string; message?: string }
interface RpcResult { data: string | null; error: RpcError | null }
type TransferRpc = {
  rpc: (fn: 'transfer_conversation', args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export const TRANSFER_CONFLICT_MESSAGE =
  'Esta conversa já foi transferida ou assumida por outro atendente. Atualize a lista e tente de novo.';

export async function transferConversation(input: TransferConversationInput): Promise<RpcResult> {
  const client = supabase as unknown as TransferRpc;
  const base: Record<string, unknown> = {
    p_contact_id: input.contactId,
    p_to_agent_id: input.toAgentId,
    p_to_queue_id: input.toQueueId,
    p_note: input.note,
  };
  if (typeof input.expectedAgentId === 'string') {
    return client.rpc('transfer_conversation', { ...base, p_expected_agent_id: input.expectedAgentId });
  }
  if (input.expectedAgentId === null) {
    const result = await client.rpc('transfer_conversation', { ...base, p_expect_unassigned: true });
    if (result.error?.code !== 'PGRST202') return result;
    // Banco ainda sem o parâmetro novo: transfere sem o compare-and-set de "sem dono".
  }
  return client.rpc('transfer_conversation', base);
}

/** Texto do erro de transferência: 40001 (compare-and-set) vira o aviso de conflito. */
export function transferErrorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: unknown } | null)?.code;
  return code === '40001' ? TRANSFER_CONFLICT_MESSAGE : fallback;
}
