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

interface InsightRaw {
  bestHour: { hour: number; replyRate: number } | null;
  bestTemplate: { name: string; replyRate: number; campaignId: string } | null;
  inactiveContactPct: number | null;
  lowClickCampaigns: number;
  avgClickRate: number;
}

async function fetchInsightData(): Promise<InsightRaw> {
  const now = new Date();
  const since90  = new Date(now.getTime() - 90  * 86_400_000).toISOString();
  const since180 = new Date(now.getTime() - 180 * 86_400_000).toISOString();

  // 1. Melhor janela de hora (replies nos últimos 90 dias)
  const { data: hourRows } = await supabase
    .from('talkx_recipients')
    .select('sent_at, replied_at')
    .not('sent_at', 'is', null)
    .gte('sent_at', since90)
    .limit(2000);

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

  // 2. Template campeão
  let bestTemplate: InsightRaw['bestTemplate'] = null;
  const { data: metricRows } = await supabase
    .from('talkx_campaign_metrics')
    .select('campaign_name, replied_count, sent_count, id')
    .gte('sent_count', 10)
    .order('replied_count', { ascending: false })
    .limit(5);
  if (metricRows && metricRows.length > 0) {
    const top = metricRows[0] as { campaign_name?: string | null; replied_count?: number | null; sent_count?: number | null; id?: string | null };
    const rate = (top.replied_count && top.sent_count) ? top.replied_count / top.sent_count : 0;
    if (rate > 0) bestTemplate = { name: top.campaign_name ?? 'Campanha', replyRate: rate, campaignId: top.id ?? '' };
  }

  // 3. Contatos inativos (> 180 dias sem atualização)
  let inactiveContactPct: number | null = null;
  const { count: totalContacts } = await supabase.from('contacts').select('id', { count: 'exact', head: true });
  const { count: inactiveContacts } = await supabase.from('contacts').select('id', { count: 'exact', head: true }).lt('updated_at', since180);
  if (totalContacts && inactiveContacts && totalContacts > 0) {
    inactiveContactPct = inactiveContacts / totalContacts;
  }

  // 4. Taxa de cliques
  const { count: clickCount } = await supabase
    .from('talkx_link_clicks').select('id', { count: 'exact', head: true }).gte('clicked_at', since90);
  const { count: sentCount } = await supabase
    .from('talkx_recipients').select('id', { count: 'exact', head: true }).not('sent_at', 'is', null).gte('sent_at', since90);
  const avgClickRate = sentCount ? (clickCount ?? 0) / sentCount : 0;
  const { count: lowClick } = await supabase
    .from('talkx_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'finished').gte('created_at', since90);

  return { bestHour, bestTemplate, inactiveContactPct, lowClickCampaigns: lowClick ?? 0, avgClickRate };
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
