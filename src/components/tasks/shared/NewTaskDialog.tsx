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
import { useTasksUi } from './tasksUi';
import { ContactCombobox, type ContactOption } from './ContactCombobox';
import { TaskTitleField } from './new-task/TaskTitleField';
import { PrioritySegment } from './new-task/PrioritySegment';
import { DueField } from './new-task/DueField';
import { RemindField } from './new-task/RemindField';
import { CoherenceNotice } from './new-task/CoherenceNotice';
import { DestinationNote } from './new-task/DestinationNote';

interface Props {
  /** Contato já escolhido quando o modal nasce a partir de um contato (etapa 157). */
  defaultContactId?: string | null;
  /** Dados do contato acima, para o chip mostrar avatar + nome sem ir ao banco. */
  defaultContact?: ContactOption | null;
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
 * O que ainda NÃO mora neste arquivo, de propósito: a coluna de prévia (165), a
 * caixa informativa (166) e o rodapé com "Cancelar"/"+ Criar tarefa" (167) — são
 * do cartão filho T37, para não duplicar escopo.
 */
export function NewTaskDialog({ defaultContactId = null, defaultContact = null }: Props) {
  const { closeModal } = useTasksUi();

  const [title, setTitle] = useState('');
  const [touched, setTouched] = useState(false);
  const [contactId, setContactId] = useState<string | null>(defaultContactId);
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [remindAt, setRemindAt] = useState<string | null>(null);

  const titleError = touched && !title.trim() ? 'Informe o título da tarefa.' : null;

  /** Reposiciona o lembrete 1 h antes do prazo (atalho do aviso âmbar, etapa 163). */
  const ajustarLembreteParaAntesDoPrazo = () => {
    if (!dueDate) return;
    setRemindAt(new Date(new Date(dueDate).getTime() - 3_600_000).toISOString());
  };

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) closeModal(); }}>
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

          <DueField value={dueDate} onChange={setDueDate} />

          <RemindField value={remindAt} onChange={setRemindAt} />

          <CoherenceNotice
            remindAt={remindAt}
            dueDate={dueDate}
            onFix={ajustarLembreteParaAntesDoPrazo}
          />

          <DestinationNote />
        </div>
      </DialogContent>
    </Dialog>
  );
}
