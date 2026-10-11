import { Calendar } from 'lucide-react';
import { formatWorkItemDate, type WorkItemDateFormat } from '@/hooks/tasks/workItemFormat';

interface Props {
  value: string | Date | null | undefined;
  /** `datetime` = dia + hora; `day` = só o dia (as concluídas usam este). */
  format?: WorkItemDateFormat;
  /** "Agora" para as contas de Hoje/Ontem/Amanhã (testes passam uma data fixa). */
  now?: Date;
  /** Prazo já vencido: pinta com o par de TEXTO destrutivo. */
  overdue?: boolean;
  showIcon?: boolean;
  /** O que mostrar quando não há data. */
  emptyLabel?: string;
  className?: string;
}

/**
 * Etapa 069 (D21) — data do módulo de Tarefas, por UMA regra só.
 *
 * Não formata nada por conta própria: delega ao `workItemFormat.ts`, a regra
 * única de datas (fuso local, "Hoje/Ontem/Amanhã", mês curto pt-BR). Assim a
 * Lista, o Quadro, a Agenda, o painel e o modal nunca divergem do rótulo.
 */
export function DateLabel({
  value,
  format = 'datetime',
  now,
  overdue = false,
  showIcon = true,
  emptyLabel = 'Sem prazo',
  className = '',
}: Props) {
  const texto = formatWorkItemDate(value, { now, format });
  const icone = showIcon ? <Calendar className="h-3 w-3" aria-hidden /> : null;

  if (texto === null) {
    return (
      <span
        data-testid="date-label"
        data-empty="true"
        className={`inline-flex items-center gap-1 text-xs font-medium text-muted-foreground ${className}`}
      >
        {icone}
        {emptyLabel}
      </span>
    );
  }

  const cor = overdue
    ? 'text-[hsl(var(--destructive-text))]'
    : texto.startsWith('Hoje')
      ? 'text-[hsl(var(--warning-text))]'
      : 'text-muted-foreground';

  return (
    <span
      data-testid="date-label"
      title={texto}
      className={`inline-flex items-center gap-1 text-xs font-medium ${cor} ${className}`}
    >
      {icone}
      {texto}
    </span>
  );
}
