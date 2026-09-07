import { TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';

interface DashboardHeaderProps {
  filters: ReactNode;
}

export function DashboardHeader({ filters }: DashboardHeaderProps) {
  return (
    <div
      data-testid="dash-header"
      className="min-h-[70px] h-auto xl:h-[70px] rounded-xl bg-card border border-border/70 px-3 py-2 xl:py-0 flex flex-col xl:flex-row xl:items-center gap-3"
    >
      <div className="flex items-center gap-3">
        <div
          data-testid="header-tile"
          className="w-10 h-10 rounded-[10px] bg-[hsl(220_74%_21%)] flex items-center justify-center shrink-0"
        >
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] leading-none text-foreground">Dashboard</h1>
          <p className="text-[13px] text-foreground-secondary mt-1">Visão geral do atendimento em tempo real</p>
        </div>
      </div>
      <div className="xl:ml-auto">{filters}</div>
    </div>
  );
}
