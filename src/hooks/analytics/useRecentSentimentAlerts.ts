import { useQuery } from '@tanstack/react-query';
import { subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { normalizeSentiment, type Sentiment } from '@/lib/ai-vocabulary';

/**
 * Sentimento canônico que vira alerta: negativos em qualquer intensidade
 * (`negativo` e o extremo `critico`) e `neutro`. `positivo` não alerta.
 */
export type AlertSentiment = Extract<Sentiment, 'negativo' | 'critico' | 'neutro'>;

export interface RecentSentimentAlert {
  id: string;
  contactId: string;
  contactName: string;
  department: string | null;
  sentiment: AlertSentiment;
  summary: string;
  createdAt: string;
}

export interface DepartmentNegativeShare {
  department: string;
  negative: number;
  total: number;
  pct: number;
}

/** `true` para a classe negativa canônica — inclui o extremo `critico`. */
const isNegative = (sentiment: Sentiment | null): boolean => sentiment === 'negativo' || sentiment === 'critico';

/**
 * Alertas recentes de sentimento (análises negativas/neutras mais recentes, com nome do contato)
 * e participação de negativos por departamento — tudo lido de conversation_analyses.
 *
 * IA-SENTIMENT-001: o sentimento cru passa pelo normalizador canônico na
 * leitura (traduz o legado EN e mantém `critico` como negativo), em vez de
 * comparar com o literal pt-BR direto. Assim o legado EN não desaparece, o
 * crítico entra como alerta e desconhecido/ausente não é contado como outra
 * classe.
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
        .map((row) => ({ row, sentimento: normalizeSentiment(row.sentiment).value }))
        .filter(({ sentimento }) => sentimento === 'negativo' || sentimento === 'critico' || sentimento === 'neutro')
        .slice(0, limit)
        .map(({ row, sentimento }) => ({
          id: row.id, contactId: row.contact_id, contactName: nameOf(row.contacts), department: row.department,
          sentiment: sentimento as AlertSentiment, summary: row.summary, createdAt: row.created_at,
        }));

      const byDept = new Map<string, { negative: number; total: number }>();
      for (const r of rows) {
        const key = r.department?.trim() || 'Sem fila';
        const e = byDept.get(key) ?? { negative: 0, total: 0 };
        e.total += 1;
        if (isNegative(normalizeSentiment(r.sentiment).value)) e.negative += 1;
        byDept.set(key, e);
      }
      const departments: DepartmentNegativeShare[] = Array.from(byDept.entries())
        .map(([department, v]) => ({ department, negative: v.negative, total: v.total, pct: v.total ? Math.round((v.negative / v.total) * 100) : 0 }))
        .sort((a, b) => b.pct - a.pct);

      return { alerts, departments, totalNegative: rows.filter((r) => isNegative(normalizeSentiment(r.sentiment).value)).length };
    },
    staleTime: 60_000,
  });
}
