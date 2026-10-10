import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CallKpiCardProps {
  rotulo: string;
  valor: ReactNode;
  carregando?: boolean;
  dica?: string;
  /** Acento de atenção para o KPI que exige ação (ex.: "Perdidas"). Sem ele os
   * 5 tiles ficam idênticos e o número ruim se perde na fileira. */
  alerta?: boolean;
}

/**
 * T38 — um tile de KPI da tela de Telefonia.
 *
 * Altura FIXA de 78px (aceite: 78 +-4). Fixa de proposito: com o valor variando de "0"
 * a "1.234" o grid inteiro pularia a cada atualizacao se a altura fosse automatica.
 * Os data-testid sao os do plano: tel-kpi-card, tel-kpi-tile e tel-kpi-value.
 *
 * T75: o tile entra com fade de 150 ms. Sob `prefers-reduced-motion` a entrada e
 * pulada (`initial={false}`) e a transicao tem duracao 0 — o numero aparece no
 * primeiro paint, sem movimento.
 */
export function CallKpiCard({ rotulo, valor, carregando = false, dica, alerta = false }: CallKpiCardProps) {
  const reduzirMovimento = useReducedMotion();

  return (
    <motion.div
      data-testid="tel-kpi-card"
      data-tom={alerta ? 'alerta' : undefined}
      className={cn(
        'relative h-[78px] rounded-lg border bg-card px-3 py-2 flex flex-col justify-between min-w-0',
        alerta ? 'border-destructive/50' : 'border-border',
      )}
      initial={reduzirMovimento ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduzirMovimento ? 0 : 0.15 }}
    >
      <span
        className="text-3xs uppercase tracking-wide text-muted-foreground truncate"
        title={dica ?? rotulo}
      >
        {rotulo}
      </span>
      <div data-testid="tel-kpi-tile" className="flex items-baseline gap-1 min-w-0">
        <span data-testid="tel-kpi-value" className="text-xl font-semibold text-foreground truncate">
          {carregando ? '\u2014' : valor}
        </span>
      </div>
      {alerta && (
        <div
          data-testid="tel-kpi-accent"
          aria-hidden="true"
          className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-destructive"
        />
      )}
    </motion.div>
  );
}
