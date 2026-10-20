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
 * ALVO DE TOQUE (regra de tela: pelo menos 40 px): o `<button>` é o alvo e mede
 * 40x40 (`h-10 w-10`); o círculo de 18 px é só o DESENHO, um `<span>`
 * `aria-hidden` dentro dele. As margens negativas de 11 px tiram do layout a
 * diferença entre o alvo e o desenho, então a área ocupada continua a mesma de
 * antes (18 px) e nada estoura.
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
        'group relative -m-[11px] inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        data-testid="task-checkbox-circle"
        className={[
          'flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-colors',
          disabled
            ? 'border-border/50 opacity-50'
            : done
              ? 'border-primary bg-primary'
              : 'border-border group-hover:border-primary',
        ].join(' ')}
      >
        {done && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} aria-hidden />}
      </span>
    </button>
  );
}
