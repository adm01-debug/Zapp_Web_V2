import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
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

export interface StartCallParams {
  contactId?: string;
  contactPhone: string;
  contactName: string;
  direction: 'inbound' | 'outbound';
  whatsappConnectionId?: string;
}

export const useCalls = () => {
  const { user } = useAuth();
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get current user's profile id
  const getProfileId = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    return data?.id || null;
  }, [user]);

  /**
   * Cria a linha da chamada (`calls`) e o estado local da sessão.
   *
   * @deprecated T13 — escrita direta na tabela `calls`. O caminho vigente é a
   * RPC `upsert_my_call` (idempotente, um id por chamada) via
   * `src/lib/calls/persistence.ts` (T11). Este método continua aqui só até o
   * T21, porque o `CallDialog` ainda o consome.
   */
  const startCall = useCallback(async (params: StartCallParams): Promise<string | null> => {
    setIsLoading(true);
    try {
      const profileId = await getProfileId();
      
      const { data, error } = await supabase
        .from('calls')
        .insert({
          contact_id: params.contactId || null,
          agent_id: profileId,
          direction: params.direction,
          status: 'ringing',
          whatsapp_connection_id: params.whatsappConnectionId || null,
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentCallId(data.id);
      return data.id;
    } catch (error) {
      log.error('Error starting call:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a chamada',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getProfileId]);

  /**
   * Marca a chamada como atendida por escrita direta na tabela `calls`.
   *
   * @deprecated T13 — o caminho vigente é a RPC `upsert_my_call` (T11). Sai no
   * T21: o `CallDialog` **e** o `IncomingCallAlert` ainda o consomem — o plano
   * diz que o consumidor é só o `CallDialog`, mas a realidade medida no código
   * são os dois (o alerta usa `answerCall`).
   */
  const answerCall = useCallback(async (callId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'answered',
          answered_at: new Date().toISOString(),
        })
        .eq('id', callId);

      if (error) throw error;
      return true;
    } catch (error) {
      log.error('Error answering call:', error);
      return false;
    }
  }, []);

  /**
   * Finaliza a chamada por escrita direta na tabela `calls`.
   *
   * @deprecated T13 — o caminho vigente é a RPC `upsert_my_call` (T11). Sai no
   * T21, porque o `CallDialog` ainda o consome.
   */
  const endCall = useCallback(async (callId: string, durationSeconds: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', callId);

      if (error) throw error;
      
      setCurrentCallId(null);
      return true;
    } catch (error) {
      log.error('Error ending call:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível finalizar a chamada',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  /**
   * Marca a chamada como não atendida por escrita direta na tabela `calls`.
   *
   * @deprecated T13 — o caminho vigente é a RPC `upsert_my_call` (T11). Sai no
   * T21: o `CallDialog` **e** o `IncomingCallAlert` ainda o consomem.
   */
  const missCall = useCallback(async (callId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'missed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', callId);

      if (error) throw error;
      
      setCurrentCallId(null);
      return true;
    } catch (error) {
      log.error('Error marking call as missed:', error);
      return false;
    }
  }, []);

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
  const getContactCalls = useCallback(async (contactId: string): Promise<Call[]> => {
    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('contact_id', contactId)
        .order('started_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Call[];
    } catch (error) {
      log.error('Error fetching contact calls:', error);
      return [];
    }
  }, []);

  return {
    currentCallId,
    isLoading,
    startCall,
    answerCall,
    endCall,
    missCall,
    addCallNotes,
    getContactCalls,
  };
};
