import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';

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
