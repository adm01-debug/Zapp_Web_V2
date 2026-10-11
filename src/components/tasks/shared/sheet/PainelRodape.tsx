/**
 * Etapas 141–142 do painel "Detalhes da tarefa": o rodapé com o ESTADO DE
 * EDIÇÃO (ponto âmbar + "Alterações não salvas" / "Tudo salvo" + a dica do
 * Ctrl+Enter) e os BOTÕES ("Concluir" verde contorno, "Salvar alterações"
 * primary e o menu ⋮ com reabrir / copiar link interno / cancelar).
 *
 * Mora em `sheet/` para o `WorkItemSheet.tsx` não crescer mais (mesmo motivo da
 * `PlanejamentoSection`).
 */
import { useState } from 'react';
import { CheckCircle2, Link2, MoreVertical, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { WorkItem } from '@/hooks/tasks/workItem.types';
import { linkInternoDaTarefa, podeReabrir } from './rodape';

interface PainelRodapeProps {
  item: WorkItem;
  /** Há edição pendente (o mesmo `mudou` do formulário). */
  mudou: boolean;
  salvando: boolean;
  onConcluir: () => void;
  onSalvar: () => void;
  onCancelar: () => void;
  onReabrir: () => void;
}

export function PainelRodape({
  item,
  mudou,
  salvando,
  onConcluir,
  onSalvar,
  onCancelar,
  onReabrir,
}: PainelRodapeProps) {
  const [copiado, setCopiado] = useState(false);

  /** Etapa 142: copia o link interno da tarefa (navegação do próprio app). */
  async function copiarLink() {
    try {
      await navigator.clipboard?.writeText(linkInternoDaTarefa(item.id, window.location));
      setCopiado(true);
    } catch {
      /* Área de transferência bloqueada (ex.: contexto sem permissão): o menu
         segue oferecendo a ação, sem quebrar o painel. */
    }
  }

  return (
    <>
      {/* Etapa 141: estado de edição. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p data-testid="sheet-estado-edicao" className="flex items-center gap-1.5 text-2xs">
          {mudou ? (
            <>
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-warning" />
              <span className="font-medium text-[hsl(var(--warning-text))]">Alterações não salvas</span>
            </>
          ) : (
            <span className="text-muted-foreground">Tudo salvo</span>
          )}
        </p>
        {mudou && (
          <span data-testid="sheet-dica-ctrl-enter" className="text-2xs text-muted-foreground">
            Ctrl+Enter para salvar
          </span>
        )}
      </div>

      {/* Etapa 142: ações do rodapé. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          type="button"
          variant="outline"
          data-testid="sheet-concluir"
          onClick={onConcluir}
          className="gap-2 border-success/50 text-success hover:bg-success/10 hover:text-success"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Concluir
        </Button>
        <Button
          type="button"
          data-testid="sheet-salvar"
          disabled={!mudou || salvando}
          aria-busy={salvando}
          onClick={onSalvar}
          className="bg-primary"
          title="Ctrl+Enter salva"
        >
          Salvar alterações
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="sheet-menu"
              aria-label="Mais ações da tarefa"
              className="text-muted-foreground"
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {podeReabrir(item.status) && (
              <DropdownMenuItem data-testid="sheet-reabrir" onSelect={onReabrir} className="gap-2">
                <RotateCcw className="h-4 w-4" aria-hidden /> Reabrir tarefa
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              data-testid="sheet-copiar-link"
              onSelect={() => { void copiarLink(); }}
              className="gap-2"
            >
              <Link2 className="h-4 w-4" aria-hidden />
              {copiado ? 'Link copiado' : 'Copiar link interno'}
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="sheet-cancelar"
              onSelect={onCancelar}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <X className="h-4 w-4" aria-hidden /> Cancelar tarefa
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
