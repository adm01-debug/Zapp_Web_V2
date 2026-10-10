import type { ReactNode } from 'react';

interface CallKpiCardProps {
  rotulo: string;
  valor: ReactNode;
  carregando?: boolean;
  dica?: string;
}

/**
 * T38 — um tile de KPI da tela de Telefonia.
 *
 * Altura FIXA de 78px (aceite: 78 +-4). Fixa de proposito: com o valor variando de "0"
 * a "1.234" o grid inteiro pularia a cada atualizacao se a altura fosse automatica.
 * Os data-testid sao os do plano: tel-kpi-card, tel-kpi-tile e tel-kpi-value.
 */
export function CallKpiCard({ rotulo, valor, carregando = false, dica }: CallKpiCardProps) {
  return (
    <div
      data-testid="tel-kpi-card"
      className="h-[78px] rounded-lg border border-border bg-card px-3 py-2 flex flex-col justify-between min-w-0"
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
    </div>
  );
}
