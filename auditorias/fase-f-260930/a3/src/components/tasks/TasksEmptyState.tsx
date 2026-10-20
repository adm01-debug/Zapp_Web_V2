import { CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  variant: 'all' | 'filter' | 'column';
  onClearFilter?: () => void;
  onAddTask?: () => void;
  columnLabel?: string;
  /** Etapa 53: política da coluna (Quadro) exibida quando ela está vazia. */
  policy?: string;
}

export function TasksEmptyState({ variant, onClearFilter, onAddTask, columnLabel, policy }: Props) {
  if (variant === 'filter') {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma tarefa com esse filtro</p>
        <Button variant="ghost" size="sm" onClick={onClearFilter}>Limpar filtros</Button>
      </div>
    );
  }
  if (variant === 'column') {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <p className="text-xs text-muted-foreground/60 italic">Coluna vazia</p>
        {policy && <p className="text-xs text-muted-foreground/70">{policy}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-kpi-blue text-kpi-blue-fg">
        <CheckSquare className="h-8 w-8" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">Nada por aqui</p>
        <p className="text-sm text-muted-foreground">Adicione a primeira tarefa acima.</p>
        <p className="text-xs text-muted-foreground/60">Atalho: <kbd className="rounded bg-muted px-1 py-0.5 text-3xs font-mono">N</kbd></p>
      </div>
      {onAddTask && (
        <Button size="sm" onClick={onAddTask} className="bg-success hover:bg-success/90 text-white">
          Nova tarefa
        </Button>
      )}
    </div>
  );
}
