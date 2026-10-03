import { MessageSquare, Clock, Star, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { useContactStats } from '@/hooks/crm/useContactStats';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

interface ContactStatsStripProps {
  contactId: string;
  /** Versão estreita (sidebar do contato ~323px): mantém 2 colunas em qualquer viewport. */
  compact?: boolean;
}

function formatAvgResponse(minutes: number | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`;
}

function ChangeBadge({ percent }: { percent: number }) {
  const Icon = percent >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      data-testid="stats-change-badge"
      className={`text-3xs font-medium ml-1.5 ${percent >= 0 ? 'text-success' : 'text-destructive'}`}
    >
      <Icon className="w-3 h-3 inline-block mr-0.5 -mt-px" />
      {Math.abs(percent)}%
    </span>
  );
}

export function ContactStatsStrip({ contactId, compact }: ContactStatsStripProps) {
  const { data: stats, isLoading } = useContactStats(contactId);
  const gridClass = compact ? 'grid-cols-2' : 'grid-cols-2 xl:grid-cols-4';

  if (isLoading) {
    return (
      <div data-testid="contact-stats-strip" className={`grid ${gridClass} gap-2`}>
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
      subtitle: 'Total trocado',
      change: stats?.messagesChangePercent,
    },
    {
      icon: Clock,
      label: 'Tempo médio',
      value: formatAvgResponse(stats?.avgResponseTimeMinutes),
      subtitle: 'Resposta ao cliente',
      change: undefined,
    },
    {
      icon: Users,
      label: 'Atendimentos',
      value: stats?.totalConversations ?? 0,
      subtitle: 'Episódios respondidos',
      change: stats?.conversationsChangePercent,
    },
    {
      icon: Star,
      label: 'CSAT',
      value: stats?.csatAverage !== null && stats?.csatAverage !== undefined
        ? `${stats.csatAverage.toFixed(1)}⭐`
        : '—',
      subtitle: stats?.csatCount ? `${stats.csatCount} avaliações` : 'Sem avaliações',
      change: undefined,
    },
  ];

  return (
    <div data-testid="contact-stats-strip" className={`grid ${gridClass} gap-2`}>
      {items.map((item, idx) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.05, duration: 0.2 }}
          className="bg-muted/20 rounded-xl p-3 border border-border/20 hover:border-primary/20 transition-all"
        >
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
            <item.icon className="w-3.5 h-3.5" />
            <span className="text-3xs uppercase tracking-wider">{item.label}</span>
          </div>
          <span className="text-lg font-semibold text-primary leading-none">{item.value}</span>
          {item.change !== null && item.change !== undefined && <ChangeBadge percent={item.change} />}
          <p className="text-3xs text-muted-foreground mt-0.5">{item.subtitle}</p>
        </motion.div>
      ))}
    </div>
  );
}
