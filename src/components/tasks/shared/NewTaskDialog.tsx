import { useState } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Priority } from '@/hooks/tasks/workItem.types';
import { useTasksUiOptional } from './tasksUi';
import { ContactCombobox, type ContactOption } from './ContactCombobox';
import { TaskTitleField } from './new-task/TaskTitleField';
import { PrioritySegment } from './new-task/PrioritySegment';
import { PrazoField } from './new-task/PrazoField';
import { DestinationBlock } from './new-task/DestinationBlock';

interface Props {
  /** Contato já escolhido quando o modal nasce a partir de um contato (etapa 157). */
  defaultContactId?: string | null;
  /** Dados do contato acima, para o chip mostrar avatar + nome sem ir ao banco. */
  defaultContact?: ContactOption | null;
  /** Prazo inicial (ISO), quando o modal abre a partir de um dia/contexto (etapa 159). */
  defaultDueDate?: string | null;
  /** Relógio dos atalhos de prazo; injetável nos testes. Padrão: agora. */
  now?: Date;
  /**
   * Controle externo do `Dialog` (etapas 159/160/163): os testes dessas etapas
   * montam o modal sem o `TasksUiProvider`. Sem estas props o modal segue o
   * `TasksUiContext` como as outras superfícies.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Etapas 154 a 158 (plano, linhas 434 a 438; imagem 04, seção 3.4) — o modal
 * "Nova tarefa" do módulo de Tarefas.
 *
 * O modal obedece ao MESMO `TasksUiContext` das outras superfícies: aberto pelo
 * botão "+ Nova tarefa", pela tecla `N` e (adiante) pelo menu das colunas — o
 * que muda a fonte é só quem chama `openModal()`. Quem o carrega sob demanda é
 * o `TasksModule` (import dinâmico), e o destino da tarefa é fixo na Caixa de
 * entrada (D10), por isso não há campo de estado aqui.
 *
 * O que ainda NÃO mora neste arquivo, de propósito: prazo e lembrete (etapas
 * 159/160), a mensagem de coerência (163), a coluna de prévia (165), a caixa
 * informativa (166) e o rodapé com "Cancelar"/"+ Criar tarefa" (167) — são dos
 * cartões filhos T36 e T37, para não duplicar escopo.
 */
export function NewTaskDialog({
  defaultContactId = null,
  defaultContact = null,
  defaultDueDate = null,
  now,
  open,
  onOpenChange,
}: Props) {
  const tasksUi = useTasksUiOptional();
  const closeModal = tasksUi?.closeModal ?? (() => onOpenChange?.(false));

  const [title, setTitle] = useState('');
  const [touched, setTouched] = useState(false);
  const [contactId, setContactId] = useState<string | null>(defaultContactId);
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState<string | null>(defaultDueDate);

  const titleError = touched && !title.trim() ? 'Informe o título da tarefa.' : null;

  return (
    <Dialog open={open ?? true} onOpenChange={onOpenChange ?? ((aberto) => { if (!aberto) closeModal(); })}>
      <DialogContent size="lg" data-testid="new-task-dialog" className="gap-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            data-testid="new-task-icon"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
          >
            <Plus className="h-4 w-4" />
          </span>
          <div className="space-y-1">
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>Capture agora. Organize o próximo passo.</DialogDescription>
          </div>
        </div>

        <div className="space-y-5">
          <TaskTitleField
            value={title}
            onChange={setTitle}
            onBlur={() => setTouched(true)}
            error={titleError}
          />

          <div className="space-y-1.5">
            <Label htmlFor="new-task-contact">Contato</Label>
            <div>
              <ContactCombobox
                id="new-task-contact"
                testId="new-task-contact"
                value={contactId}
                onChange={setContactId}
                selectedContact={defaultContact}
                placeholder="Sem contato"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium leading-none">Prioridade</span>
            <PrioritySegment value={priority} onChange={setPriority} />
          </div>

          <PrazoField value={dueDate} onChange={setDueDate} now={now} />

          <DestinationBlock />
        </div>
      </DialogContent>
    </Dialog>
  );
}
