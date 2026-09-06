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
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 72;
  const h = 36;
  const padding = 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (w - padding * 2);
    const y = h - padding - ((v - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ');
  const areaD = `${pathD} L${w - padding},${h} L${padding},${h} Z`;
  const gradId = `sg-${color.replace(/[^a-z0-9]/g, '')}`;

  return (
    <svg width={w} height={h} className="overflow-visible shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={Number(points[points.length - 1].split(',')[0])}
        cy={Number(points[points.length - 1].split(',')[1])}
        r="2.5"
        fill={color}
      />
    </svg>
  );
}

function getWeeklyGrowth(contacts: { created_at: string }[], weeks = 6): number[] {
  const now = new Date();
  const buckets: number[] = Array(weeks).fill(0);
  contacts.forEach(c => {
    const weeksAgo = Math.floor((now.getTime() - new Date(c.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (weeksAgo >= 0 && weeksAgo < weeks) buckets[weeks - 1 - weeksAgo]++;
  });
  let running = contacts.filter(c => {
    const weeksAgo = Math.floor((now.getTime() - new Date(c.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return weeksAgo >= weeks;
  }).length;
  return buckets.map(count => { running += count; return running; });
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
    if (weeksAgo >= 0 && weeksAgo < weeks) buckets[weeks - 1 - weeksAgo]++;
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
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
      sparkColor: '#3b82f6',
      sparkData,
      change: growthPct,
    },
    {
      label: 'Novos (30 dias)',
      value: recentCount,
      icon: UserPlus,
      gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
      sparkColor: '#22c55e',
      sparkData: sparkNew,
      change: newPct,
    },
    {
      label: 'Empresas',
      value: uniqueCompanies.length,
      icon: Building,
      gradient: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
      sparkColor: '#a855f7',
      sparkData: sparkCompanies,
      change: companiesPct,
    },
    {
      label: 'Leads',
      value: contactCountByType['lead'] || 0,
      icon: TrendingUp,
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      sparkColor: '#f59e0b',
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
          className="relative rounded-xl border border-border/40 bg-card p-4 overflow-hidden hover:shadow-md transition-shadow duration-200"
        >
          <div className="flex items-center gap-3">
            {/* Gradient icon box — LEFT */}
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: stat.gradient }}
            >
              <stat.icon className="w-5 h-5 text-white" />
            </div>

            {/* Data — CENTER */}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground truncate">{stat.label}</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <p className="text-2xl font-bold tracking-tight text-foreground leading-none">
                  {stat.value.toLocaleString('pt-BR')}
                </p>
                {stat.change !== 0 && (
                  <span className={cn(
                    "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    stat.change > 0
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'bg-red-500/10 text-red-500'
                  )}>
                    {stat.change > 0
                      ? <TrendingUp className="w-2.5 h-2.5" />
                      : <TrendingDown className="w-2.5 h-2.5" />
                    }
                    {stat.change > 0 ? '+' : ''}{stat.change}%
                  </span>
                )}
              </div>
            </div>

            {/* Sparkline — RIGHT */}
            <Sparkline data={stat.sparkData} color={stat.sparkColor} />
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
