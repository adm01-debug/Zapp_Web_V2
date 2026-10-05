import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Estrutura de um insight heurístico */
export interface TalkXInsight {
  id: string;
  type: 'timing' | 'template' | 'reactivation' | 'links';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  apply?: () => void;
  applyLabel?: string;
  meta?: Record<string, unknown>;
}

/** Campanha vencedora por engajamento, já com a métrica explicitada. */
export interface BestTemplate {
  name: string;
  replyRate: number;
  campaignId: string;
}

interface InsightRaw {
  bestHour: { hour: number; replyRate: number } | null;
  bestTemplate: BestTemplate | null;
  inactiveContactPct: number | null;
  lowClickCampaigns: number;
  avgClickRate: number;
}

/** Linha da view talkx_campaign_metrics usada como candidata a "maior engajamento". */
export interface TemplateCandidate {
  campaign_name?: string | null;
  replied_count?: number | null;
  sent_count?: number | null;
  id?: string | null;
}

/**
 * Vocabulário vigente de public.talkx_campaigns.status (CHECK de
 * 20260929420000_fix_talkx_transition_overload_and_status_check.sql):
 * draft, scheduled, sending, paused, completed, cancelled.
 * "finished" NÃO existe — filtrar por ele não devolve nenhuma linha.
 */
export const TALKX_COMPLETED_STATUS = 'completed';

/** Amostra mínima de envios para uma campanha concorrer a "maior engajamento". */
export const MIN_SENT_SAMPLE = 10;

/** Janela de análise das métricas de engajamento, em dias. */
export const INSIGHT_WINDOW_DAYS = 90;

/**
 * Métrica de engajamento: taxa de resposta = replied_count / sent_count.
 * Os candidatos são classificados pela MESMA métrica (nunca por contagem
 * absoluta de respostas), com amostra mínima e desempate explícito:
 *   1) maior taxa   2) maior nº de respostas   3) maior nº de envios
 *   4) nome (A→Z)   5) id (A→Z)
 */
export function pickBestTemplate(rows: TemplateCandidate[]): BestTemplate | null {
  const scored = rows
    .map((r) => ({
      id: r.id ?? '',
      name: r.campaign_name ?? 'Campanha',
      sent: r.sent_count ?? 0,
      replied: r.replied_count ?? 0,
    }))
    // amostra mínima: campanha com menos envios que o piso não concorre
    .filter((c) => c.sent >= MIN_SENT_SAMPLE)
    .map((c) => ({ ...c, rate: c.replied / c.sent }))
    .filter((c) => c.rate > 0);

  if (scored.length === 0) return null;

  scored.sort(
    (a, b) =>
      b.rate - a.rate ||
      b.replied - a.replied ||
      b.sent - a.sent ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );

  const top = scored[0];
  return { name: top.name, replyRate: top.rate, campaignId: top.id };
}

/** Erro de leitura deixa de virar "sem dado": sobe para o estado de erro da query. */
function fail(scope: string, error: { message?: string | null } | null): never {
  throw new Error(`Falha ao ler ${scope}: ${error?.message ?? 'erro desconhecido'}`);
}

async function fetchInsightData(): Promise<InsightRaw> {
  const now = new Date();
  const since = new Date(now.getTime() - INSIGHT_WINDOW_DAYS * 86_400_000).toISOString();
  const since180 = new Date(now.getTime() - 180 * 86_400_000).toISOString();

  // 1. Melhor janela de hora (replies nos últimos 90 dias)
  const { data: hourRows, error: hourError } = await supabase
    .from('talkx_recipients')
    .select('sent_at, replied_at')
    .not('sent_at', 'is', null)
    .gte('sent_at', since)
    .limit(2000);
  if (hourError) fail('talkx_recipients (janela de hora)', hourError);

  let bestHour: InsightRaw['bestHour'] = null;
  if (hourRows && hourRows.length > 0) {
    const byHour: Record<number, { total: number; replied: number }> = {};
    for (const r of hourRows) {
      const h = new Date(r.sent_at!).getHours();
      byHour[h] ??= { total: 0, replied: 0 };
      byHour[h].total++;
      if (r.replied_at) byHour[h].replied++;
    }
    let best = { hour: 0, rate: 0 };
    for (const [h, v] of Object.entries(byHour)) {
      if (v.total >= 10) {
        const rate = v.replied / v.total;
        if (rate > best.rate) best = { hour: Number(h), rate };
      }
    }
    if (best.rate > 0) bestHour = { hour: best.hour, replyRate: best.rate };
  }

  // 2. Template campeão — candidatos trazidos com a amostra mínima e
  // classificados pela taxa de resposta (não pela contagem absoluta).
  const { data: metricRows, error: metricError } = await supabase
    .from('talkx_campaign_metrics')
    .select('campaign_name, replied_count, sent_count, id')
    .gte('sent_count', MIN_SENT_SAMPLE)
    .limit(500);
  if (metricError) fail('talkx_campaign_metrics', metricError);
  const bestTemplate = pickBestTemplate((metricRows ?? []) as TemplateCandidate[]);

  // 3. Contatos inativos (> 180 dias sem atualização)
  let inactiveContactPct: number | null = null;
  const { count: totalContacts, error: totalError } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true });
  if (totalError) fail('contacts (total)', totalError);
  const { count: inactiveContacts, error: inactiveError } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .lt('updated_at', since180);
  if (inactiveError) fail('contacts (inativos)', inactiveError);
  if (totalContacts && inactiveContacts && totalContacts > 0) {
    inactiveContactPct = inactiveContacts / totalContacts;
  }

  // 4. Taxa de cliques — cliques, enviados e campanhas falam do MESMO conjunto:
  // as campanhas concluídas dentro da janela.
  const { data: completedRows, error: completedError } = await supabase
    .from('talkx_campaigns')
    .select('id')
    .eq('status', TALKX_COMPLETED_STATUS)
    .gte('created_at', since);
  if (completedError) fail('talkx_campaigns (concluídas)', completedError);

  const completedIds = (completedRows ?? [])
    .map((r) => (r as { id?: string | null }).id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const lowClickCampaigns = completedIds.length;

  let avgClickRate = 0;
  if (completedIds.length > 0) {
    const { data: linkRows, error: linkError } = await supabase
      .from('talkx_links')
      .select('id')
      .in('campaign_id', completedIds);
    if (linkError) fail('talkx_links (das concluídas)', linkError);
    const linkIds = (linkRows ?? [])
      .map((r) => (r as { id?: string | null }).id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    let clickCount = 0;
    if (linkIds.length > 0) {
      const { count, error: clickError } = await supabase
        .from('talkx_link_clicks')
        .select('id', { count: 'exact', head: true })
        .in('link_id', linkIds)
        .gte('clicked_at', since);
      if (clickError) fail('talkx_link_clicks', clickError);
      clickCount = count ?? 0;
    }

    const { count: sentCount, error: sentError } = await supabase
      .from('talkx_recipients')
      .select('id', { count: 'exact', head: true })
      .in('campaign_id', completedIds)
      .not('sent_at', 'is', null)
      .gte('sent_at', since);
    if (sentError) fail('talkx_recipients (das concluídas)', sentError);

    avgClickRate = sentCount ? clickCount / sentCount : 0;
  }

  return { bestHour, bestTemplate, inactiveContactPct, lowClickCampaigns, avgClickRate };
}

function buildInsights(raw: InsightRaw): TalkXInsight[] {
  const out: TalkXInsight[] = [];

  if (raw.bestHour && raw.bestHour.replyRate >= 0.05) {
    const h = raw.bestHour.hour;
    const hEnd = (h + 2) % 24;
    const fmt = (n: number) => String(n).padStart(2, '0') + ':00';
    out.push({
      id: 'best-hour', type: 'timing', priority: 'high',
      title: 'Janela ótima de envio',
      description: 'Campanhas enviadas entre ' + fmt(h) + ' e ' + fmt(hEnd) + ' obtiveram ' + (raw.bestHour.replyRate * 100).toFixed(1) + '% de resposta nos últimos 90 dias.',
      applyLabel: 'Configurar horário',
      meta: { hour: h },
    });
  }

  if (raw.bestTemplate && raw.bestTemplate.replyRate >= 0.03) {
    out.push({
      id: 'best-template', type: 'template', priority: 'medium',
      title: 'Mensagem com maior engajamento',
      description: 'A campanha "' + raw.bestTemplate.name + '" teve ' + (raw.bestTemplate.replyRate * 100).toFixed(1) + '% de resposta. Reutilize o tom nas próximas.',
      meta: { campaignId: raw.bestTemplate.campaignId },
    });
  }

  if (raw.inactiveContactPct !== null && raw.inactiveContactPct >= 0.2) {
    out.push({
      id: 'inactive-contacts', type: 'reactivation',
      priority: raw.inactiveContactPct >= 0.4 ? 'high' : 'medium',
      title: 'Base com muitos contatos inativos',
      description: (raw.inactiveContactPct * 100).toFixed(0) + '% dos contatos não foram atualizados nos últimos 6 meses. Uma campanha de reativação melhora as métricas.',
      applyLabel: 'Criar campanha de reativação',
    });
  }

  if (raw.avgClickRate < 0.05 && raw.lowClickCampaigns >= 3) {
    out.push({
      id: 'low-clicks', type: 'links', priority: 'low',
      title: 'Taxa de cliques abaixo do esperado',
      description: 'Últimas ' + raw.lowClickCampaigns + ' campanhas: ' + (raw.avgClickRate * 100).toFixed(1) + '% de cliques. Experimente posicionar o link antes do corpo da mensagem.',
    });
  }

  return out;
}

/**
 * E92: hook com insights heurísticos sobre campanhas Talk X.
 * Cache de 1 h. Sem chamada a IA externa — cálculo local sobre dados reais.
 */
export function useTalkXInsights() {
  return useQuery({
    queryKey: ['talkx-insights'],
    queryFn: async (): Promise<TalkXInsight[]> => buildInsights(await fetchInsightData()),
    staleTime: 60 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
    retry: 1,
  });
}

// Exportados para teste (o cartão #223 prova aqui o defeito de ranking e de status).
export { fetchInsightData, buildInsights };
