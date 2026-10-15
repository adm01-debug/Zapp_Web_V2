import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';

/**
 * Nome da RPC de anotação humana da chamada — o contrato é o da migration
 * `20260927100000_fix_set_call_agent_notes_null_owner.sql`
 * (`set_call_agent_notes(p_call_id uuid, p_notes text) returns void`); não se
 * inventa outro nome aqui. Mesmo padrão de `UPSERT_MY_CALL_RPC` em
 * `src/lib/calls/persistence.ts`.
 */
const SET_CALL_AGENT_NOTES_RPC = 'set_call_agent_notes' as const;

/** `calls.contact_id` é uuid. Mesmo padrão de `ehUuid` em `useWhisperCount`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Um id que não é uuid (ex.: link direto com JID vindo do roteador) faria o
 * PostgREST responder 400 e a tela ficaria sem histórico. A guarda corta a
 * consulta antes de sair do navegador.
 */
export function isValidUUID(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

export interface Call {
  id: string;
  contact_id: string | null;
  agent_id: string | null;
  whatsapp_connection_id: string | null;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'answered' | 'ended' | 'missed';
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Só o que a tela consome de fato (T91): a **anotação** da chamada pela RPC
 * `set_call_agent_notes` (T13) e o histórico da chamada por contato.
 *
 * Os quatro métodos legados de escrita direta na tabela `calls`
 * (`startCall`/`answerCall`/`endCall`/`missCall`) saíram aqui: desde o T21 o
 * `CallDialog` não fala mais com eles (usa a máquina de sessão do
 * `CallSessionProvider`) e o `IncomingCallAlert` também não — a auditoria não
 * achou nenhum outro consumidor fora de teste. O caminho vigente de escrita é a
 * RPC `upsert_my_call` (`src/lib/calls/persistence.ts`, T11). O estado de sessão
 * (`currentCallId`/`isLoading`) saiu junto: só os legados o escreviam.
 */
export const useCalls = () => {
  /**
   * Grava a **anotação humana** da chamada pela RPC `set_call_agent_notes`
   * (`p_call_id`, `p_notes`) — T13.
   *
   * O motivo de ser RPC e não escrita de coluna: a anotação do agente mora em
   * `agent_notes`, e a coluna do provedor é metadado somente-leitura (T66). A
   * RPC roda `security definer`, confere o dono da chamada e recusa quem não é
   * o agente — coisa que uma escrita de coluna sujeita a RLS "resolvia" em
   * silêncio, sem afetar linha nenhuma e sem erro.
   */
  const addCallNotes = useCallback(async (callId: string, notes: string): Promise<boolean> => {
    try {
      const { error } = await supabase.rpc(SET_CALL_AGENT_NOTES_RPC, {
        p_call_id: callId,
        p_notes: notes,
      });

      if (error) throw error;
      return true;
    } catch (error) {
      log.error('Error adding call notes:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a anotação da chamada',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  // Get call history for a contact
  const getContactCalls = useCallback(async (contactId: string, signal?: AbortSignal): Promise<Call[]> => {
    // Id que não é uuid nem sai do navegador: o PostgREST devolveria 400.
    if (!isValidUUID(contactId)) return [];
    if (signal?.aborted) return [];

    try {
      const query = supabase
        .from('calls')
        .select('*')
        .eq('contact_id', contactId)
        .order('started_at', { ascending: false });

      // Quando a consulta mora numa query do React Query, o `signal` vem do
      // `queryFn`: ao trocar de contato (ou desmontar) o React Query aborta a
      // busca antiga e a resposta atrasada não sobrescreve a nova.
      const { data, error } = signal ? await query.abortSignal(signal) : await query;

      if (signal?.aborted) return [];
      if (error) throw error;
      return (data || []) as Call[];
    } catch (error) {
      if (signal?.aborted) return [];
      log.error('Error fetching contact calls:', error);
      return [];
    }
  }, []);

  return {
    addCallNotes,
    getContactCalls,
  };
};
