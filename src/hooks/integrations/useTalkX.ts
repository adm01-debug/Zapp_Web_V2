import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';

// A função é introduzida pela migration desta mesma mudança. O types-sync gera
// a assinatura canônica somente depois que o banco canônico receber a migration.
// Não editar o arquivo gerado `types.ts` antecipadamente, pois isso mascararia
// drift entre código e banco.
type PendingDatabaseRpc = (name: string, args: Record<string, unknown>) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

export interface TalkXCampaign {
  id: string;
  name: string;
  message_template: string;
  variables_config: string[];
  typing_delay_min: number;
  typing_delay_max: number;
  send_interval_min: number;
  send_interval_max: number;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  delivered_count: number;
  outcome_unknown_count?: number;
  whatsapp_connection_id: string | null;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  media_url: string | null;
  media_type: string | null;
  scheduled_at: string | null;
  // Introduzido por 20260911200000. Mantido opcional até o types-sync ser
  // gerado a partir do banco canônico após a migration ser aplicada.
  schedule_timezone?: string | null;
  // migration 20260908120000 — wizard / agendamento / supressao
  description?: string | null;
  objective?: string;
  audience_source?: 'contacts' | 'segment' | 'crm360';
  audience_filters?: Record<string, unknown>;
  segment_id?: string | null;
  template_id?: string | null;
  send_window_start?: string | null;
  send_window_end?: string | null;
  business_hours_only?: boolean;
  speed_profile?: 'slow' | 'moderate' | 'fast';
  paused_at?: string | null;
}

export interface TalkXRecipient {
  id: string;
  campaign_id: string;
  contact_id: string;
  personalized_message: string | null;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  created_at: string;
  contacts?: {
    name: string;
    nickname: string | null;
    phone: string;
    company: string | null;
    avatar_url: string | null;
  };
}

type TalkXActionResponse = {
  success?: unknown;
  reason?: unknown;
  error?: unknown;
};

/**
 * Edge Functions can deliberately return HTTP 200 for an operational refusal
 * (for example, a campaign outside its send window). Supabase exposes that as
 * `error: null`, so every lifecycle action must validate the body as well.
 */
function assertTalkXActionAccepted(data: unknown): asserts data is TalkXActionResponse & { success: true } {
  if (data && typeof data === 'object' && (data as TalkXActionResponse).success === true) return;

  const response = data && typeof data === 'object' ? data as TalkXActionResponse : null;
  const reason = typeof response?.reason === 'string'
    ? response.reason
    : typeof response?.error === 'string'
      ? response.error
      : 'Solicitação de campanha não foi aceita';
  throw new Error(reason);
}

type CampaignPayload = Omit<Partial<TalkXCampaign>, 'id' | 'created_at' | 'updated_at'>;

export function useTalkX() {
  const queryClient = useQueryClient();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ['talkx-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TalkXCampaign[];
    },
    // Fallback polling quando o canal realtime nao esta conectado
    refetchInterval: isLive ? false : 15_000,
  });

  // E27 — Canal realtime talkx:campaigns (UPDATE pontual + INSERT invalida)
  useEffect(() => {
    const channel = supabase
      .channel('talkx:campaigns')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'talkx_campaigns' },
        (payload) => {
          // Debounce 500ms para rajadas durante envio ativo
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            const updated = payload.new as TalkXCampaign;
            queryClient.setQueryData<TalkXCampaign[]>(['talkx-campaigns'], (old) => {
              if (!old) return old;
              return old.map((c) => c.id === updated.id ? { ...c, ...updated } : c);
            });
          }, 500);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'talkx_campaigns' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const recipientsQuery = useQuery({
    queryKey: ['talkx-recipients', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const { data, error } = await supabase
        .from('talkx_recipients')
        .select('*, contacts:contact_id(name, nickname, phone, company, avatar_url)')
        .eq('campaign_id', selectedCampaignId)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as TalkXRecipient[];
    },
    enabled: !!selectedCampaignId,
  });

  const createCampaign = useMutation({
    mutationFn: async (campaign: CampaignPayload) => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .single();
      if (profileError) throw profileError;
      if (!profile?.id) throw new Error('Perfil ativo não encontrado para criar a campanha.');

      const { data, error } = await fromTable('talkx_campaigns')
        .insert({ ...campaign, created_by: profile.id })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TalkXCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha Talk X criada!');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const updateCampaign = useMutation({
    mutationFn: async ({ id, ...updates }: CampaignPayload & { id: string }) => {
      const { data, error } = await fromTable('talkx_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TalkXCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('talkx_campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha excluída');
    },
  });

  const addRecipients = useMutation({
    mutationFn: async ({
      campaignId,
      contactIds,
    }: {
      campaignId: string;
      contactIds: string[];
    }) => {
      // Compatibilidade do hook antigo: destinatários agora só podem ser
      // gravados pelo snapshot transacional. Insert direto violaria o trigger
      // de integridade e permitiria contador/audiência divergentes.
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { error } = await rpc('replace_talkx_draft_recipients', {
        p_campaign_id: campaignId,
        p_contact_ids: contactIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-recipients'] });
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Audiência atualizada!');
    },
  });

  /**
   * Substitui o snapshot de destinatários de um rascunho em uma única transação
   * no banco. A RPC rejeita campanhas que já começaram a ser enviadas.
   */
  const replaceDraftRecipients = useMutation({
    mutationFn: async ({
      campaignId,
      contactIds,
    }: {
      campaignId: string;
      contactIds: string[];
    }) => {
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('replace_talkx_draft_recipients', {
        p_campaign_id: campaignId,
        p_contact_ids: contactIds,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-recipients'] });
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
    },
  });

  const startCampaign = useCallback(async (campaignId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('talkx-send', {
        body: { campaignId, action: 'start' },
      });
      if (error) throw error;
      assertTalkXActionAccepted(data);
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Processamento da campanha confirmado.');
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast.error(`Erro ao iniciar: ${msg}`);
      return false;
    }
  }, [queryClient]);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    const { data, error } = await supabase.functions.invoke('talkx-send', {
      body: { campaignId, action: 'pause' },
    });
    if (error) throw error;
    assertTalkXActionAccepted(data);
    queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
  }, [queryClient]);

  const cancelCampaign = useCallback(async (campaignId: string) => {
    const { data, error } = await supabase.functions.invoke('talkx-send', {
      body: { campaignId, action: 'cancel' },
    });
    if (error) throw error;
    assertTalkXActionAccepted(data);
    queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
  }, [queryClient]);

  return {
    campaigns: campaignsQuery.data || [],
    isLoading: campaignsQuery.isLoading,
    isLive,
    recipients: recipientsQuery.data || [],
    recipientsLoading: recipientsQuery.isLoading,
    selectedCampaignId,
    setSelectedCampaignId,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    addRecipients,
    replaceDraftRecipients,
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    refetchCampaigns: campaignsQuery.refetch,
  };
}
