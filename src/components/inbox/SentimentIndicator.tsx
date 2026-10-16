import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Smile, Meh, Frown, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { sentimentLevel, type SentimentLevel } from '@/lib/sentiment-level';

export type { SentimentLevel };

interface SentimentIndicatorProps {
  /** Valor CRU do banco (pt-BR canônico ou legado EN); desconhecido cai em neutro. */
  sentiment: SentimentLevel | string | null | undefined;
  score?: number; // 0-100
  compact?: boolean;
  showLabel?: boolean;
  animated?: boolean;
}

const sentimentConfig: Record<SentimentLevel, {
  icon: typeof Smile;
  color: string;
  bgColor: string;
  label: string;
  emoji: string;
}> = {
  positive: {
    icon: Smile,
    color: 'text-success',
    bgColor: 'bg-success/10',
    label: 'Positivo',
    emoji: '😊',
  },
  neutral: {
    icon: Meh,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/30',
    label: 'Neutro',
    emoji: '😐',
  },
  negative: {
    icon: Frown,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    label: 'Negativo',
    emoji: '😟',
  },
  critical: {
    icon: AlertTriangle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    label: 'Crítico',
    emoji: '😠',
  },
};

export function getSentimentFromScore(score: number): SentimentLevel {
  if (score >= 70) return 'positive';
  if (score >= 45) return 'neutral';
  if (score >= 25) return 'negative';
  return 'critical';
}

export function SentimentIndicator({
  sentiment,
  score,
  compact = false,
  showLabel = false,
  animated = true,
}: SentimentIndicatorProps) {
  // Traduz o valor cru (pt-BR ou legado EN) no nível da UI; desconhecido não
  // some com o componente nem indexa `sentimentConfig` indefinido.
  const level = sentimentLevel(sentiment) ?? 'neutral';
  const config = sentimentConfig[level];
  const Icon = config.icon;

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div
              initial={animated ? { scale: 0 } : false}
              animate={{ scale: 1 }}
              whileHover={{ scale: 1.1 }}
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center cursor-help",
                config.bgColor
              )}
            >
              <span className="text-xs">{config.emoji}</span>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <div className="flex items-center gap-1.5">
              <Icon className={cn("w-3 h-3", config.color)} />
              <span>Sentimento: {config.label}</span>
              {score !== undefined && (
                <span className="text-muted-foreground">({score}%)</span>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <motion.div
      initial={animated ? { opacity: 0, x: -10 } : false}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-full",
        config.bgColor
      )}
    >
      <motion.div
        animate={level === 'critical' ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.5, repeat: level === 'critical' ? Infinity : 0 }}
      >
        <Icon className={cn("w-3.5 h-3.5", config.color)} />
      </motion.div>
      
      {showLabel && (
        <span className={cn("text-xs font-medium", config.color)}>
          {config.label}
        </span>
      )}
      
      {score !== undefined && (
        <span className="text-xs text-muted-foreground">
          {score}%
        </span>
      )}
    </motion.div>
  );
}

// Compact emoji-only indicator for list views
export const SentimentEmoji = forwardRef<
  HTMLSpanElement,
  { sentiment: SentimentLevel | string | null | undefined; animated?: boolean; className?: string }
>(({ sentiment, animated = true, className }, ref) => {
  const level = sentimentLevel(sentiment) ?? 'neutral';
  const config = sentimentConfig[level];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.span
            ref={ref}
            initial={animated ? { scale: 0, rotate: -180 } : false}
            animate={{ scale: 1, rotate: 0 }}
            whileHover={{ scale: 1.2 }}
            transition={{ type: 'spring', stiffness: 300 }}
            className={cn(
              'text-sm cursor-help',
              level === 'critical' && 'motion-safe:animate-pulse',
              className
            )}
          >
            {config.emoji}
          </motion.span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Sentimento: {config.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
SentimentEmoji.displayName = 'SentimentEmoji';

// Bar indicator showing sentiment distribution
export function SentimentBar({ score }: { score: number }) {
  const sentiment = getSentimentFromScore(score);
  const config = sentimentConfig[sentiment];

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={cn(
            "h-full rounded-full",
            score >= 70 && "bg-success",
            score >= 45 && score < 70 && "bg-muted-foreground",
            score >= 25 && score < 45 && "bg-warning",
            score < 25 && "bg-destructive"
          )}
        />
      </div>
      <span className={cn("text-xs font-medium w-8", config.color)}>
        {score}%
      </span>
    </div>
  );
}
