/**
 * TL-162 (X159) — "Checklist para retomar" da campanha pausada (tela 13).
 *
 * Cinco itens, na ordem do mock: (1) segmentação dos públicos e (5) respostas
 * automáticas são conferência MANUAL; (2) mensagens/templates, (3) limites e
 * janelas de envio e (4) agendamentos têm VERIFICAÇÃO AUTOMÁTICA.
 *
 * Persistência (CAP-056): cada marcação grava o estado dos 5 itens numa ÚNICA
 * chamada `log_talkx_campaign_checklist(p_campaign_id, p_items)` — não é um
 * evento por item. A RPC grava um evento `checklist` com o array de itens (o
 * ator `auth.uid()` e a hora ficam no registro). Ao reabrir a tela a marcação
 * volta, e ela vale para a PAUSA ATUAL: a leitura só considera eventos gravados
 * a partir de `paused_at`.
 *
 * O checklist só existe na campanha PAUSADA: com `campaign.status !== 'paused'`
 * as duas consultas ficam desabilitadas e o hook não dispara leitura, RPC nem
 * evento. A marcação é otimista sobre o cache dos itens e as escritas da mesma
 * campanha rodam em série (`scope`), para dois toggles rápidos não se
 * sobrescreverem; falha de gravação avisa o operador com toast.
 *
 * Precheck: a RPC `talkx_campaign_resume_precheck` (conexão, janela e supressão, com
 * `can_resume`/`blockers`) vem de `useTalkXServerResumePrecheck`; os 5 itens abaixo
 * continuam montados no cliente. O precheck dos itens é montado
 * com as leituras que o front já pode fazer: `talkx_engine_window_open`,
 * `talkx_campaign_segments`, `talkx_templates`, `whatsapp_connections`,
 * `talkx_settings(key='optout_autoreply')` e `talkx_optout_keywords`. O orçamento
 * do dia (`talkx_connection_send_budget`) é service_role-only: o item 3 confere
 * janela e conexão, não o limite diário da conta.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fromTable, supabase } from '@/lib/supabaseHelpers';

/** Chaves dos 5 itens, na ordem do mock da tela 13. */
export type TalkXResumeChecklistItemKey =
  | 'segments' | 'templates' | 'limits' | 'schedule' | 'autoresponse';

/** `auto` = o sistema confere; `manual` = o operador marca. */
export type TalkXResumeChecklistVerification = 'auto' | 'manual';

/**
 * `ok`/`attention` são dos itens automáticos; `pending`/`done` dos manuais;
 * `unknown` quando a leitura automática não pôde ser feita agora.
 */
export type TalkXResumeChecklistStatus = 'ok' | 'attention' | 'pending' | 'done' | 'unknown';

export interface TalkXResumeChecklistItem {
  key: TalkXResumeChecklistItemKey;
  title: string;
  subtitle: string;
  verification: TalkXResumeChecklistVerification;
  status: TalkXResumeChecklistStatus;
}

/** Estado das verificações automáticas (equivalente de `talkx_campaign_resume_precheck`). */
export interface TalkXResumePrecheck {
  pendingSegments: number | null;
  totalSegments: number | null;
  templateStatus: string | null;
  connectionStatus: string | null;
  windowOpen: boolean | null;
  nextSendAt: string | null;
  optoutAutoreply: boolean | null;
  optoutKeywords: number | null;
}

/** O que o checklist precisa saber da campanha (a linha já carregada pela tela). */
export interface TalkXResumeChecklistCampaign {
  id: string;
  /** Só `paused` monta o checklist; qualquer outro status desliga as leituras. */
  status?: string | null;
  template_id?: string | null;
  whatsapp_connection_id?: string | null;
  scheduled_at?: string | null;
  /** Quando preenchido, a campanha já começou: o `scheduled_at` já disparou. */
  started_at?: string | null;
  paused_at?: string | null;
}

const CHECKLIST_TITLES: Record<TalkXResumeChecklistItemKey, string> = {
  segments: 'Revisar segmentação dos públicos',
  templates: 'Confirmar mensagens e templates',
  limits: 'Verificar limites e janelas de envio',
  schedule: 'Validar agendamentos',
  autoresponse: 'Revisar respostas automáticas',
};

/** Itens 1 e 5 são conferência manual; 2, 3 e 4 o sistema confere sozinho. */
const CHECKLIST_VERIFICATION: Record<TalkXResumeChecklistItemKey, TalkXResumeChecklistVerification> = {
  segments: 'manual',
  templates: 'auto',
  limits: 'auto',
  schedule: 'auto',
  autoresponse: 'manual',
};

const ITEM_ORDER: TalkXResumeChecklistItemKey[] = ['segments', 'templates', 'limits', 'schedule', 'autoresponse'];

/** Tempo até o próximo envio: "3 dias", "2 h 10 min", "8 min", "menos de 1 min". */
export function formatTimeUntil(targetIso: string, now: number = Date.now()): string {
  const diffMs = new Date(targetIso).getTime() - now;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'agora';
  const days = Math.floor(diffMs / 86_400_000);
  if (days >= 1) return days === 1 ? '1 dia' : `${days} dias`;
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours >= 1) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes >= 1) return `${minutes} min`;
  return 'menos de 1 min';
}

function segmentsSubtitle(precheck: TalkXResumePrecheck | null): string {
  if (!precheck || precheck.pendingSegments === null) return 'Confira os públicos da campanha';
  const pending = precheck.pendingSegments;
  if (pending === 0) return 'Nenhum segmento pendente';
  return pending === 1 ? '1 segmento pendente' : `${pending} segmentos pendentes`;
}

function templatesSubtitle(precheck: TalkXResumePrecheck | null): { subtitle: string; status: TalkXResumeChecklistStatus } {
  if (!precheck) return { subtitle: 'Aguardando verificação', status: 'unknown' };
  if (!precheck.templateStatus) return { subtitle: 'Sem template vinculado — mensagem própria', status: 'ok' };
  if (precheck.templateStatus === 'approved') return { subtitle: 'Todos os templates OK', status: 'ok' };
  if (precheck.templateStatus === 'rejected') return { subtitle: 'Template recusado', status: 'attention' };
  return { subtitle: 'Template aguardando aprovação', status: 'attention' };
}

function limitsSubtitle(precheck: TalkXResumePrecheck | null): { subtitle: string; status: TalkXResumeChecklistStatus } {
  if (!precheck) return { subtitle: 'Aguardando verificação', status: 'unknown' };
  if (precheck.connectionStatus && precheck.connectionStatus !== 'connected') {
    return { subtitle: 'WhatsApp desconectado', status: 'attention' };
  }
  if (precheck.connectionStatus === null && precheck.windowOpen === null) {
    return { subtitle: 'Não foi possível verificar agora', status: 'unknown' };
  }
  if (precheck.windowOpen === false) return { subtitle: 'Fora do horário de envio', status: 'attention' };
  if (precheck.windowOpen === null) return { subtitle: 'Não foi possível verificar agora', status: 'unknown' };
  return { subtitle: 'Dentro da janela de envio', status: 'ok' };
}

function scheduleSubtitle(precheck: TalkXResumePrecheck | null, now: number): { subtitle: string; status: TalkXResumeChecklistStatus } {
  if (!precheck) return { subtitle: 'Aguardando verificação', status: 'unknown' };
  if (!precheck.nextSendAt) return { subtitle: 'Sem agendamento — envio único', status: 'ok' };
  const target = new Date(precheck.nextSendAt).getTime();
  if (Number.isFinite(target) && target <= now) return { subtitle: 'Agendamento vencido', status: 'attention' };
  return { subtitle: `Próximo envio em ${formatTimeUntil(precheck.nextSendAt, now)}`, status: 'ok' };
}

function autoresponseSubtitle(precheck: TalkXResumePrecheck | null): string {
  if (!precheck || precheck.optoutAutoreply === null) return 'Confira a resposta automática de saída e as regras';
  if (!precheck.optoutAutoreply) return 'Resposta de saída não configurada';
  const keywords = precheck.optoutKeywords;
  if (keywords === null || keywords === 0) return 'Resposta de saída configurada';
  return keywords === 1
    ? 'Resposta de saída configurada · 1 palavra-chave'
    : `Resposta de saída configurada · ${keywords} palavras-chave`;
}

/**
 * Monta os 5 itens do checklist. Puro: a mesma função serve ao hook e ao teste.
 * `marked` são as chaves marcadas na pausa atual (itens manuais).
 */
export function buildTalkXResumeChecklistItems(
  precheck: TalkXResumePrecheck | null,
  marked: readonly TalkXResumeChecklistItemKey[] = [],
  now: number = Date.now(),
): TalkXResumeChecklistItem[] {
  const isMarked = (key: TalkXResumeChecklistItemKey) => marked.includes(key);
  const manual = (key: TalkXResumeChecklistItemKey, subtitle: string): TalkXResumeChecklistItem => ({
    key,
    title: CHECKLIST_TITLES[key],
    subtitle,
    verification: 'manual',
    status: isMarked(key) ? 'done' : 'pending',
  });

  const templates = templatesSubtitle(precheck);
  const limits = limitsSubtitle(precheck);
  const schedule = scheduleSubtitle(precheck, now);

  const byKey: Record<TalkXResumeChecklistItemKey, TalkXResumeChecklistItem> = {
    segments: manual('segments', segmentsSubtitle(precheck)),
    templates: { key: 'templates', title: CHECKLIST_TITLES.templates, subtitle: templates.subtitle, verification: 'auto', status: templates.status },
    limits: { key: 'limits', title: CHECKLIST_TITLES.limits, subtitle: limits.subtitle, verification: 'auto', status: limits.status },
    schedule: { key: 'schedule', title: CHECKLIST_TITLES.schedule, subtitle: schedule.subtitle, verification: 'auto', status: schedule.status },
    autoresponse: manual('autoresponse', autoresponseSubtitle(precheck)),
  };

  return ITEM_ORDER.map((key) => byKey[key]);
}

/** Lê a lista de chaves marcadas do `message` do evento `checklist` (array JSON). */
export function parseChecklistMarks(message: string | null): TalkXResumeChecklistItemKey[] {
  if (!message) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const keys: TalkXResumeChecklistItemKey[] = [];
  for (const entry of parsed) {
    const raw = entry && typeof entry === 'object' && 'key' in entry
      ? (entry as { key?: unknown; checked?: unknown })
      : null;
    const key = raw ? raw.key : entry;
    if (typeof key !== 'string' || !ITEM_ORDER.includes(key as TalkXResumeChecklistItemKey)) continue;
    // Registros antigos/parciais são aceitos; `checked:false` significa desmarcado.
    if (raw && raw.checked === false) continue;
    if (!keys.includes(key as TalkXResumeChecklistItemKey)) keys.push(key as TalkXResumeChecklistItemKey);
  }
  return keys;
}

async function loadPrecheck(campaign: TalkXResumeChecklistCampaign): Promise<TalkXResumePrecheck> {
  const precheck: TalkXResumePrecheck = {
    pendingSegments: null,
    totalSegments: null,
    templateStatus: null,
    connectionStatus: null,
    windowOpen: null,
    // A campanha pausada que já iniciou (`started_at`) não tem "próximo envio":
    // o `scheduled_at` já disparou e compará-lo com agora dava falso "Agendamento
    // vencido". Só uma campanha que ainda não começou usa o horário agendado.
    nextSendAt: campaign.started_at ? null : (campaign.scheduled_at ?? null),
    optoutAutoreply: null,
    optoutKeywords: null,
  };

  try {
    const [segments, template, connection, windowResult, autoreply, keywords] = await Promise.all([
      fromTable('talkx_campaign_segments').select('status').eq('campaign_id', campaign.id),
      campaign.template_id
        ? fromTable('talkx_templates').select('status').eq('id', campaign.template_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      campaign.whatsapp_connection_id
        ? fromTable('whatsapp_connections').select('status').eq('id', campaign.whatsapp_connection_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.rpc('talkx_engine_window_open', { p_campaign_id: campaign.id }),
      fromTable('talkx_settings').select('value').eq('key', 'optout_autoreply').maybeSingle(),
      fromTable('talkx_optout_keywords').select('keyword', { count: 'exact', head: true }),
    ]);

    if (!segments?.error && Array.isArray(segments?.data)) {
      const rows = segments.data as { status: string | null }[];
      precheck.totalSegments = rows.length;
      precheck.pendingSegments = rows.filter((row) => row.status === 'pending').length;
    }
    if (!template?.error) precheck.templateStatus = (template?.data as { status?: string } | null)?.status ?? null;
    if (!connection?.error) precheck.connectionStatus = (connection?.data as { status?: string } | null)?.status ?? null;
    if (!windowResult?.error && typeof windowResult?.data === 'boolean') precheck.windowOpen = windowResult.data;
    if (!autoreply?.error) {
      const value = (autoreply?.data as { value?: unknown } | null)?.value;
      precheck.optoutAutoreply = value !== null && value !== undefined && value !== '' ? true : false;
    }
    if (!keywords?.error && typeof keywords?.count === 'number') precheck.optoutKeywords = keywords.count;
  } catch {
    // Rede/RLS fora: o checklist cai no estado "não verificado" em vez de quebrar a tela.
  }

  return precheck;
}

async function loadChecklistMarks(campaignId: string, pausedAt: string | null): Promise<TalkXResumeChecklistItemKey[]> {
  let query = fromTable('talkx_campaign_events')
    .select('message')
    .eq('campaign_id', campaignId)
    .eq('event_type', 'checklist')
    .order('created_at', { ascending: false })
    .limit(1);
  if (pausedAt) query = query.gte('created_at', pausedAt);
  const { data, error } = await query;
  if (error) throw error;
  const message = ((data ?? []) as { message: string | null }[])[0]?.message ?? null;
  return parseChecklistMarks(message);
}

/** Variáveis do salvamento: o estado novo e o anterior (para desfazer na falha). */
interface SaveChecklistVariables {
  next: TalkXResumeChecklistItemKey[];
  previous: TalkXResumeChecklistItemKey[];
}

export interface TalkXResumeChecklistResult {
  items: TalkXResumeChecklistItem[];
  isLoading: boolean;
  isError: boolean;
  isSaving: boolean;
  /** Itens que ainda pedem ação (atenção, não verificado ou não conferido). */
  openCount: number;
  toggle: (key: TalkXResumeChecklistItemKey, checked: boolean) => void;
}

export function useTalkXResumeChecklist(campaign: TalkXResumeChecklistCampaign | null): TalkXResumeChecklistResult {
  const queryClient = useQueryClient();
  const campaignId = campaign?.id ?? null;
  const isPaused = campaign?.status === 'paused';
  const pausedAt = campaign?.paused_at ?? null;
  const connectionId = campaign?.whatsapp_connection_id ?? null;
  const templateId = campaign?.template_id ?? null;
  const scheduledAt = campaign?.scheduled_at ?? null;
  const startedAt = campaign?.started_at ?? null;

  // A chave carrega TODOS os campos da campanha que o loader lê, senão mudar o
  // agendamento reutilizaria o precheck do horário anterior.
  const precheckQueryKey = ['talkx-resume-precheck', campaignId, connectionId, templateId, scheduledAt, startedAt];
  const marksQueryKey = ['talkx-resume-checklist', campaignId, pausedAt];
  // Só a campanha pausada tem checklist: fora da pausa nada é lido nem disparado.
  const enabled = !!campaignId && isPaused;

  const precheckQuery = useQuery({
    queryKey: precheckQueryKey,
    enabled,
    staleTime: 30_000,
    queryFn: () => loadPrecheck(campaign!),
  });

  const marksQuery = useQuery({
    queryKey: marksQueryKey,
    enabled,
    queryFn: () => loadChecklistMarks(campaignId!, pausedAt),
  });

  const items = useMemo(
    () => buildTalkXResumeChecklistItems(precheckQuery.data ?? null, marksQuery.data ?? []),
    [precheckQuery.data, marksQuery.data],
  );

  const save = useMutation({
    // Mesma campanha grava em série: dois toggles rápidos não se sobrescrevem.
    scope: { id: 'talkx-resume-checklist' },
    mutationFn: async ({ next }: SaveChecklistVariables) => {
      const p_items = ITEM_ORDER.map((key) => ({ key, checked: next.includes(key) }));
      const { error } = await supabase.rpc('log_talkx_campaign_checklist', {
        p_campaign_id: campaignId!,
        p_items,
      });
      if (error) throw error;
    },
    onError: (_error, variables) => {
      queryClient.setQueryData(marksQueryKey, variables.previous);
      toast.error('Não foi possível salvar o checklist. Tente novamente.');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['talkx-resume-checklist', campaignId] });
    },
  });

  return {
    items,
    isLoading: precheckQuery.isLoading || marksQuery.isLoading,
    isError: precheckQuery.isError || marksQuery.isError,
    isSaving: save.isPending,
    openCount: items.filter((item) => item.status === 'attention' || item.status === 'unknown' || item.status === 'pending').length,
    toggle: (key, checked) => {
      // Lê o cache MAIS RECENTE (não o snapshot do render): marcação otimista
      // para o segundo toggle enxergar a primeira marcação.
      const current = queryClient.getQueryData<TalkXResumeChecklistItemKey[]>(marksQueryKey)
        ?? marksQuery.data
        ?? [];
      const next = checked
        ? (current.includes(key) ? current : [...current, key])
        : current.filter((entry) => entry !== key);
      queryClient.setQueryData(marksQueryKey, next);
      save.mutate({ next, previous: current });
    },
  };
}
