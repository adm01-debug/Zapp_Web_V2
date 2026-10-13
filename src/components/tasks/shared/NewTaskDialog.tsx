/**
 * Modal "Nova tarefa" (seção 3.4 do plano, imagem 04) — casco mínimo.
 *
 * Aqui vivem as etapas 159 (campo Prazo) e 160 (campo Lembrete): o casco existe
 * para os campos serem montados no modal real, aberto pelo botão do cabeçalho e
 * pelo atalho `N`. As demais seções (título, contato, prioridade, coerência,
 * destino, prévia) entram por cima sem reescrever isto — o estado de cada campo é
 * local e sobe pelo `onChange` respectivo.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PrazoField } from './new-task/PrazoField';
import { RemindField } from './new-task/RemindField';

export interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prazo inicial (ISO), quando o modal abre a partir de um dia/contexto. */
  defaultDueDate?: string | null;
  /** Lembrete inicial (ISO), quando o modal abre a partir de um contexto. */
  defaultRemindAt?: string | null;
  /** Relógio dos atalhos; injetável nos testes. Padrão: agora. */
  now?: Date;
}

export function NewTaskDialog({
  open,
  onOpenChange,
  defaultDueDate = null,
  defaultRemindAt = null,
  now,
}: NewTaskDialogProps) {
  const [dueDate, setDueDate] = useState<string | null>(defaultDueDate);
  const [remindAt, setRemindAt] = useState<string | null>(defaultRemindAt);

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

        <PrazoField value={dueDate} onChange={setDueDate} now={now} />
        <RemindField value={remindAt} onChange={setRemindAt} now={now} />
      </DialogContent>
    </Dialog>
  );
}
