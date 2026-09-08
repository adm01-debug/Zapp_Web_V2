import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface RecentSentimentAlert {
  id: string;
  contactId: string;
  contactName: string;
  department: string | null;
  sentiment: 'negativo' | 'neutro';
  summary: string;
  createdAt: string;
}

export interface DepartmentNegativeShare {
  department: string;
  negative: number;
  total: number;
  pct: number;
}

/**
 * Alertas recentes de sentimento (análises negativas/neutras mais recentes, com nome do contato)
 * e participação de negativos por departamento — tudo lido de conversation_analyses.
 */
export function useRecentSentimentAlerts(days: number, limit = 6) {
  return useQuery({
    queryKey: ['sentiment-recent-alerts', days, limit],
    queryFn: async () => {
      const since = subDays(new Date(), days).toISOString();
      const { data, error } = await supabase
        .from('conversation_analyses')
        .select('id, contact_id, department, sentiment, summary, created_at, contacts(name)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(400);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string; contact_id: string; department: string | null; sentiment: string; summary: string; created_at: string;
        contacts: { name: string | null } | { name: string | null }[] | null;
      }>;
      const nameOf = (c: typeof rows[number]['contacts']) => (Array.isArray(c) ? c[0]?.name : c?.name) ?? 'Contato';

      const alerts: RecentSentimentAlert[] = rows
        .filter((r) => r.sentiment === 'negativo' || r.sentiment === 'neutro')
        .slice(0, limit)
        .map((r) => ({
          id: r.id, contactId: r.contact_id, contactName: nameOf(r.contacts), department: r.department,
          sentiment: r.sentiment as 'negativo' | 'neutro', summary: r.summary, createdAt: r.created_at,
        }));

      const byDept = new Map<string, { negative: number; total: number }>();
      for (const r of rows) {
        const key = r.department?.trim() || 'Sem fila';
        const e = byDept.get(key) ?? { negative: 0, total: 0 };
        e.total += 1;
        if (r.sentiment === 'negativo') e.negative += 1;
        byDept.set(key, e);
      }
      const departments: DepartmentNegativeShare[] = Array.from(byDept.entries())
        .map(([department, v]) => ({ department, negative: v.negative, total: v.total, pct: v.total ? Math.round((v.negative / v.total) * 100) : 0 }))
        .sort((a, b) => b.pct - a.pct);

      return { alerts, departments, totalNegative: rows.filter((r) => r.sentiment === 'negativo').length };
    },
    staleTime: 60_000,
  });
}
