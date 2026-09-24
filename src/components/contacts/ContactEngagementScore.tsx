import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ContactEngagementScoreProps {
  messageCount: number;
  lastMessageAt?: string | null;
  createdAt: string;
  size?: 'sm' | 'md';
}

function calculateEngagement(messageCount: number, lastMessageAt?: string | null, createdAt?: string): {
  score: number;
  level: 'hot' | 'warm' | 'cold' | 'frozen';
  label: string;
  color: string;
  bgColor: string;
} {
  const now = Date.now();
  const lastMsg = lastMessageAt ? new Date(lastMessageAt).getTime() : 0;
  const created = createdAt ? new Date(createdAt).getTime() : now;
  
  // Recency factor (0-40 points)
  const daysSinceLastMsg = lastMsg ? (now - lastMsg) / (1000 * 60 * 60 * 24) : 999;
  const recencyScore = daysSinceLastMsg <= 1 ? 40
    : daysSinceLastMsg <= 3 ? 30
    : daysSinceLastMsg <= 7 ? 20
    : daysSinceLastMsg <= 30 ? 10
    : 0;

  // Frequency factor (0-40 points)
  const accountAgeDays = Math.max(1, (now - created) / (1000 * 60 * 60 * 24));
  const msgsPerDay = messageCount / accountAgeDays;
  const frequencyScore = msgsPerDay >= 5 ? 40
    : msgsPerDay >= 2 ? 30
    : msgsPerDay >= 0.5 ? 20
    : msgsPerDay >= 0.1 ? 10
    : 0;

  // Volume factor (0-20 points)
  const volumeScore = messageCount >= 100 ? 20
    : messageCount >= 50 ? 15
    : messageCount >= 20 ? 10
    : messageCount >= 5 ? 5
    : 0;

  const total = Math.min(100, recencyScore + frequencyScore + volumeScore);

  if (total >= 70) return { score: total, level: 'hot', label: 'Muito Ativo', color: 'text-[hsl(25_95%_53%)]', bgColor: 'bg-[hsl(25_95%_53%)]' };
  if (total >= 40) return { score: total, level: 'warm', label: 'Ativo', color: 'text-[hsl(45_93%_47%)]', bgColor: 'bg-[hsl(45_93%_47%)]' };
  if (total >= 15) return { score: total, level: 'cold', label: 'Baixo', color: 'text-[hsl(210_40%_60%)]', bgColor: 'bg-[hsl(210_40%_60%)]' };
  return { score: total, level: 'frozen', label: 'Inativo', color: 'text-muted-foreground/50', bgColor: 'bg-muted-foreground/30' };
}

export function ContactEngagementScore({
  messageCount, lastMessageAt, createdAt, size = 'sm',
}: ContactEngagementScoreProps) {
  const engagement = useMemo(
    () => calculateEngagement(messageCount, lastMessageAt, createdAt),
    [messageCount, lastMessageAt, createdAt]
  );

  const TrendIcon = engagement.level === 'hot' ? TrendingUp
    : engagement.level === 'warm' ? TrendingUp
    : engagement.level === 'cold' ? Minus
    : TrendingDown;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          'flex items-center gap-1.5 cursor-default',
          size === 'sm' ? 'text-xs' : 'text-sm',
        )}>
          <div className="relative">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={cn(
                'rounded-full flex items-center justify-center',
                size === 'sm' ? 'w-6 h-6' : 'w-8 h-8',
                engagement.level === 'hot' && 'bg-[hsl(25_95%_53%)]/15',
                engagement.level === 'warm' && 'bg-[hsl(45_93%_47%)]/15',
                engagement.level === 'cold' && 'bg-[hsl(210_40%_60%)]/15',
                engagement.level === 'frozen' && 'bg-muted/30',
              )}
            >
              <Zap className={cn(
                engagement.color,
                size === 'sm' ? 'w-3 h-3' : 'w-4 h-4',
              )} />
            </motion.div>
            {engagement.level === 'hot' && (
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-[hsl(25_95%_53%)]/10"
              />
            )}
          </div>
          <div className="flex flex-col">
            <span className={cn('font-bold leading-none', engagement.color)}>
              {engagement.score}
            </span>
            {size === 'md' && (
              <span className="text-3xs text-muted-foreground leading-tight">
                {engagement.label}
              </span>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <TrendIcon className={cn('w-3.5 h-3.5', engagement.color)} />
            <span className="font-semibold">{engagement.label}</span>
            <span className="text-muted-foreground">({engagement.score}/100)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {messageCount} mensagens · {lastMessageAt ? `Última: ${new Date(lastMessageAt).toLocaleDateString('pt-BR')}` : 'Sem mensagens'}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export { calculateEngagement };
