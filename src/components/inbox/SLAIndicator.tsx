import { cn } from '@/lib/utils';
import { Clock, AlertTriangle, CheckCircle, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSLACalculation, formatTimeRemaining, SLAStatus } from '@/hooks/sla/useSLACalculation';

interface SLAIndicatorProps {
  firstMessageAt: Date;
  firstResponseAt?: Date | null;
  firstResponseMinutes: number;
  className?: string;
  compact?: boolean;
}

const statusStyles: Record<SLAStatus, { bg: string; text: string; border: string; icon: React.ElementType; ring: string }> = {
  ok: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30', icon: CheckCircle, ring: 'stroke-success' },
  warning: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30', icon: Clock, ring: 'stroke-warning' },
  breached: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30', icon: AlertTriangle, ring: 'stroke-destructive' },
};

function SLAProgressRing({ status, percent, size = 28 }: { status: SLAStatus; percent: number; size?: number }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" strokeWidth={strokeWidth}
        className="stroke-muted/30"
      />
      <motion.circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
        className={statusStyles[status].ring}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        strokeDasharray={circumference}
      />
    </svg>
  );
}

function getPercent(remainingMs: number, totalMs: number, breached: boolean): number {
  if (breached) return 0;
  return Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
}

export function SLAIndicator({
  firstMessageAt,
  firstResponseAt,
  firstResponseMinutes,
  className,
  compact = false,
}: SLAIndicatorProps) {
  const sla = useSLACalculation({ firstMessageAt, firstResponseAt, firstResponseMinutes });

  if (firstResponseAt && sla.firstResponse.status === 'ok') return null;

  const style = statusStyles[sla.firstResponse.status];
  const Icon = style.icon;

  const frTotalMs = firstResponseMinutes * 60_000;

  if (compact) {
    const frPercent = getPercent(sla.firstResponse.remainingMs, frTotalMs, sla.firstResponse.breached);

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div
              role="status"
              aria-label={`SLA ${sla.firstResponse.status === 'breached' ? 'violado' : sla.firstResponse.status === 'warning' ? 'em alerta' : 'dentro do prazo'}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className={cn(
                'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border',
                style.bg, style.text, style.border,
                sla.firstResponse.status === 'breached' && 'animate-pulse',
                className
              )}
            >
              <SLAProgressRing status={sla.firstResponse.status} percent={frPercent} size={16} />
              {!firstResponseAt && sla.firstResponse.remainingMs > 0 && (
                <span>{formatTimeRemaining(sla.firstResponse.remainingMs)}</span>
              )}
              {sla.firstResponse.breached && <span>SLA</span>}
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Timer className="w-3 h-3" />
                <span className="font-medium">Primeira Resposta:</span>
                {firstResponseAt ? (
                  <span className={sla.firstResponse.breached ? 'text-destructive' : 'text-success'}>
                    {sla.firstResponse.breached ? 'Violado' : 'OK'}
                  </span>
                ) : (
                  <span className={statusStyles[sla.firstResponse.status].text}>
                    {sla.firstResponse.status === 'breached' ? 'Violado' : formatTimeRemaining(sla.firstResponse.remainingMs)}
                  </span>
                )}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div role="status" aria-label="Indicador de SLA de primeira resposta" className={cn('flex items-center gap-2', className)}>
      <Icon className={cn('w-3.5 h-3.5 hidden', style.text)} />
      {!firstResponseAt ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border',
            statusStyles[sla.firstResponse.status].bg,
            statusStyles[sla.firstResponse.status].text,
            statusStyles[sla.firstResponse.status].border,
            sla.firstResponse.status === 'breached' && 'animate-pulse'
          )}
        >
          <SLAProgressRing
            status={sla.firstResponse.status}
            percent={getPercent(sla.firstResponse.remainingMs, frTotalMs, sla.firstResponse.breached)}
            size={22}
          />
          <span>1ª Resp:</span>
          <span className="font-bold">
            {sla.firstResponse.status === 'breached' ? 'Violado' : formatTimeRemaining(sla.firstResponse.remainingMs)}
          </span>
        </motion.div>
      ) : sla.firstResponse.breached ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border animate-pulse',
            statusStyles.breached.bg,
            statusStyles.breached.text,
            statusStyles.breached.border
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>1ª Resp: Violado</span>
        </motion.div>
      ) : null}
    </div>
  );
}
