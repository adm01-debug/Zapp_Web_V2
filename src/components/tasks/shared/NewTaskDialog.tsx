/**
 * Modal "Nova tarefa" (seção 3.4 do plano, imagem 04) — casco mínimo.
 *
 * Aqui vive SÓ a etapa 159 (campo Prazo) nesta fatia: o casco existe para o
 * campo ser montado no modal real, aberto pelo botão do cabeçalho e pelo atalho
 * `N`. As demais seções (título, contato, prioridade, lembrete, prévia) entram
 * por cima sem reescrever isto — o estado do prazo é local e sobe pelo `onChange`
 * do `PrazoField`.
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

export interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prazo inicial (ISO), quando o modal abre a partir de um dia/contexto. */
  defaultDueDate?: string | null;
  /** Relógio dos atalhos; injetável nos testes. Padrão: agora. */
  now?: Date;
}

export function NewTaskDialog({
  open,
  onOpenChange,
  defaultDueDate = null,
  now,
}: NewTaskDialogProps) {
  const [dueDate, setDueDate] = useState<string | null>(defaultDueDate);

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
      </DialogContent>
    </Dialog>
  );
}
