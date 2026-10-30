/**
 * CV-093 — Alerta de velocidade de resposta (Speed-to-Lead).
 *
 * Exibe um alerta crescente quando o vendedor demora mais do que o limiar
 * configurado para responder ao cliente. Pesquisas mostram que responder
 * em menos de 5 minutos aumenta significativamente a taxa de conversão.
 */
import { useEffect, useState } from 'react';
import { Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AlertLevel = 'ok' | 'warning' | 'critical';

export interface SpeedToLeadAlertProps {
  /** Timestamp da última mensagem do cliente (em ms). */
  lastClientMessageAt: number | null;
  /** Limite de aviso em segundos (padrão: 120 = 2 min). */
  warningThresholdSeconds?: number;
  /** Limite crítico em segundos (padrão: 300 = 5 min). */
  criticalThresholdSeconds?: number;
  /** Callback disparado ao atingir o nível crítico (ex: notificar supervisor). */
  onCritical?: (elapsedSeconds: number) => void;
  className?: string;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
}

export function SpeedToLeadAlert({
  lastClientMessageAt,
  warningThresholdSeconds = 120,
  criticalThresholdSeconds = 300,
  onCritical,
  className,
}: SpeedToLeadAlertProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!lastClientMessageAt) return;
    const tick = () => {
      setElapsed(Math.floor((Date.now() - lastClientMessageAt) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastClientMessageAt]);

  useEffect(() => {
    if (elapsed >= criticalThresholdSeconds) {
      onCritical?.(elapsed);
    }
  }, [elapsed >= criticalThresholdSeconds, criticalThresholdSeconds, onCritical]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lastClientMessageAt || elapsed < warningThresholdSeconds) return null;

  const level: AlertLevel = elapsed >= criticalThresholdSeconds ? 'critical' : 'warning';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium',
        level === 'warning' && 'bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800/50',
        level === 'critical' && 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800/50 animate-pulse',
        className,
      )}
    >
      {level === 'critical' ? (
        <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden />
      ) : (
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden />
      )}
      <span>
        {level === 'critical'
          ? `Sem resposta há ${formatElapsed(elapsed)} — risco de perder o lead!`
          : `Responda em breve — ${formatElapsed(elapsed)} sem retorno.`}
      </span>
    </div>
  );
}
