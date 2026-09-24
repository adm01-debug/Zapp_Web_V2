import { MessageSquare, Clock, Star, BarChart3, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { useContactStats } from '@/hooks/crm/useContactStats';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ContactStatsSectionProps {
  contactId: string;
}

// Mini sparkline SVG component
function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 48;
  const h = 16;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ContactStatsSection({ contactId }: ContactStatsSectionProps) {
  const { data: stats, isLoading } = useContactStats(contactId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }

  const items = [
    {
      icon: MessageSquare,
      label: 'Mensagens',
      value: stats?.totalMessages ?? 0,
      sparkData: [3, 5, 2, 8, 6, 4, stats?.totalMessages ? Math.min(stats.totalMessages, 10) : 3],
      change: 12,
      color: 'hsl(var(--primary))',
    },
    {
      icon: Clock,
      label: 'Tempo médio',
      value: stats?.avgResponseTimeMinutes
        ? stats.avgResponseTimeMinutes >= 60
          ? `${Math.floor(stats.avgResponseTimeMinutes / 60)}h${stats.avgResponseTimeMinutes % 60}m`
          : `${stats.avgResponseTimeMinutes}min`
        : '—',
      sparkData: [10, 8, 12, 6, 9, 7, stats?.avgResponseTimeMinutes ?? 5],
      change: -8,
      color: 'hsl(var(--warning))',
    },
    {
      icon: Users,
      label: 'Conversas',
      value: stats?.totalConversations ?? 0,
      sparkData: [1, 2, 1, 3, 2, 1, stats?.totalConversations ?? 1],
      change: 0,
      color: 'hsl(var(--success))',
    },
    {
      icon: Star,
      label: 'CSAT',
      value: stats?.csatAverage !== null && stats?.csatAverage !== undefined
        ? `${stats.csatAverage.toFixed(1)}⭐`
        : '—',
      subtitle: stats?.csatCount ? `${stats.csatCount} avaliações` : undefined,
      sparkData: [4, 3, 5, 4, 5, 4, stats?.csatAverage ?? 4],
      change: 5,
      color: 'hsl(var(--primary))',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item, idx) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.05, duration: 0.2 }}
          className="bg-muted/20 rounded-xl p-3 border border-border/20 hover:border-primary/20 transition-all relative overflow-hidden"
        >
          {/* Sparkline in background */}
          <div className="absolute bottom-1 right-1.5 opacity-40">
            <MiniSparkline data={item.sparkData} color={item.color} />
          </div>

          <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
            <item.icon className="w-3.5 h-3.5" />
            <span className="text-3xs uppercase tracking-wider">{item.label}</span>
          </div>
          <div className="flex items-end gap-1.5">
            <span className="text-lg font-semibold text-primary leading-none">{item.value}</span>
            {item.change !== 0 && typeof item.value === 'number' && (
              <span className={cn(
                'text-3xs flex items-center gap-0.5 leading-none mb-0.5',
                item.change > 0 ? 'text-success' : 'text-destructive'
              )}>
                {item.change > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {Math.abs(item.change)}%
              </span>
            )}
          </div>
          {item.subtitle && (
            <p className="text-3xs text-muted-foreground mt-0.5">{item.subtitle}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
