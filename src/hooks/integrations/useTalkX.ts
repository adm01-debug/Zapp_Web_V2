import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import type { SupabaseClient as SupabaseJsClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import { TALKX_OVERVIEW_STATS_KEY } from './useTalkXOverviewStats';

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
  read_count?: number;
  replied_count?: number;
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
  segment_ids?: string[] | null;
  template_id?: string | null;
  // V26 — versão do template (talkx_template_versions.id) que originou a
  // mensagem. Opcional até o types-sync canônico após a migration da coluna.
  template_version_id?: string | null;
  send_window_start?: string | null;
  send_window_end?: string | null;
  business_hours_only?: boolean;
  speed_profile?: 'slow' | 'moderate' | 'fast';
  paused_at?: string | null;
  respect_suppression?: boolean;
  confirm_consent?: boolean;
  // V23 — passo do wizard persistido no rascunho (migration via hermes-db-migrar --nova).
  draft_step?: number | null;
  // V25 — responsável da campanha (profiles.id). Opcional até o types-sync
  // canônico após a migration que adiciona a coluna `owner`.
  owner?: string | null;
  launched_by?: string | null;
  launched_at?: string | null;
  // Introduzido por 20260912130000. Opcional até o types-sync canônico após
  // aplicar a migration; o editor usa 1 como revisão de linhas legadas.
  revision?: number;
  // N-102: dias da semana permitidos para envio (0=dom, 6=sáb; nulo=todos).
  send_weekdays?: number[] | null;
  // N-102: respeitar a janela "não perturbe" (dnd_hours) do setting.
  respect_dnd?: boolean | null;
  // V27 — A/B testing: habilita teste de variante, métrica de sucesso,
  // amostra mínima e registro do vencedor (colunas adicionadas pela
  // migration 20261010_talkx_campaigns_ab_testing).
  ab_enabled?: boolean;
  ab_metric?: 'reply_rate' | 'click_rate' | 'delivery_rate' | null;
  ab_min_sample?: number | null;
  ab_winner_variant_id?: string | null;
  ab_winner_decided_at?: string | null;
  ab_winner_decided_by?: string | null;
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
  accepted?: unknown;
  reason?: unknown;
  error?: unknown;
};

/**
 * Edge Functions can deliberately return HTTP 200 for an operational refusal
 * (for example, a campaign outside its send window). Supabase exposes that as
 * `error: null`, so every lifecycle action must validate the body as well.
 * X013: o lançamento assíncrono responde `{ accepted: true, status: 'sending' }`
 * (o lote roda em outra invocação) — o corpo não traz `success`.
 */
function assertTalkXActionAccepted(data: unknown): asserts data is TalkXActionResponse {
  const response = data && typeof data === 'object' ? data as TalkXActionResponse : null;
  if (response && (response.success === true || response.accepted === true)) return;

  const reason = typeof response?.reason === 'string'
    ? response.reason
    : typeof response?.error === 'string'
      ? response.error
      : 'Solicitação de campanha não foi aceita';
  throw new Error(reason);
}

type CampaignPayload = Omit<Partial<TalkXCampaign>, 'id' | 'created_at' | 'updated_at'>;

export type TalkXDraftSaveResult = {
  campaignId: string;
  revision: number;
  creationReplayed: boolean;
};

function parseDraftSaveResult(data: unknown): TalkXDraftSaveResult {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') throw new Error('O banco não confirmou o salvamento do rascunho.');
  const result = row as Record<string, unknown>;
  const campaignId = result.campaign_id;
  const revision = result.revision;
  if (typeof campaignId !== 'string' || !Number.isInteger(revision) || (revision as number) < 1) {
    throw new Error('Resposta inválida ao salvar o rascunho Talk X.');
  }
  return {
    campaignId,
    revision: revision as number,
    creationReplayed: result.creation_replayed === true,
  };
}

/** V27 (N-120) — linha de `talkx_recipients` usada nas barras de resultado do A/B. */
export interface TalkXAbRecipient {
  variant_id: string;
  status: string;
  replied_at: string | null;
  clicked_at: string | null;
  delivered_at: string | null;
}

/** V27 (N-120, refazer 1) — contagem de UMA variante do A/B, medida no servidor. */
export interface TalkXAbVariantStat {
  variant_id: string;
  /** Rotulo do catalogo (`talkx_template_variants.label`); null quando a campanha nao tem template. */
  label: string | null;
  total: number;
  replies: number;
  clicks: number;
  deliveries: number;
}

/**
 * Superficie do cliente Supabase usada pelo A/B, INJETADA por parametro (nao
 * importada do modulo): o teste finge o servidor com um cliente falso no mesmo
 * formato e inspeciona as consultas reais — ver `useTalkX.abStats.test.ts`.
 */
export type TalkXAbStatsClient = Pick<SupabaseJsClient<Database>, 'from'>;

/** Teto da varredura de descoberta quando a campanha nao tem template (so ids). */
const TALKX_AB_VARIANT_SCAN_LIMIT = 1000;

async function countHeads(
  client: TalkXAbStatsClient,
  campaignId: string,
  variantId: string,
  notNullColumn?: 'replied_at' | 'clicked_at' | 'delivered_at',
): Promise<number> {
  let query = client
    .from('talkx_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('variant_id', variantId);
  if (notNullColumn) query = query.not(notNullColumn, 'is', null);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * V27 (N-120, refazer 1) — amostra do A/B por variante, contada no SERVIDOR.
 *
 * O PostgREST corta a lista de linhas no max-rows (padrao 1000): derivar taxas do
 * tamanho do array erra em campanha grande. Cada numero sai de `count: 'exact',
 * head: true` — total por variante e, por metrica, so linhas com o carimbo
 * correspondente nao nulo (`replied_at`/`clicked_at`/`delivered_at`).
 *
 * As variantes vem do catalogo (`talkx_template_variants` do template da
 * campanha — exato, com rotulo); sem template, de uma varredura leve so com a
 * coluna `variant_id` (sem rotulo, A/B/C na tela). Nenhuma migration nova.
 */
export async function fetchTalkXAbStats(
  client: TalkXAbStatsClient,
  campaignId: string,
): Promise<{ variants: TalkXAbVariantStat[] }> {
  const { data: campaignRow, error: campaignError } = await client
    .from('talkx_campaigns')
    .select('template_id')
    .eq('id', campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  const templateId = campaignRow?.template_id ?? null;

  let variants: Array<{ variant_id: string; label: string | null }>;
  if (templateId) {
    const { data, error } = await client
      .from('talkx_template_variants')
      .select('id, label')
      .eq('template_id', templateId)
      .order('label', { ascending: true });
    if (error) throw error;
    variants = ((data ?? []) as Array<{ id: string; label: string }>).map((v) => ({
      variant_id: v.id,
      label: v.label,
    }));
  } else {
    const { data, error } = await client
      .from('talkx_recipients')
      .select('variant_id')
      .eq('campaign_id', campaignId)
      .not('variant_id', 'is', null)
      .limit(TALKX_AB_VARIANT_SCAN_LIMIT);
    if (error) throw error;
    // Defesa: se algum dia uma linha sem variante escapar do filtro `not ... is null`
    // do servidor, ela nao vira uma "variante" fantasma (o `eq` com null contaria
    // as linhas sem variante como se fossem uma variante).
    const ids = [
      ...new Set(
        ((data ?? []) as Array<{ variant_id: string | null }>)
          .map((r) => r.variant_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ].sort();
    variants = ids.map((variant_id) => ({ variant_id, label: null }));
  }

  const stats = await Promise.all(
    variants.map(async (v) => {
      const [total, replies, clicks, deliveries] = await Promise.all([
        countHeads(client, campaignId, v.variant_id),
        countHeads(client, campaignId, v.variant_id, 'replied_at'),
        countHeads(client, campaignId, v.variant_id, 'clicked_at'),
        countHeads(client, campaignId, v.variant_id, 'delivered_at'),
      ]);
      return { variant_id: v.variant_id, label: v.label, total, replies, clicks, deliveries };
    }),
  );
  return { variants: stats };
}

export function useTalkX() {
  const queryClient = useQueryClient();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // R2-MOD-026: acumula os UPDATEs pendentes POR campanha. Um único timer
  // global (com clearTimeout a cada evento) descartava a atualização da
  // campanha anterior quando outra chegava dentro dos 500 ms.
  const pendingUpdatesRef = useRef<Map<string, TalkXCampaign>>(new Map());

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
      .channel(uniqueRealtimeTopic('talkx:campaigns'))
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'talkx_campaigns' },
        (payload) => {
          // Debounce 500ms para rajadas durante envio ativo. O acumulador é por
          // id: um UPDATE de outra campanha não pode mais descartar o pendente.
          const updated = payload.new as TalkXCampaign;
          pendingUpdatesRef.current.set(updated.id, updated);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            debounceRef.current = null;
            const pending = pendingUpdatesRef.current;
            if (pending.size === 0) return;
            // Novo mapa: eventos que chegarem durante o flush formam o próximo lote.
            pendingUpdatesRef.current = new Map();
            queryClient.invalidateQueries({ queryKey: [TALKX_OVERVIEW_STATS_KEY] });
            queryClient.setQueryData<TalkXCampaign[]>(['talkx-campaigns'], (old) => {
              if (!old) return old;
              return old.map((c) => {
                const update = pending.get(c.id);
                return update ? { ...c, ...update } : c;
              });
            });
          }, 500);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'talkx_campaigns' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
          queryClient.invalidateQueries({ queryKey: [TALKX_OVERVIEW_STATS_KEY] });
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      pendingUpdatesRef.current = new Map();
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

  // V27 (N-120) — AB testing: amostra por variante para as barras do resultado.
  // O vencedor NÃO vem daqui: a tela lê `talkx_campaigns.ab_winner_variant_id`,
  // gravado pelo talkx-scheduler. O front não chama `talkx_determine_winner`
  // porque essa RPC é restrita ao service_role (ver a migration do A/B).
  // Refazer 1: contagens no servidor (`fetchTalkXAbStats`) — derivar do tamanho
  // do array erra acima do max-rows do PostgREST (padrão 1000).
  const abStatsQuery = useQuery({
    queryKey: ['talkx-ab-stats', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return null;
      return fetchTalkXAbStats(supabase, selectedCampaignId);
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

  /**
   * Authoritative editor save path. The database derives authorship from the
   * session, recovers an idempotent create, and rejects a stale revision.
   */
  const saveDraftCampaign = useMutation({
    mutationFn: async ({
      campaignId,
      expectedRevision,
      creationKey,
      payload,
    }: {
      campaignId: string | null;
      expectedRevision: number | null;
      creationKey: string | null;
      payload: CampaignPayload;
    }) => {
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('save_talkx_campaign_draft', {
        p_campaign_id: campaignId,
        p_expected_revision: expectedRevision,
        p_creation_key: creationKey,
        p_payload: payload,
      });
      if (error) throw error;
      return parseDraftSaveResult(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
    },
  });

  const updateCampaignLimits = useMutation({
    mutationFn: async ({
      id,
      expectedRevision,
      limits,
    }: {
      id: string;
      expectedRevision: number | null;
      limits: Record<string, unknown>;
    }) => {
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('update_talkx_campaign_limits', {
        p_campaign_id: id,
        p_expected_revision: expectedRevision,
        p_limits: limits,
      });
      if (error) throw new Error(error.message);
      return data as { campaign_id: string; revision: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      // X026: a exclusão passa pela RPC (draft ou scheduled, sem envio). O delete
      // direto no PostgREST só alcançava rascunho e não deixava rastro/autorização.
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { error } = await rpc('delete_talkx_campaign', { p_campaign_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha excluída');
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  /**
   * X026: duplicar deixa de ser estado do cliente — a RPC cria um rascunho novo
   * no banco copiando mensagem, mídia, segmento, limites e janela, sem
   * destinatários e sem agendamento, e devolve a linha criada.
   */
  const duplicateCampaign = useMutation({
    mutationFn: async (id: string) => {
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('duplicate_talkx_campaign', { p_campaign_id: id });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || typeof row !== 'object') throw new Error('O banco não confirmou a duplicação da campanha.');
      return row as unknown as TalkXCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
      toast.success('Campanha duplicada como rascunho');
    },
    onError: (e: Error) => toast.error(`Erro ao duplicar: ${e.message}`),
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

  /**
   * X017 — gera o snapshot de destinatários NO SERVIDOR a partir do rascunho
   * salvo: a RPC relê origem/segmento/audience_filters/seleção manual, aplica o
   * critério de elegível (talkx_audience_query, X016), regrava talkx_recipients +
   * total_recipients e exige a revisão corrente (controle otimista). Devolve
   * { eligible, suppressed, skipped_invalid }.
   */
  const snapshotDraftAudience = useMutation({
    mutationFn: async ({
      campaignId,
      expectedRevision,
    }: {
      campaignId: string;
      expectedRevision: number;
    }) => {
      const rpc = supabase.rpc as unknown as PendingDatabaseRpc;
      const { data, error } = await rpc('snapshot_talkx_campaign_audience', {
        p_campaign_id: campaignId,
        p_expected_revision: expectedRevision,
      });
      if (error) throw error;
      return data as { eligible: number; suppressed: number; skipped_invalid: number };
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
      toast.success('Envio iniciado; acompanhe no monitor');
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      toast.error(`Erro ao iniciar: ${msg}`);
      return false;
    }
  }, [queryClient]);

  const pauseCampaign = useCallback(async (campaignId: string, reason?: string) => {
    const { data, error } = await supabase.functions.invoke('talkx-send', {
      body: { campaignId, action: 'pause', reason: reason ?? null },
    });
    if (error) throw error;
    assertTalkXActionAccepted(data);
    queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
  }, [queryClient]);

  const cancelCampaign = useCallback(async (campaignId: string, reason?: string) => {
    const { data, error } = await supabase.functions.invoke('talkx-send', {
      body: { campaignId, action: 'cancel', reason: reason ?? null },
    });
    if (error) throw error;
    assertTalkXActionAccepted(data);
    queryClient.invalidateQueries({ queryKey: ['talkx-campaigns'] });
  }, [queryClient]);

  return {
    campaigns: campaignsQuery.data || [],
    isLoading: campaignsQuery.isLoading,
    isError: campaignsQuery.isError,
    error: (campaignsQuery.error as Error | null) ?? null,
    isFetching: campaignsQuery.isFetching,
    isLive,
    recipients: recipientsQuery.data || [],
    recipientsLoading: recipientsQuery.isLoading,
    abStats: abStatsQuery.data,
    abStatsLoading: abStatsQuery.isLoading,
    selectedCampaignId,
    setSelectedCampaignId,
    createCampaign,
    updateCampaign,
    updateCampaignLimits,
    saveDraftCampaign,
    deleteCampaign,
    duplicateCampaign,
    addRecipients,
    replaceDraftRecipients,
    snapshotDraftAudience,
    startCampaign,
    pauseCampaign,
    cancelCampaign,
    refetchCampaigns: campaignsQuery.refetch,
  };
}
