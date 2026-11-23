import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3, Users, TrendingUp, Building, Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { appDayKey, appDayKeyLabel, appDayStart, appShiftDayKey } from '@/lib/localDay';
import { ptBR } from 'date-fns/locale';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';

interface ContactAnalyticsDashboardProps {
  contacts: Array<{
    id: string;
    name: string;
    contact_type?: string | null;
    company?: string | null;
    tags?: string[] | null;
    created_at: string;
  }>;
  className?: string;
}

export function ContactAnalyticsDashboard({ contacts, className }: ContactAnalyticsDashboardProps) {
  const analytics = useMemo(() => {
    // Type distribution
    const typeMap = new Map<string, number>();
    contacts.forEach(c => {
      const t = c.contact_type || 'cliente';
      typeMap.set(t, (typeMap.get(t) || 0) + 1);
    });
    const typeDistribution = [...typeMap.entries()]
      .map(([type, count]) => ({
        type,
        count,
        percentage: Math.round((count / contacts.length) * 100),
        config: CONTACT_TYPE_CONFIG[type] || CONTACT_TYPE_CONFIG.cliente,
      }))
      .sort((a, b) => b.count - a.count);

    // Top companies
    const companyMap = new Map<string, number>();
    contacts.forEach(c => {
      if (c.company) companyMap.set(c.company, (companyMap.get(c.company) || 0) + 1);
    });
    const topCompanies = [...companyMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Top tags
    const tagMap = new Map<string, number>();
    contacts.forEach(c => {
      c.tags?.forEach(tag => tagMap.set(tag, (tagMap.get(tag) || 0) + 1));
    });
    const topTags = [...tagMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    // Daily growth (last 14 days)
    const dailyGrowth: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStr = appShiftDayKey(appDayKey(new Date()), -i);
      const label = appDayKeyLabel(dayStr);
      const count = contacts.filter(c => appDayKey(c.created_at) === dayStr).length;
      dailyGrowth.push({ date: label, count });
    }

    // New this week — últimos 7 dias de calendário (hoje + 6 anteriores), no fuso do app.
    const semanaAtras = appDayStart(6);
    const newThisWeek = contacts.filter(c => new Date(c.created_at) >= semanaAtras).length;

    return { typeDistribution, topCompanies, topTags, dailyGrowth, newThisWeek };
  }, [contacts]);

  const maxDaily = Math.max(...analytics.dailyGrowth.map(d => d.count), 1);

  // ZD-093 — casca `.zc-alt-view` e barras `.zc-analytics` do design: leitura
  // horizontal (rótulo · trilho · contagem) com no máximo 680px de largura.
  // Os contratos seguem: `contact-analytics-header` com "N nesta página",
  // `<p role="note">` avisando o escopo da página e `contact-analytics-empty`.
  return (
    <div
      className={cn(
        'min-h-[430px] rounded-[12px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))] p-[22px] max-[659px]:p-4',
        className,
      )}
    >
      <div data-testid="contact-analytics-header" className="flex flex-wrap items-center gap-2">
        <BarChart3 className="h-[18px] w-[18px] text-[hsl(var(--contacts-blue))]" aria-hidden="true" />
        <h3 className="m-0 font-display text-[22px] font-medium leading-[1.2] tracking-[-.3px] text-[hsl(var(--contacts-ink))] max-[899px]:text-[19px]">
          Analytics de Contatos
        </h3>
        <Badge variant="secondary" className="ml-auto text-2xs">{contacts.length} nesta página</Badge>
      </div>
      <p role="note" className="mb-[23px] mt-[7px] text-xs text-[hsl(var(--contacts-quiet))]">
        Contagem e agregados (tipos, empresas, tags e novos) consideram somente os contatos da página atual.
      </p>

      {contacts.length === 0 ? (
        <div
          data-testid="contact-analytics-empty"
          className="flex min-h-[445px] flex-col items-center justify-center gap-[10px] rounded-[12px] border border-[hsl(var(--contacts-soft-line))] bg-[hsl(var(--contacts-raised))] px-5 py-[35px] text-center text-xs text-[hsl(var(--contacts-muted))] max-[559px]:min-h-[500px]"
        >
          <BarChart3 className="h-8 w-8 text-[hsl(var(--contacts-quiet))]" aria-hidden="true" />
          <p className="m-0 font-display text-[23px] font-medium text-[hsl(var(--contacts-ink))]">Sem dados</p>
          <p className="m-0 max-w-[480px] text-xs">Nenhum contato nesta página para resumir em gráficos.</p>
        </div>
      ) : (
      <>
      <div className="mt-6 grid max-w-[680px] gap-4" aria-labelledby="analytics-tipos">
        <h4
          id="analytics-tipos"
          className="m-0 flex items-center gap-[7px] text-xs font-medium text-[hsl(var(--contacts-ink))]"
        >
          <Users className="h-[13px] w-[13px] text-[hsl(var(--contacts-blue))]" aria-hidden="true" />
          Distribuição por Tipo
        </h4>
        {analytics.typeDistribution.map((item, i) => (
          <motion.div
            key={item.type}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="grid grid-cols-[160px_1fr_35px] items-center gap-[15px] text-xs text-[hsl(var(--contacts-muted))] max-[559px]:grid-cols-[100px_1fr_24px] max-[559px]:gap-[10px] max-[559px]:text-[11px]"
          >
            <span className="flex min-w-0 items-center gap-[6px]">
              <span aria-hidden="true">{item.config.iconNode}</span>
              <span className="truncate text-[hsl(var(--contacts-ink))]">{item.config.label}</span>
            </span>
            <span className="h-[9px] overflow-hidden rounded-[8px] bg-[hsl(var(--contacts-raised))]">
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${item.percentage}%` }}
                transition={{ delay: i * 0.04 + 0.2, duration: 0.5 }}
                className="block h-full rounded-[8px] bg-[hsl(var(--contacts-blue))]"
                title={`${item.count} de ${contacts.length} (${item.percentage}%)`}
              />
            </span>
            <strong className="text-right font-medium tabular-nums text-[hsl(var(--contacts-ink))]">
              {item.count}
            </strong>
          </motion.div>
        ))}
      </div>

      <div className="mt-7 grid max-w-[680px] gap-4">
        <section className="rounded-[10px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] p-3">
          <h4 className="m-0 mb-[14px] flex items-center gap-[7px] text-xs font-medium text-[hsl(var(--contacts-ink))]">
            <TrendingUp className="h-[13px] w-[13px] text-[hsl(var(--contacts-blue))]" aria-hidden="true" />
            Novos Contatos (14 dias)
            <Badge variant="secondary" className="ml-auto text-2xs">+{analytics.newThisWeek} semana</Badge>
          </h4>
          <div className="flex h-[100px] items-end gap-[3px]">
            {analytics.dailyGrowth.map((day, i) => (
              <motion.div
                key={day.date}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max((day.count / maxDaily) * 100, 4)}%` }}
                transition={{ delay: i * 0.03, duration: 0.4 }}
                className="group relative flex-1 cursor-default rounded-t bg-[hsl(var(--contacts-blue)/0.5)] transition-colors hover:bg-[hsl(var(--contacts-blue)/0.7)]"
                title={`${day.date}: ${day.count} contatos`}
              >
                <span className="absolute -top-5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))] px-1 py-0.5 font-mono text-2xs text-[hsl(var(--contacts-ink))] opacity-0 transition-opacity group-hover:opacity-100">
                  {day.count}
                </span>
              </motion.div>
            ))}
          </div>
          <div className="mt-[6px] flex justify-between text-2xs text-[hsl(var(--contacts-quiet))]">
            <span>{analytics.dailyGrowth[0]?.date}</span>
            <span>{analytics.dailyGrowth[analytics.dailyGrowth.length - 1]?.date}</span>
          </div>
        </section>

        <section className="rounded-[10px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] p-3">
          <h4 className="m-0 mb-[14px] flex items-center gap-[7px] text-xs font-medium text-[hsl(var(--contacts-ink))]">
            <Building className="h-[13px] w-[13px] text-[hsl(var(--contacts-blue))]" aria-hidden="true" />
            Top Empresas
          </h4>
          {analytics.topCompanies.length === 0 ? (
            <p className="m-0 py-2 text-center text-xs text-[hsl(var(--contacts-quiet))]">Sem dados</p>
          ) : (
            <div className="grid gap-2">
              {analytics.topCompanies.map(([company, count], i) => (
                <motion.div
                  key={company}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center justify-between text-xs text-[hsl(var(--contacts-muted))]"
                >
                  <span className="mr-2 truncate text-[hsl(var(--contacts-ink))]">{company}</span>
                  <Badge variant="secondary" className="shrink-0 text-2xs">{count}</Badge>
                </motion.div>
              ))}
            </div>
          )}

          {analytics.topTags.length > 0 && (
            <>
              <div className="mt-4 flex items-center gap-[6px] text-2xs font-medium uppercase tracking-wider text-[hsl(var(--contacts-quiet))]">
                <Tag className="h-3 w-3" aria-hidden="true" />
                Tags populares
              </div>
              <div className="mt-2 flex flex-wrap gap-[5px]">
                {analytics.topTags.map(([tag, count]) => (
                  <Badge key={tag} variant="outline" className="gap-1 text-2xs">
                    {tag}
                    <span className="text-[hsl(var(--contacts-quiet))]">{count}</span>
                  </Badge>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      </>
      )}
    </div>
  );
}