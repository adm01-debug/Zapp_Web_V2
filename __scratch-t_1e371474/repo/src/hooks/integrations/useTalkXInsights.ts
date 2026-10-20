import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { appHour } from '@/lib/localDay';

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
  /** Respostas e envios que sustentam a taxa (amostra exibida no insight). */
  sent: number;
  replied: number;
}

export interface InsightRaw {
  bestHour: { hour: number; replyRate: number; sample: number } | null;
  bestTemplate: BestTemplate | null;
  inactiveContactPct: number | null;
  lowClickCampaigns: number;
  finishedCampaigns: number;
  avgClickRate: number;
  /**
   * A leitura de cliques por campanha bateu no teto defensivo (`CLICK_SAMPLE_LIMIT`):
   * o conjunto é uma AMOSTRA dos cliques mais recentes, não o total. Enquanto for
   * `true`, `buildInsights` abstém-se de concluir "baixo clique".
   */
  clicksTruncated: boolean;
  /** A consulta de cliques por campanha falhou (erro/RLS): o conjunto não é confiável. */
  clickError: boolean;
  /** A leitura de campanhas concluídas atingiu o teto e pode não representar o total. */
  campaignsTruncated: boolean;
}

// Janela e pisos de amostra dos insights heurísticos (E92 / IA-TALKX-001).
export const INSIGHTS_WINDOW_DAYS = 90;
/** Teto de envios lidos para o insight de horário (amostra MAIS RECENTE). */
export const HOUR_SAMPLE_LIMIT = 2000;
/** Mínimo de envios numa hora para ela concorrer a "melhor janela". */
export const HOUR_MIN_SAMPLE = 10;
/** Mínimo de envios numa campanha para entrar na comparação de taxa. */
export const METRIC_MIN_SENT = 10;
/** Taxa de clique (cliques/envios) abaixo da qual a campanha conta como "baixo clique". */
export const LOW_CLICK_MAX_RATE = 0.05;
/** Mínimo de campanhas concluídas com baixo clique para exibir o insight. */
export const LOW_CLICK_MIN_CAMPAIGNS = 3;
/**
 * Teto defensivo de cliques lidos para o insight por campanha. Quando a leitura
 * devolve exatamente este número, o conjunto está truncado e NÃO pode ser tratado
 * como total (o insight de baixo clique abstém-se).
 */
export const CLICK_SAMPLE_LIMIT = 5000;
/** Teto defensivo de campanhas concluídas lidas para o cálculo de baixo clique. */
export const CAMPAIGN_SAMPLE_LIMIT = 500;

/**
 * Vocabulário vigente de public.talkx_campaigns.status (CHECK de
 * 20260929420000_fix_talkx_transition_overload_and_status_check.sql):
 * draft, scheduled, sending, paused, completed, cancelled.
 * "finished" NÃO existe — filtrar por ele não devolve nenhuma linha.
 */
export const TALKX_COMPLETED_STATUS = 'completed';

/** Linha da view talkx_campaign_metrics usada como candidata a "maior engajamento". */
export interface TemplateCandidate {
  campaign_name?: string | null;
  replied_count?: number | null;
  sent_count?: number | null;
  id?: string | null;
}

/**
 * Melhor hora por TAXA de resposta, com amostra mínima por hora.
 *
 * A hora é lida no fuso do app (`America/Sao_Paulo`), não no fuso do dispositivo:
 * `Date#getHours` deslocava a janela sugerida. Hora sem amostra mínima é descartada
 * e, se nenhuma alcançar o piso, a função abstém-se (null) em vez de sugerir horário
 * por um punhado de envios (IA-167).
 */
export function pickBestHour(
  rows: Array<{ sent_at?: string | null; replied_at?: string | null }>,
  opts: { minHourSample?: number; hourOf?: (d: Date) => number } = {},
): InsightRaw['bestHour'] {
  const minHourSample = opts.minHourSample ?? HOUR_MIN_SAMPLE;
  const hourOf = opts.hourOf ?? ((d: Date) => appHour(d));
  const byHour: Record<number, { total: number; replied: number }> = {};
  for (const r of rows) {
    if (!r.sent_at) continue;
    const d = new Date(r.sent_at);
    if (Number.isNaN(d.getTime())) continue;
    const h = hourOf(d);
    byHour[h] ??= { total: 0, replied: 0 };
    byHour[h].total += 1;
    if (r.replied_at) byHour[h].replied += 1;
  }
  let best: { hour: number; rate: number; sample: number } | null = null;
  for (const [h, v] of Object.entries(byHour)) {
    if (v.total < minHourSample) continue;
    const rate = v.replied / v.total;
    if (!best || rate > best.rate) best = { hour: Number(h), rate, sample: v.total };
  }
  if (!best || best.rate <= 0) return null;
  return { hour: best.hour, replyRate: best.rate, sample: best.sample };
}

/**
 * Template campeão por TAXA de resposta (replied/sent), não por número absoluto de
 * respostas: com ordenação por volume, a campanha com mais respostas ganhava mesmo
 * tendo taxa pior — o nome prometia "maior engajamento" sem comparar taxa (IA-168).
 *
 * A métrica é a MESMA para todos os candidatos, com amostra mínima de envios e
 * desempate determinístico para que a eleição não dependa da ordem devolvida pelo
 * banco: 1) maior taxa, 2) maior nº de respostas, 3) maior nº de envios,
 * 4) nome (A→Z), 5) id (A→Z).
 */
export function pickBestTemplate(
  rows: TemplateCandidate[],
  minSent = METRIC_MIN_SENT,
): InsightRaw['bestTemplate'] {
  const scored = rows
    .map((r) => ({
      id: r.id ?? '',
      name: r.campaign_name ?? 'Campanha',
      sent: r.sent_count ?? 0,
      replied: r.replied_count ?? 0,
    }))
    // amostra mínima: campanha com menos envios que o piso não concorre
    .filter((c) => c.sent >= minSent)
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
  return { name: top.name, replyRate: top.rate, campaignId: top.id, sent: top.sent, replied: top.replied };
}

/**
 * Campanhas concluídas com taxa de clique abaixo do limite (cliques/envios).
 *
 * Antes contava-se TODA campanha "finished" como "baixo clique" — o número não media
 * clique algum e a descrição somava universos diferentes (contagem de campanhas ×
 * taxa global). Aqui o filtro é por taxa de clique da própria campanha (IA-168).
 */
export function countLowClickCampaigns(
  campaigns: Array<{ id?: string | null; sent_count?: number | null }>,
  clicksByCampaign: Map<string, number>,
  opts: { maxRate?: number; minSent?: number } = {},
): number {
  const maxRate = opts.maxRate ?? LOW_CLICK_MAX_RATE;
  const minSent = opts.minSent ?? METRIC_MIN_SENT;
  let low = 0;
  for (const c of campaigns) {
    const sent = c.sent_count ?? 0;
    if (sent < minSent) continue;
    const clicks = clicksByCampaign.get(c.id ?? '') ?? 0;
    if (clicks / sent < maxRate) low += 1;
  }
  return low;
}

/**
 * Erros de leitura NÃO podem virar "sem dados": um insight ausente por falha da
 * consulta é indistinguível de um insight ausente por falta de base. As consultas
 * obrigatórias passam por aqui — o erro sobe (o hook expõe o estado de erro) em vez
 * de virar zero silencioso.
 */
function must<T>(res: { data: T | null; error: unknown }, label: string): T {
  if (res.error) throw new Error(`talkx-insights: falha ao consultar ${label}`);
  return res.data as T;
}

/** Linha do join de cliques → campanha. */
type ClickRow = { link_id?: string | null; talkx_links?: { campaign_id?: string | null } | null };

export async function fetchInsightData(): Promise<InsightRaw> {
  const now = new Date();
  const since90 = new Date(now.getTime() - INSIGHTS_WINDOW_DAYS * 86_400_000).toISOString();
  const since180 = new Date(now.getTime() - 180 * 86_400_000).toISOString();

  // 1. Melhor janela de hora (replies nos últimos 90 dias).
  // Amostra = HOUR_SAMPLE_LIMIT envios MAIS RECENTES (ordem decrescente): com ordem
  // crescente o teto congelava a série numa fase antiga da campanha, e a hora era
  // lida no fuso do dispositivo.
  const hourRows = must<Array<{ sent_at?: string | null; replied_at?: string | null }>>(
    await supabase
      .from('talkx_recipients')
      .select('sent_at, replied_at')
      .not('sent_at', 'is', null)
      .gte('sent_at', since90)
      .order('sent_at', { ascending: false })
      .limit(HOUR_SAMPLE_LIMIT),
    'envios recentes (janela de horário)',
  );
  const bestHour = pickBestHour(hourRows);

  // 2. Template campeão por TAXA de resposta (com denominador mínimo), não por
  // número absoluto de respostas.
  // A coluna `reply_rate_pct` é comprovada: migration
  // `20260922130000_fix_talkx_campaign_metrics_view_and_link_clicks_rls.sql` e o type
  // gerado `Views.talkx_campaign_metrics.Row.reply_rate_pct`
  // (src/integrations/supabase/types.ts). Ordenar por ela garante que o teto de 500
  // preserve as MAIORES taxas; a decisão final continua em `pickBestTemplate`
  // (replied_count/sent_count, sem arredondar).
  const metricRows = must<Array<{ id?: string | null; campaign_name?: string | null; replied_count?: number | null; sent_count?: number | null }>>(
    await supabase
      .from('talkx_campaign_metrics')
      .select('id, campaign_name, replied_count, sent_count')
      .gte('sent_count', METRIC_MIN_SENT)
      .order('reply_rate_pct', { ascending: false, nullsFirst: false })
      .limit(500),
    'métricas de campanha',
  );
  const bestTemplate = pickBestTemplate(metricRows);

  // 3. Contatos inativos (> 180 dias sem atualização)
  const totalContactsRes = await supabase.from('contacts').select('id', { count: 'exact', head: true });
  if (totalContactsRes.error) throw new Error('talkx-insights: falha ao contar contatos');
  const inactiveContactsRes = await supabase.from('contacts').select('id', { count: 'exact', head: true }).lt('updated_at', since180);
  if (inactiveContactsRes.error) throw new Error('talkx-insights: falha ao contar contatos inativos');
  const totalContacts = totalContactsRes.count;
  const inactiveContacts = inactiveContactsRes.count;
  let inactiveContactPct: number | null = null;
  if (totalContacts && inactiveContacts && totalContacts > 0) {
    inactiveContactPct = inactiveContacts / totalContacts;
  }

  // 4. Taxa de cliques canônica: cliques / envios no período.
  const clickCountRes = await supabase
    .from('talkx_link_clicks').select('id', { count: 'exact', head: true }).gte('clicked_at', since90);
  if (clickCountRes.error) throw new Error('talkx-insights: falha ao contar cliques');
  const sentCountRes = await supabase
    .from('talkx_recipients').select('id', { count: 'exact', head: true }).not('sent_at', 'is', null).gte('sent_at', since90);
  if (sentCountRes.error) throw new Error('talkx-insights: falha ao contar envios');
  const clickCount = clickCountRes.count;
  const sentCount = sentCountRes.count;
  const avgClickRate = sentCount ? (clickCount ?? 0) / sentCount : 0;

  // 5. Baixo clique POR CAMPANHA: cliques do link → campanha, divididos pelos envios
  // daquela campanha. Sem isso o rótulo "baixo clique" não media clique nenhum.
  // `talkx_links.campaign_id` é comprovado pelo type gerado
  // (Tables.talkx_links.Row.campaign_id em src/integrations/supabase/types.ts) e pela
  // migration `20260916200000_talkx_e90_links.sql`, cujo join reaparece na policy de
  // leitura de `20260922130000_...`. Ordenado por `clicked_at` desc: sob o teto ficam
  // os cliques MAIS RECENTES. Bater exatamente em CLICK_SAMPLE_LIMIT significa conjunto
  // TRUNCADO — não o total —, então a conclusão de baixo clique é abandonada.
  const clickRes: { data: ClickRow[] | null; error: unknown } = await fromTable('talkx_link_clicks')
    .select('link_id, talkx_links!inner(campaign_id)')
    .gte('clicked_at', since90)
    .order('clicked_at', { ascending: false })
    .limit(CLICK_SAMPLE_LIMIT);
  const clickError = Boolean(clickRes.error);
  const clickRows = clickRes.data ?? [];
  const clicksTruncated = clickRows.length >= CLICK_SAMPLE_LIMIT;
  const clicksByCampaign = new Map<string, number>();
  if (!clickError) {
    for (const row of clickRows) {
      const cid = row.talkx_links?.campaign_id;
      if (cid) clicksByCampaign.set(cid, (clicksByCampaign.get(cid) ?? 0) + 1);
    }
  }
  // "Concluída" no contrato da tabela é status='completed' — 'finished' não existe no
  // CHECK de talkx_campaigns, então a contagem anterior era sempre zero.
  const finishedRows = must<Array<{ id?: string | null; sent_count?: number | null }>>(
    await supabase
      .from('talkx_campaigns').select('id, sent_count').eq('status', TALKX_COMPLETED_STATUS).gte('created_at', since90).limit(CAMPAIGN_SAMPLE_LIMIT),
    'campanhas concluídas',
  );
  const finishedCampaigns = finishedRows.length;
  const campaignsTruncated = finishedRows.length >= CAMPAIGN_SAMPLE_LIMIT;
  const lowClickCampaigns = clickError ? 0 : countLowClickCampaigns(finishedRows, clicksByCampaign);

  return { bestHour, bestTemplate, inactiveContactPct, lowClickCampaigns, finishedCampaigns, avgClickRate, clicksTruncated, clickError, campaignsTruncated };
}

export function buildInsights(raw: InsightRaw): TalkXInsight[] {
  const out: TalkXInsight[] = [];

  if (raw.bestHour && raw.bestHour.replyRate >= 0.05) {
    const h = raw.bestHour.hour;
    const hEnd = (h + 2) % 24;
    const fmt = (n: number) => String(n).padStart(2, '0') + ':00';
    out.push({
      id: 'best-hour', type: 'timing', priority: 'high',
      title: 'Janela de horário com mais respostas',
      description:
        'Nos últimos ' + INSIGHTS_WINDOW_DAYS + ' dias, envios entre ' + fmt(h) + ' e ' + fmt(hEnd) +
        ' responderam ' + (raw.bestHour.replyRate * 100).toFixed(1) + '% (amostra: ' + raw.bestHour.sample +
        ' envios). É correlação histórica, não garantia de resultado.',
      applyLabel: 'Configurar horário',
      meta: { hour: h, sample: raw.bestHour.sample },
    });
  }

  if (raw.bestTemplate && raw.bestTemplate.replyRate >= 0.03) {
    out.push({
      id: 'best-template', type: 'template', priority: 'medium',
      title: 'Mensagem com maior taxa de resposta',
      description:
        'A campanha "' + raw.bestTemplate.name + '" respondeu ' + (raw.bestTemplate.replyRate * 100).toFixed(1) +
        '% (' + raw.bestTemplate.replied + ' de ' + raw.bestTemplate.sent + ' envios). Reutilize o tom nas próximas.',
      meta: { campaignId: raw.bestTemplate.campaignId, sent: raw.bestTemplate.sent, replied: raw.bestTemplate.replied },
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

  // Conjunto de cliques/campanhas truncado (teto) ou indisponível (erro) NÃO é o
  // total: sem ambos os conjuntos íntegros, a conclusão de "baixo clique" não sai.
  if (!raw.clickError && !raw.clicksTruncated && !raw.campaignsTruncated && raw.avgClickRate < LOW_CLICK_MAX_RATE && raw.lowClickCampaigns >= LOW_CLICK_MIN_CAMPAIGNS) {
    out.push({
      id: 'low-clicks', type: 'links', priority: 'low',
      title: 'Taxa de cliques abaixo do esperado',
      description:
        'Nas ' + raw.finishedCampaigns + ' campanhas concluídas nos últimos ' + INSIGHTS_WINDOW_DAYS + ' dias, ' +
        raw.lowClickCampaigns + ' ficaram abaixo de ' + (LOW_CLICK_MAX_RATE * 100).toFixed(0) +
        '% de cliques (média geral: ' + (raw.avgClickRate * 100).toFixed(1) + '%). Experimente posicionar o link antes do corpo da mensagem.',
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

// `fetchInsightData` e `buildInsights` já saem exportados nas próprias declarações:
// o bloco `export { ... }` do commit anterior virou export duplicado nesta integração
// e foi removido (o build do Vite rejeita "Duplicated export").
