import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';

export interface MultiplixDispatch {
  id: string;
  name: string;
  message_template: string;
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed' | 'cancelled';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  delivered_count: number;
  outcome_unknown_count: number;
  started_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MultiplixRecipientRow {
  id: string;
  company_name_snapshot: string | null;
  destino_e164: string | null;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  personalized_message: string | null;
}

export function useMultiplixDispatchesList() {
  return useQuery({
    queryKey: ['multiplix-dispatches-list'],
    queryFn: async () => {
      const { data, error } = await fromTable('multiplix_dispatches')
        .select('id, name, message_template, status, total_recipients, sent_count, failed_count, delivered_count, outcome_unknown_count, started_at, paused_at, pause_reason, completed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as MultiplixDispatch[];
    },
    refetchInterval: 10_000,
  });
}

export function useMultiplixDispatch(dispatchId: string | null) {
  return useQuery({
    queryKey: ['multiplix-dispatch', dispatchId],
    queryFn: async () => {
      const { data, error } = await fromTable('multiplix_dispatches')
        .select('id, name, message_template, status, total_recipients, sent_count, failed_count, delivered_count, outcome_unknown_count, started_at, paused_at, pause_reason, completed_at, created_at')
        .eq('id', dispatchId!)
        .single();
      if (error) throw new Error(error.message);
      return data as MultiplixDispatch;
    },
    enabled: !!dispatchId,
    refetchInterval: 5_000,
  });
}

export function useMultiplixRecipients(dispatchId: string | null, statusFilter = 'all') {
  return useQuery({
    queryKey: ['multiplix-recipients', dispatchId, statusFilter],
    queryFn: async () => {
      let q = fromTable('multiplix_recipients')
        .select('id, company_name_snapshot, destino_e164, status, sent_at, error_message, personalized_message')
        .eq('dispatch_id', dispatchId!)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as MultiplixRecipientRow[];
    },
    enabled: !!dispatchId,
    refetchInterval: 5_000,
  });
}

export interface MultiplixDispatchRecipientInput {
  company_id: string;
  company_name: string | null;
  destino_e164: string | null;
  destino_origem: string | null;
}

export interface CreateMultiplixDispatchInput {
  name: string;
  messageTemplate: string;
  recipients: MultiplixDispatchRecipientInput[];
  startNow: boolean;
}

async function invokeMultiplixSend(dispatchId: string, action: 'start' | 'pause' | 'cancel') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await supabase.functions.invoke('multiplix-send', {
    body: { dispatchId, action },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.error) throw new Error(response.error.message);
  // 'start' fora da janela de envio responde 200 com {ok:false, reason,
  // next_window} em vez de status de erro (nao ha transicao pra reverter),
  // entao invoke() nao rejeita sozinho -- sem isso, "Retomar" fecha o dialog
  // como sucesso mas o disparo continua pausado.
  const body = response.data as { ok?: boolean; reason?: string } | null;
  if (body?.ok === false) {
    throw new Error(body.reason ? `Fora da janela de envio: ${body.reason}` : 'Disparo recusado pelo motor de envio');
  }
  return response.data;
}

export function useCreateMultiplixDispatch() {
  return useMutation({
    mutationFn: async (input: CreateMultiplixDispatchInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: profile, error: profileError } = await supabase
        .from('profiles').select('id').eq('user_id', user.id).single();
      if (profileError || !profile) throw new Error('Perfil não encontrado');

      const { data: dispatch, error: dispatchError } = await fromTable('multiplix_dispatches')
        .insert({
          name: input.name,
          message_template: input.messageTemplate,
          total_recipients: input.recipients.length,
          created_by: profile.id,
        })
        .select('id')
        .single();
      if (dispatchError) throw new Error(dispatchError.message);

      const recipientRows = input.recipients.map((r) => ({
        dispatch_id: dispatch.id,
        company_id: r.company_id,
        company_name_snapshot: r.company_name,
        destino_e164: r.destino_e164,
        destino_origem: r.destino_origem,
      }));
      const { error: recipientsError } = await fromTable('multiplix_recipients').insert(recipientRows);
      if (recipientsError) throw new Error(recipientsError.message);

      if (input.startNow) {
        await invokeMultiplixSend(dispatch.id, 'start');
      }

      return dispatch.id as string;
    },
  });
}

export function useMultiplixDispatchAction() {
  return useMutation({
    mutationFn: ({ dispatchId, action }: { dispatchId: string; action: 'start' | 'pause' | 'cancel' }) =>
      invokeMultiplixSend(dispatchId, action),
  });
}
