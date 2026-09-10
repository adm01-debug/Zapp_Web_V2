import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type BlacklistReasonCode =
  | 'opt_out'
  | 'invalid_number'
  | 'manual'
  | 'lgpd'
  | 'no_commercial_permission'
  | 'bounce';

export type BlacklistEntry = {
  id: string;
  contact_id: string | null;
  phone: string | null;
  reason: string | null;
  reason_code: BlacklistReasonCode | null;
  origin: string;
  campaign_id: string | null;
  blocked_by: string | null;
  expires_at: string | null;
  source_message_id: string | null;
  created_at: string;
};

export type BlacklistInput = {
  contact_id?: string | null;
  phone?: string | null;
  reason?: string;
  reason_code?: BlacklistReasonCode;
  campaign_id?: string | null;
  expires_at?: string | null;
  source_message_id?: string | null;
};

export function useTalkXSuppression() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['talkx-suppression'] });

  const query = useQuery({
    queryKey: ['talkx-suppression'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_blacklist')
        .select('id,contact_id,phone,reason,reason_code,origin,campaign_id,blocked_by,expires_at,source_message_id,created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as BlacklistEntry[];
    },
  });

  /** Verifica se um número de telefone está na lista de supressão (incluindo expiração). */
  const isSuppressed = async (phone: string): Promise<boolean> => {
    const clean = phone.replace(/\D/g, '');
    const now = new Date().toISOString();
    const { data: byPhone } = await supabase.from('talkx_blacklist')
      .select('id').eq('phone', clean).is('removed_at', null)
      .or('expires_at.is.null,expires_at.gt.' + now).limit(1);
    if (byPhone && byPhone.length > 0) return true;
    const { data: contact } = await supabase.from('contacts').select('id').eq('phone', clean).maybeSingle();
    if (!contact) return false;
    const { data: byContact } = await supabase.from('talkx_blacklist')
      .select('id').eq('contact_id', contact.id).is('removed_at', null)
      .or('expires_at.is.null,expires_at.gt.' + now).limit(1);
    return !!(byContact && byContact.length > 0);
  };

  const addEntry = useMutation({
    mutationFn: async (input: BlacklistInput) => {
      if (!input.phone && !input.contact_id) throw new Error('phone ou contact_id obrigatório');
      if (input.phone) input = { ...input, phone: input.phone.replace(/\D/g, '') };
      if (!input.phone && !input.contact_id) throw new Error('phone invalido apos normalizacao');
      const { error } = await supabase.from('talkx_blacklist').insert({
        phone: input.phone ?? null,
        contact_id: input.contact_id ?? null,
        reason: input.reason ?? null,
        reason_code: input.reason_code ?? 'manual',
        origin: 'manual',
        campaign_id: input.campaign_id ?? null,
        expires_at: input.expires_at ?? null,
        source_message_id: input.source_message_id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Número adicionado à supressão'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('talkx_blacklist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Entrada removida'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    isSuppressed,
    addEntry,
    removeEntry,
  };
}
