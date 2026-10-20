import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProtectionGaugeProps {
  /** Campanhas iniciadas que respeitam a lista de supressão; `null` quando a RPC não respondeu. */
  protectedCount: number | null;
  /** Total de campanhas iniciadas — denominador do anel; `null` quando a RPC não respondeu. */
  totalStarted: number | null;
  className?: string;
}

const GAUGE_RADIUS = 34;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

/**
 * X179 — medidor do "Centro de proteção": anel SVG com o escudo ao centro,
 * preenchido na fração de campanhas iniciadas que respeitam a lista de
 * supressão (protegidas ÷ campanhas iniciadas, de `talkx_suppression_stats`).
 * Sem campanha iniciada o anel fica vazio — o número ao lado é que diz o resto.
 *
 * Sem resposta da RPC (`protectedCount` ou `totalStarted` nulos: carregamento,
 * erro ou `data: null`) o medidor recebe o estado SEM DADOS: anel vazio e rótulo
 * próprio, em vez de anunciar "0 de 0 campanhas iniciadas" — fração que a tela
 * estaria inventando a partir de uma resposta que não chegou (TL-166).
 */
export function ProtectionGauge({ protectedCount, totalStarted, className }: ProtectionGaugeProps) {
  const pct = protectedCount !== null && totalStarted !== null && totalStarted > 0
    ? Math.max(0, Math.min(100, Math.round((protectedCount / totalStarted) * 100)))
    : 0;
  const filled = (pct / 100) * GAUGE_CIRCUMFERENCE;
  const ariaLabel = protectedCount === null || totalStarted === null
    ? 'Sem dados de campanhas iniciadas'
    : totalStarted === 0
      ? 'Nenhuma campanha iniciada no período'
      : `${protectedCount} de ${totalStarted} campanhas iniciadas protegidas pela lista`;

  return (
    <div
      data-testid="protection-gauge"
      role="img"
      aria-label={ariaLabel}
      className={cn('relative w-24 h-24 mx-auto', className)}
    >
      <svg viewBox="0 0 80 80" className="w-24 h-24 -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={GAUGE_RADIUS} fill="none" strokeWidth="6" className="stroke-border/70" />
        <circle
          cx="40" cy="40" r={GAUGE_RADIUS} fill="none" strokeWidth="6" strokeLinecap="round"
          className="stroke-dash-green motion-safe:transition-all motion-safe:duration-700"
          strokeDasharray={`${filled} ${GAUGE_CIRCUMFERENCE}`}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <ShieldCheck className="w-6 h-6 text-dash-green" />
      </div>
    </div>
  );
}
