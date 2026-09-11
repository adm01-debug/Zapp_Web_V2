import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';

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
  whatsapp_connection_id: string | null;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  media_url: string | null;
  media_type: string | null;
  scheduled_at: string | null;
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
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .single();

      const { data, error } = await fromTable('talkx_campaigns')
        .insert({ ...campaign, created_by: profile?.id })
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
      const rows = contactIds.map((contact_id) => ({
        campaign_id: campaignId,
        contact_id,
      }));
      const { error } = await fromTable('talkx_recipients')
        .insert(rows);
      if (error) throw error;

      await fromTable('talkx_campaigns')
        .update({ total_recipients: contactIds.length })
        .eq('id', campaignId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-recipients'] });
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Contatos adicionados!');
    },
  });

  const startCampaign = useCallback(async (campaignId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('talkx-send', {
        body: { campaignId, action: 'start' },
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha Talk X iniciada! 🚀');
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast.error(`Erro ao iniciar: ${msg}`);
    }
  }, [queryClient]);

  const pauseCampaign = useCallback(async (campaignId: string) => {
    const { error } = await supabase.functions.invoke('talkx-send', {
      body: { campaignId, action: 'pause' },
    });
    if (error) throw error; // P1: relanca para o chamador tratar
    queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
  }, [queryClient]);

  const cancelCampaign = useCallback(async (campaignId: string) => {
    const { error } = await supabase.functions.invoke('talkx-send', {
      body: { campaignId, action: 'cancel' },
    });
    if (error) throw error; // P1: relanca para o chamador tratar
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
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    refetchCampaigns: campaignsQuery.refetch,
  };
}
