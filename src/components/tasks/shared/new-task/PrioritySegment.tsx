import { useRef, type KeyboardEvent } from 'react';
import type { Priority } from '@/hooks/tasks/workItem.types';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';

/** Ordem visual do controle (da menor para a maior prioridade). */
const ORDEM: Priority[] = ['low', 'medium', 'high', 'urgent'];

/**
 * D12 (etapa 170): a cor da prioridade no TEXTO de cada segmento NÃO escolhido —
 * os MESMOS tokens do `PriorityPill`/`PriorityChip` (âmbâr na Média, vermelho na
 * Alta/Urgente, cinza na Baixa). O `primary` azul fica reservado à opção
 * ESCOLHIDA, para "escolhido" e "prioridade" não serem a mesma cor.
 */
const COR_DA_PRIORIDADE: Record<Priority, string> = {
  low:    'text-muted-foreground',
  medium: 'text-[hsl(var(--warning-text))]',
  high:   'text-[hsl(var(--destructive-text))]',
  urgent: 'text-[hsl(var(--destructive-text))]',
};

interface Props {
  value: Priority;
  onChange: (priority: Priority) => void;
}

/**
 * Etapa 158 (plano, linha 438; imagem 04) — prioridade segmentada do modal
 * "Nova tarefa": Baixa, Média (padrão), Alta e Urgente, com setas do teclado.
 *
 * Padrão ARIA de radiogroup com tabindex móvel: só o segmento escolhido entra
 * na ordem de tabulação e as setas andam entre as opções (com volta no fim),
 * como um radio group nativo. As cores saem só de tokens: `primary` na opção
 * escolhida e, nas demais, o par de TEXTO da própria prioridade (D12, etapa
 * 170) — o mesmo do `PriorityPill`/`PriorityChip`, para "prioridade" ser uma
 * cor só no módulo inteiro.
 */
export function PrioritySegment({ value, onChange }: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const irPara = (indice: number) => {
    const alvo = ORDEM[(indice + ORDEM.length) % ORDEM.length];
    onChange(alvo);
    refs.current[ORDEM.indexOf(alvo)]?.focus();
  };

  const aoTeclar = (e: KeyboardEvent, indice: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      irPara(indice + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      irPara(indice - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Prioridade"
      data-testid="new-task-priority"
      className="inline-flex flex-wrap gap-0.5 rounded-lg border border-border/60 bg-muted/30 p-0.5"
    >
      {ORDEM.map((prioridade, indice) => {
        const escolhida = prioridade === value;
        return (
          <button
            key={prioridade}
            type="button"
            ref={(el) => { refs.current[indice] = el; }}
            role="radio"
            aria-checked={escolhida}
            tabIndex={escolhida ? 0 : -1}
            data-priority={prioridade}
            onClick={() => onChange(prioridade)}
            onKeyDown={(e) => aoTeclar(e, indice)}
            className={`h-10 min-w-[72px] rounded-md px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
              escolhida
                ? 'bg-primary text-primary-foreground'
                : `${COR_DA_PRIORIDADE[prioridade]} hover:bg-muted/60`
            }`}
          >
            {PRIORITY_LABELS[prioridade]}
          </button>
        );
      })}
    </div>
  );
}
