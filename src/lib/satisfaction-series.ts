import { format } from 'date-fns';

/**
 * DASH-CONTROLS-001 (ponto 2): o select "CSAT e NPS" do gráfico de evolução
 * desenhava só a linha CSAT mesmo com a legenda NPS visível. Estas funções
 * constroem a série NPS por dia a partir de `nps_surveys` (dado real já
 * carregado pelo card) para que a seleção mude a série de verdade.
 */

export interface NpsSurveyPoint {
  created_at: string;
  score: number;
}

export interface SatisfactionTimelinePoint {
  /** 'dd/MM' — mesmo formato produzido por useSatisfactionBreakdown. */
  date: string;
  csatPercent: number | null;
}

export interface EvolutionSeriesRow {
  date: string;
  CSAT: number | null;
  NPS: number | null;
}

/**
 * NPS diário: (promotores − detratores) / total × 100, arredondado.
 * Dia sem resposta NPS não entra no mapa (vira `null` na série, não 0).
 * O NPS real varia de −100 a +100 — quem desenha precisa de eixo que cubra
 * negativo ou a série clipa em silêncio.
 */
export function npsTimelineByDay(
  surveys: NpsSurveyPoint[],
  periodDays: number,
  nowMs: number,
): Map<string, number> {
  const cutoffMs = periodDays * 86400000;
  const byDay = new Map<string, { promoters: number; detractors: number; total: number }>();
  for (const s of surveys) {
    const t = Date.parse(s.created_at);
    if (Number.isNaN(t) || nowMs - t > cutoffMs || t > nowMs + 86400000) continue;
    const key = format(new Date(t), 'dd/MM');
    const e = byDay.get(key) ?? { promoters: 0, detractors: 0, total: 0 };
    e.total += 1;
    if (s.score >= 9) e.promoters += 1;
    else if (s.score <= 6) e.detractors += 1;
    byDay.set(key, e);
  }
  return new Map(
    [...byDay.entries()].map(([k, v]) => [k, Math.round(((v.promoters - v.detractors) / v.total) * 100)]),
  );
}

/** Une a timeline CSAT ('dd/MM') com o NPS diário; dia sem NPS = null. */
export function buildEvolutionSeries(
  timeline: SatisfactionTimelinePoint[],
  npsByDay: Map<string, number>,
): EvolutionSeriesRow[] {
  return timeline.map(t => ({
    date: t.date,
    CSAT: t.csatPercent != null ? Math.round(t.csatPercent) : null,
    NPS: npsByDay.get(t.date) ?? null,
  }));
}
