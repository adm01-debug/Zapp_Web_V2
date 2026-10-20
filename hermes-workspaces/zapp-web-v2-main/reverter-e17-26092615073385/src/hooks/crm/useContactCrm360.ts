import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Crm360Purchase {
  id: string;
  title: string;
  amount: number | null;
  purchased_at: string | null;
  status: string | null;
}

export interface Crm360Deal {
  id: string;
  title: string;
  value: number | null;
  status: string | null;
  stage_id: string | null;
  expected_close_date: string | null;
  updated_at: string | null;
}

export interface Crm360Stage {
  id: string;
  name: string;
  position: number;
  is_active: boolean | null;
}

export interface Crm360Activity {
  id: string;
  deal_id: string;
  activity_type: string;
  description: string | null;
  created_at: string | null;
}

export interface Crm360Event {
  id: string;
  event_type: string;
  created_at: string;
}

export interface Crm360Interaction {
  id: string;
  at: string;
  kind: 'purchase' | 'deal_activity' | 'event';
  text: string;
  color: 'primary' | 'success' | 'warning' | 'muted';
}

export interface Crm360Result {
  purchases: Crm360Purchase[];
  openDeals: Crm360Deal[];
  stages: Crm360Stage[];
  currentStage: Crm360Stage | null;
  currentDeal: Crm360Deal | null;
  ticketMedio: number | null;
  ticketDeltaPct: number | null;
  interesses: string[];
  pipeline: {
    propostas: { total: number; count: number };
    negociacao: { total: number; count: number };
    ganhos: { total: number; count: number };
  };
  interacoes: Crm360Interaction[];
  resumo: {
    comprasTotal: number;
    comprasCount: number;
    propostas: number;
    emAberto: number;
  };
}

const COMPLETED_STATUSES = ['completed', 'approved'];
const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6;

/** Agregações puras do CRM 360 — sem I/O, testável com dataset sintético. */
export function aggregateCrm360(
  input: {
    purchases: Crm360Purchase[];
    deals: Crm360Deal[];
    stages: Crm360Stage[];
    tagNames: string[];
    activities: Crm360Activity[];
    events: Crm360Event[];
  },
  now: Date = new Date(),
): Crm360Result {
  const { purchases, deals, stages, tagNames, activities, events } = input;

  const openDeals = deals.filter((d) => d.status === 'open');
  const currentDeal = [...openDeals].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0] ?? null;
  const sortedStages = [...stages].sort((a, b) => a.position - b.position);
  const currentStage = currentDeal ? sortedStages.find((s) => s.id === currentDeal.stage_id) ?? null : null;

  const completedPurchases = purchases.filter((p) => p.status && COMPLETED_STATUSES.includes(p.status));
  const nowMs = now.getTime();
  const recentWindow = completedPurchases.filter((p) => p.purchased_at && nowMs - new Date(p.purchased_at).getTime() <= SIX_MONTHS_MS);
  const priorWindow = completedPurchases.filter((p) => p.purchased_at && nowMs - new Date(p.purchased_at).getTime() > SIX_MONTHS_MS && nowMs - new Date(p.purchased_at).getTime() <= SIX_MONTHS_MS * 2);

  const avg = (list: Crm360Purchase[]) => (list.length ? list.reduce((s, p) => s + (p.amount ?? 0), 0) / list.length : null);

  const ticketMedio = avg(completedPurchases);
  let ticketDeltaPct: number | null = null;
  if (recentWindow.length > 0 && priorWindow.length > 0) {
    const recentAvg = avg(recentWindow) as number;
    const priorAvg = avg(priorWindow) as number;
    ticketDeltaPct = priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : null;
  }

  const interesses = [...new Set(tagNames)].slice(0, 3);

  const propostasStages = new Set(sortedStages.filter((s) => s.name.toLowerCase().includes('propost')).map((s) => s.id));
  const propostas = openDeals.filter((d) => d.stage_id && propostasStages.has(d.stage_id));
  const negociacao = openDeals.filter((d) => !(d.stage_id && propostasStages.has(d.stage_id)));
  const ganhos = deals.filter((d) => d.status === 'won');

  const sum = (list: Crm360Deal[]) => list.reduce((s, d) => s + (d.value ?? 0), 0);

  const interacoes: Crm360Interaction[] = [
    ...activities.map((a): Crm360Interaction => ({
      id: `activity-${a.id}`,
      at: a.created_at ?? '',
      kind: 'deal_activity',
      text: a.description || a.activity_type,
      color: 'primary',
    })),
    ...purchases.map((p): Crm360Interaction => ({
      id: `purchase-${p.id}`,
      at: p.purchased_at ?? '',
      kind: 'purchase',
      text: `Compra realizada — ${p.title}`,
      color: 'success',
    })),
    ...events
      .filter((e) => ['transfer', 'close', 'reopen'].includes(e.event_type))
      .map((e): Crm360Interaction => ({
        id: `event-${e.id}`,
        at: e.created_at,
        kind: 'event',
        text: e.event_type === 'transfer' ? 'Conversa transferida' : e.event_type === 'close' ? 'Conversa encerrada' : 'Conversa reaberta',
        color: 'muted',
      })),
  ]
    .filter((i) => i.at)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);

  return {
    purchases,
    openDeals,
    stages: sortedStages,
    currentStage,
    currentDeal,
    ticketMedio,
    ticketDeltaPct,
    interesses,
    pipeline: {
      propostas: { total: sum(propostas), count: propostas.length },
      negociacao: { total: sum(negociacao), count: negociacao.length },
      ganhos: { total: sum(ganhos), count: ganhos.length },
    },
    interacoes,
    resumo: {
      comprasTotal: completedPurchases.reduce((s, p) => s + (p.amount ?? 0), 0),
      comprasCount: completedPurchases.length,
      propostas: propostas.length + negociacao.length,
      emAberto: openDeals.length,
    },
  };
}

export const contactCrm360Key = (contactId: string | null | undefined) => ['contact-crm-360', contactId] as const;

export function useContactCrm360(contactId: string | null | undefined) {
  return useQuery({
    queryKey: contactCrm360Key(contactId),
    queryFn: async (): Promise<Crm360Result> => {
      const cid = contactId as string;
      const [purchasesRes, dealsRes, stagesRes, tagsRes] = await Promise.all([
        supabase.from('contact_purchases').select('id, title, amount, purchased_at, status').eq('contact_id', cid),
        supabase.from('sales_deals').select('id, title, value, status, stage_id, expected_close_date, updated_at').eq('contact_id', cid),
        supabase.from('sales_pipeline_stages').select('id, name, position, is_active').order('position'),
        supabase.from('contact_tags').select('tags(name)').eq('contact_id', cid),
      ]);
      if (purchasesRes.error) throw purchasesRes.error;
      if (dealsRes.error) throw dealsRes.error;
      if (stagesRes.error) throw stagesRes.error;
      if (tagsRes.error) throw tagsRes.error;

      const deals = (dealsRes.data ?? []) as Crm360Deal[];
      const dealIds = deals.map((d) => d.id);
      const activitiesRes = dealIds.length
        ? await supabase.from('deal_activities').select('id, deal_id, activity_type, description, created_at').in('deal_id', dealIds)
        : { data: [] as Crm360Activity[], error: null };
      if (activitiesRes.error) throw activitiesRes.error;

      const eventsRes = await supabase
        .from('conversation_events')
        .select('id, event_type, created_at')
        .eq('contact_id', cid)
        .in('event_type', ['transfer', 'close', 'reopen'])
        .order('created_at', { ascending: false })
        .limit(20);
      if (eventsRes.error) throw eventsRes.error;

      const tagNames = ((tagsRes.data ?? []) as Array<{ tags: { name: string } | { name: string }[] | null }>)
        .flatMap((row) => (Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : []))
        .map((t) => t.name)
        .filter(Boolean);

      return aggregateCrm360({
        purchases: (purchasesRes.data ?? []) as Crm360Purchase[],
        deals,
        stages: (stagesRes.data ?? []) as Crm360Stage[],
        tagNames,
        activities: (activitiesRes.data ?? []) as Crm360Activity[],
        events: (eventsRes.data ?? []) as Crm360Event[],
      });
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });
}

/** lead_score/risk_score crus de `contacts` — não fazem parte da agregação pura (sem I/O) acima. */
export function useContactLeadScore(contactId: string | null | undefined) {
  return useQuery({
    queryKey: ['contact-lead-score', contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('lead_score, risk_score')
        .eq('id', contactId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });
}

/** Avança um deal aberto para a próxima etapa do funil — mesma mutação usada pelo Pipeline (moveDeal). */
export function useAdvanceDealStage(contactId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, nextStageId, nextStageName }: { dealId: string; nextStageId: string; nextStageName: string }) => {
      const { error } = await supabase.from('sales_deals').update({ stage_id: nextStageId }).eq('id', dealId);
      if (error) throw error;
      await supabase.from('deal_activities').insert({
        deal_id: dealId,
        activity_type: 'stage_change',
        description: `Movido para ${nextStageName}`,
      });
    },
    onSuccess: () => {
      if (contactId) queryClient.invalidateQueries({ queryKey: contactCrm360Key(contactId) });
    },
  });
}
