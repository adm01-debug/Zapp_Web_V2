import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Users, UserPlus, Building, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactStatsCardsProps {
  totalCount: number;
  contactCountByType: Record<string, number>;
  uniqueCompanies: string[];
  contacts: { created_at: string; contact_type?: string | null; company?: string | null }[];
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

/** Generate a mini sparkline SVG from data points */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (w - padding * 2);
    const y = h - padding - ((v - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
  const areaD = `${pathD} L${w - padding},${h} L${padding},${h} Z`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color.replace(/[^a-z0-9]/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-${color.replace(/[^a-z0-9]/g, '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={Number(points[points.length - 1].split(',')[0])}
        cy={Number(points[points.length - 1].split(',')[1])}
        r="2"
        fill={color}
      />
    </svg>
  );
}

function getWeeklyGrowth(contacts: { created_at: string }[], weeks = 6): number[] {
  const now = new Date();
  const buckets: number[] = Array(weeks).fill(0);

  contacts.forEach(c => {
    const created = new Date(c.created_at);
    const weeksAgo = Math.floor((now.getTime() - created.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksAgo >= 0 && weeksAgo < weeks) {
      buckets[weeks - 1 - weeksAgo]++;
    }
  });

  let running = contacts.filter(c => {
    const weeksAgo = Math.floor((now.getTime() - new Date(c.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return weeksAgo >= weeks;
  }).length;

  return buckets.map(count => {
    running += count;
    return running;
  });
}

function getWeeklyBuckets(
  contacts: { created_at: string; contact_type?: string | null; company?: string | null }[],
  weeks = 6,
  filter?: (c: { created_at: string; contact_type?: string | null; company?: string | null }) => boolean,
): number[] {
  const now = new Date();
  const buckets: number[] = Array(weeks).fill(0);
  contacts.forEach(c => {
    if (filter && !filter(c)) return;
    const weeksAgo = Math.floor((now.getTime() - new Date(c.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksAgo >= 0 && weeksAgo < weeks) {
      buckets[weeks - 1 - weeksAgo]++;
    }
  });
  return buckets;
}

function getTrendPct(data: number[]): number {
  if (data.length < 2) return 0;
  const prev = data[data.length - 2] ?? 0;
  const curr = data[data.length - 1] ?? 0;
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}

export function ContactStatsCards({
  totalCount, contactCountByType, uniqueCompanies, contacts,
}: ContactStatsCardsProps) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const recentCount = contacts.filter(c => new Date(c.created_at) >= thirtyDaysAgo).length;

  const sparkData = useMemo(() => getWeeklyGrowth(contacts), [contacts]);
  const sparkNew = useMemo(() => getWeeklyBuckets(contacts, 6), [contacts]);
  const sparkCompanies = useMemo(() => getWeeklyBuckets(contacts, 6, c => !!c.company), [contacts]);
  const sparkLeads = useMemo(() => getWeeklyBuckets(contacts, 6, c => c.contact_type === 'lead'), [contacts]);

  const growthPct = useMemo(() => {
    if (sparkData.length < 2) return 0;
    const prev = sparkData[sparkData.length - 2] || 1;
    const curr = sparkData[sparkData.length - 1];
    return prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;
  }, [sparkData]);

  const newPct = useMemo(() => getTrendPct(sparkNew), [sparkNew]);
  const companiesPct = useMemo(() => getTrendPct(sparkCompanies), [sparkCompanies]);
  const leadsPct = useMemo(() => getTrendPct(sparkLeads), [sparkLeads]);

  const stats = [
    {
      label: 'Total de Contatos',
      value: totalCount,
      icon: Users,
      color: 'text-primary',
      bg: 'bg-primary/10',
      border: 'border-primary/20',
      sparkColor: 'hsl(var(--primary))',
      sparkData,
      change: growthPct,
    },
    {
      label: 'Novos (30 dias)',
      value: recentCount,
      icon: UserPlus,
      color: 'text-[hsl(142_71%_45%)]',
      bg: 'bg-[hsl(142_71%_45%)]/10',
      border: 'border-[hsl(142_71%_45%)]/20',
      sparkColor: 'hsl(142, 71%, 45%)',
      sparkData: sparkNew,
      change: newPct,
    },
    {
      label: 'Empresas',
      value: uniqueCompanies.length,
      icon: Building,
      color: 'text-[hsl(270_60%_60%)]',
      bg: 'bg-[hsl(270_60%_60%)]/10',
      border: 'border-[hsl(270_60%_60%)]/20',
      sparkColor: 'hsl(270, 60%, 60%)',
      sparkData: sparkCompanies,
      change: companiesPct,
    },
    {
      label: 'Leads',
      value: contactCountByType['lead'] || 0,
      icon: TrendingUp,
      color: 'text-[hsl(38_92%_50%)]',
      bg: 'bg-[hsl(38_92%_50%)]/10',
      border: 'border-[hsl(38_92%_50%)]/20',
      sparkColor: 'hsl(38, 92%, 50%)',
      sparkData: sparkLeads,
      change: leadsPct,
    },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <motion.div
          key={stat.label}
          variants={item}
          className={cn(
            "relative rounded-xl border bg-card p-4 overflow-hidden hover:shadow-sm transition-shadow duration-200",
            stat.border
          )}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold tracking-tight text-foreground">
                  {stat.value.toLocaleString('pt-BR')}
                </p>
                {stat.change !== null && stat.change !== 0 && (
                  <span className={cn(
                    "flex items-center gap-0.5 text-[10px] font-semibold",
                    stat.change > 0 ? 'text-[hsl(142_71%_45%)]' : 'text-destructive'
                  )}>
                    {stat.change > 0
                      ? <TrendingUp className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />
                    }
                    {stat.change > 0 ? '+' : ''}{stat.change}%
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/60">vs. período anterior</p>
            </div>
            <div className={cn("rounded-lg p-2.5", stat.bg)}>
              <stat.icon className={cn("w-5 h-5", stat.color)} />
            </div>
          </div>

          {/* Sparkline */}
          <div className="mt-2">
            <Sparkline data={stat.sparkData} color={stat.sparkColor} />
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
