/**
 * Modal "Nova tarefa" (seção 3.4 do plano, imagem 04) — casco mínimo + etapa 169.
 *
 * A etapa 160 (campo "Lembrete") monta aqui o seu campo; a etapa 164 (bloco
 * "Destino da tarefa") monta o aviso fixo. O casco existe para os dois serem
 * montados no modal real, aberto pelo botão do cabeçalho e pelo atalho `N`. As
 * demais seções (título, contato, prioridade, prazo, coerência) entram por cima
 * em seus próprios cartões: o estado do lembrete é local e sobe pelo `onChange`
 * do `RemindField`.
 *
 * Etapa 169 — responsivo (plano, linha 449):
 *  - abaixo de 900 px a prévia vira ACORDEÃO sob o formulário; em ≥900 px ela
 *    ocupa a coluna da direita, sempre visível. O corte é o de 900 px, não o
 *    `md` de 768 px: o gatilho só existe no desenho estreito
 *    (`min-[900px]:hidden`) e o painel fechado só é escondido na faixa <900 px
 *    (`max-[899px]:data-[state=closed]:hidden`) pelo estado real do Radix. As
 *    duas regras vivem em faixas DISJUNTAS — nenhuma disputa o mesmo caso;
 *  - o painel é `forceMount`: fechado ele continua montado, porque a MESMA
 *    prévia serve às duas visões (sem isso o acordeão fechado desmontaria a
 *    prévia e não haveria o que mostrar no desktop);
 *  - em 360 px o rodapé fica fixo no pé do modal (`NewTaskFooter`), sem cobrir
 *    nada de forma inalcançável: ele é o último filho EM FLUXO do contêiner que
 *    rola, então o conteúdo acima sempre chega inteiro por rolagem.
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DestinationBlock } from './new-task/DestinationBlock';
import { NewTaskFooter } from './new-task/NewTaskFooter';
import { RemindField } from './new-task/RemindField';
import { TaskPreview } from './new-task/TaskPreview';

export interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lembrete inicial (ISO), quando o modal abre a partir de um contexto. */
  defaultRemindAt?: string | null;
  /** Relógio dos atalhos; injetável nos testes. Padrão: agora. */
  now?: Date;
}

export function NewTaskDialog({
  open,
  onOpenChange,
  defaultRemindAt = null,
  now,
}: NewTaskDialogProps) {
  const [remindAt, setRemindAt] = useState<string | null>(defaultRemindAt);
  const [previaAberta, setPreviaAberta] = useState(false);

  /**
   * A prévia é montada UMA vez e usada nas duas visões. O rascunho do casco só
   * tem o lembrete; as etapas 165–167 (título, contato, prioridade, prazo)
   * entram por cima e ligam as demais props — por isso elas vêm com o valor de
   * um formulário ainda vazio, e não com um mock.
   */
  const previa = (
    <TaskPreview
      title=""
      priority="medium"
      contactId={null}
      dueDate={null}
      remindAt={remindAt}
      now={now}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="new-task-dialog"
        className="max-w-[min(538px,calc(100vw_-_2rem))]"
      >
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
          <DialogDescription>Capture agora. Organize o próximo passo.</DialogDescription>
        </DialogHeader>

        <div
          data-testid="nt-linha"
          className="flex flex-col gap-5 min-[900px]:flex-row min-[900px]:items-start"
        >
          <div data-testid="nt-formulario" className="min-w-0 flex-1 space-y-5">
            <RemindField value={remindAt} onChange={setRemindAt} now={now} />
            <DestinationBlock />
          </div>

          <div
            data-testid="nt-previa-coluna"
            className="min-w-0 space-y-3 min-[900px]:w-56 min-[900px]:shrink-0"
          >
            <Collapsible
              open={previaAberta}
              onOpenChange={setPreviaAberta}
              className="min-[900px]:contents"
            >
              <CollapsibleTrigger
                data-testid="nt-previa-gatilho"
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm font-medium leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[900px]:hidden"
              >
                Prévia da tarefa
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 transition-transform motion-safe:data-[state=open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent
                forceMount
                data-testid="nt-previa-painel"
                className="pt-3 min-[900px]:block min-[900px]:pt-0 max-[899px]:data-[state=closed]:hidden"
              >
                {previa}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        <NewTaskFooter
          enviando={false}
          podeCriar={false}
          onCancelar={() => onOpenChange(false)}
          onCriar={() => {
            /* A criação (etapa 167) entra por cima, quando o título existir. */
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
