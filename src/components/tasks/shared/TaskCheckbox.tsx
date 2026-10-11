import { Check } from 'lucide-react';

interface Props {
  /** Estado da tarefa: marcado = concluída. */
  done: boolean;
  onToggle?: () => void;
  disabled?: boolean;
  /** Nome acessível. Padrão: "Concluir tarefa" / "Reabrir tarefa" (o mesmo que o card já usava). */
  label?: string;
  className?: string;
}

/**
 * Etapa 069 (D16) — o checkbox CIRCULAR do módulo de Tarefas.
 *
 * As imagens de referência divergiam (quadrado arredondado numa, círculo na
 * outra); vale o CÍRCULO, que casa com o resto do produto. Uma implementação
 * só, para Lista, Quadro, Agenda, painel e modal — quem quiser o antigo
 * `rounded-[4px]` do `WorkItemCard` deixa de ter motivo para recriá-lo.
 *
 * É um `<button>` nativo de propósito: Enter/Espaço, foco e o anel de foco
 * visível vêm do navegador, sem `tabIndex`/`onKeyDown` à mão. O clique não
 * sobe para o card (`stopPropagation`), então marcar não abre o painel.
 */
export function TaskCheckbox({ done, onToggle, disabled = false, label, className = '' }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={label ?? (done ? 'Reabrir tarefa' : 'Concluir tarefa')}
      data-testid="task-checkbox"
      data-state={done ? 'checked' : 'unchecked'}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onToggle?.();
      }}
      className={[
        'h-[18px] w-[18px] shrink-0 rounded-full border-2 flex items-center justify-center transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        disabled
          ? 'cursor-not-allowed border-border/50 opacity-50'
          : done
            ? 'border-primary bg-primary hover:border-primary'
            : 'border-border hover:border-primary',
        className,
      ].join(' ')}
    >
      {done && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} aria-hidden />}
    </button>
  );
}
