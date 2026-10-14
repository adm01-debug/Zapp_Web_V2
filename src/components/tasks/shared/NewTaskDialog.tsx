/**
 * Modal "Nova tarefa" (seção 3.4 do plano, imagem 04) — casco mínimo.
 *
 * A etapa 160 (campo "Lembrete") monta aqui o seu campo; a etapa 164 (bloco
 * "Destino da tarefa") monta o aviso fixo. O casco existe para os dois serem
 * montados no modal real, aberto pelo botão do cabeçalho e pelo atalho `N`. As
 * demais seções (título, contato, prioridade, prazo, coerência, prévia) entram
 * por cima em seus próprios cartões, sem reescrever isto — o estado do lembrete
 * é local e sobe pelo `onChange` do `RemindField`.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DestinationBlock } from './new-task/DestinationBlock';
import { RemindField } from './new-task/RemindField';

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

        <RemindField value={remindAt} onChange={setRemindAt} now={now} />

        <DestinationBlock />
      </DialogContent>
    </Dialog>
  );
}
