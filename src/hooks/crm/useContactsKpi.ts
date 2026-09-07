import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type Row = { created_at: string; contact_type: string | null; company: string | null };
const DAY = 86_400_000;

/** Mínimo de registros no período anterior para exibir delta. Abaixo disso retorna null. */
const MIN_PREV = 50;

export function aggregateKpi(rows: Row[], now = new Date()) {
  const t = now.getTime();
  const inLast = (r: Row, days: number) => t - Date.parse(r.created_at) < days * DAY;
  const between = (r: Row, from: number, to: number) => {
    const d = t - Date.parse(r.created_at);
    return d >= from * DAY && d < to * DAY;
  };

  const novos30 = rows.filter(r => inLast(r, 30)).length;
  const novosPrev30 = rows.filter(r => between(r, 30, 60)).length;

  const pct = (cur: number, prev: number) =>
    prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

  /** Retorna null quando o período anterior tem dados insuficientes (< MIN_PREV) */
  const pctOrNull = (cur: number, prev: number): number | null =>
    prev < MIN_PREV ? null : pct(cur, prev);

  const daily30 = Array.from({ length: 30 }, (_, i) =>
    rows.filter(r => between(r, 29 - i, 30 - i)).length
  );
  const bucket7 = Array.from({ length: 7 }, (_, i) =>
    daily30.slice(i * 4, i * 4 + 4 + (i === 6 ? 2 : 0)).reduce((a, b) => a + b, 0)
  );
  const weekly = (f: (r: Row) => boolean, weeks = 12) =>
    Array.from({ length: weeks }, (_, i) =>
      rows.filter(r => f(r) && between(r, (weeks - 1 - i) * 7, (weeks - i) * 7)).length
    );
  const cumulative = (arr: number[], base: number) =>
    arr.reduce<number[]>((acc, v) => [...acc, (acc.length ? acc[acc.length - 1] : base) + v], []);

  const olderThan12w = rows.filter(r => !inLast(r, 84)).length;
  const leads = rows.filter(r => r.contact_type === 'lead');
  const leads30 = leads.filter(r => inLast(r, 30)).length;
  const leadsPrev30 = leads.filter(r => between(r, 30, 60)).length;
  const empresasDistinct = new Set(rows.map(r => r.company?.toLowerCase().trim()).filter(Boolean)).size;

  const prevTotal = Math.max(rows.length - novos30, 1);

  return {
    novos30,
    novosPrev30,
    deltaNovosPct: pctOrNull(novos30, novosPrev30),
    deltaTotalPct: pctOrNull(rows.length, prevTotal),
    empresasDistinct,
    leadsTotal: leads.length,
    leads30,
    deltaLeadsPct: pctOrNull(leads30, leadsPrev30),
    seriesTotalCumulative12w: cumulative(weekly(() => true), olderThan12w),
    seriesNovosDaily30: bucket7,
    seriesEmpresasWeekly12: weekly(r => !!r.company),
    seriesLeadsWeekly12: weekly(r => r.contact_type === 'lead'),
  };
}

export type ContactsKpi = ReturnType<typeof aggregateKpi>;

export function useContactsKpi(filterLidLegacy: boolean) {
  return useQuery({
    queryKey: ['contacts-kpi', filterLidLegacy],
    queryFn: async () => {
      let q = supabase.from('contacts').select('created_at, contact_type, company');
      if (filterLidLegacy) q = q.eq('is_lid_legacy', false);
      const { data, error } = await q;
      if (error) throw error;
      return aggregateKpi((data ?? []) as Row[]);
    },
    staleTime: 60_000,
  });
}
