import type { ReactNode } from 'react';
import { SectionCard } from './SectionCard';
import type { LucideIcon } from 'lucide-react';

interface TaskColumnProps {
  icon: LucideIcon;
  title: string;
  count: number;
  subtitle: string;
  emptyLabel: string;
  children: ReactNode;
}

/** Coluna de tarefas (Hoje/Próximas/Concluídas recentes) — SectionCard com subtitle + lista de TaskCard. */
export function TaskColumn({ icon, title, count, subtitle, emptyLabel, children }: TaskColumnProps) {
  const isEmpty = count === 0;
  return (
    <SectionCard icon={icon} title={title} count={count} subtitle={subtitle} className="gap-2">
      <div className="flex flex-col gap-2">
        {isEmpty ? <p className="text-[13px] text-muted-foreground py-2">{emptyLabel}</p> : children}
      </div>
    </SectionCard>
  );
}
