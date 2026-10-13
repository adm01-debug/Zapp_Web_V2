import type { Priority } from '@/hooks/tasks/workItem.types';
// Os rótulos vêm do `.ts` de labels — nunca do `PriorityChip.tsx` (exportar
// constante de arquivo de componente conta dívida nova no react-refresh).
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';

/**
 * Um par de cor por prioridade (D12). A pílula tem SEMPRE a cor da prioridade —
 * `--primary` é do SEGMENTO escolhido do controle (`PrioritySegment`), nunca da
 * pílula. A escada é cinza → âmbar → vermelho (contorno) → vermelho (tinta e
 * borda cheias), o mesmo desenho do `PriorityChip`.
 *
 * Os valores `medium`/`high`/`urgent` usam os tokens de TEXTO
 * (`--warning-text`/`--destructive-text`): a cor crua é de PREENCHIMENTO e como
 * texto ficava em ~2:1 (etapa 80 / E.3).
 */
const PRIORITY_STYLES: Record<Priority, string> = {
  low:    'bg-muted/60 text-muted-foreground border-border/40',
  medium: 'bg-warning/15 text-[hsl(var(--warning-text))] border-warning/40',
  high:   'bg-destructive/15 text-[hsl(var(--destructive-text))] border-destructive/40',
  urgent: 'bg-destructive/20 text-[hsl(var(--destructive-text))] border-destructive',
};

interface Props {
  priority: Priority | null | undefined;
  /** Só a inicial — para a linha da Agenda. O nome acessível continua completo. */
  compact?: boolean;
  className?: string;
}

/**
 * Etapa 069 (D12) — pílula de prioridade do módulo de Tarefas.
 *
 * Prioridade nula ou fora do mapa cai no padrão do banco (`medium`) em vez de
 * derrubar o card ou imprimir "undefined".
 *
 * No modo compacto o `<span>` mostra só a inicial, então o nome completo vai
 * pelo `aria-label` com `role="img"`: `aria-label` em elemento genérico (sem
 * papel) é IGNORADO por leitores de tela — com o papel de imagem, "Média" vira
 * o nome acessível.
 */
export function PriorityPill({ priority, compact = false, className = '' }: Props) {
  const p: Priority = priority != null && PRIORITY_LABELS[priority] ? priority : 'medium';
  const texto = PRIORITY_LABELS[p];

  return (
    <span
      data-testid="priority-pill"
      data-priority={p}
      title={`Prioridade: ${texto}`}
      {...(compact ? { role: 'img', 'aria-label': texto } : {})}
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-2xs font-semibold leading-none ${PRIORITY_STYLES[p]} ${className}`}
    >
      {compact ? texto[0] : texto}
    </span>
  );
}
