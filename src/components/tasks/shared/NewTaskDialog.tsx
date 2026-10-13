/**
 * Modal "Nova tarefa" (seção 3.4 do plano, imagem 04) — casco mínimo.
 *
 * A etapa 164 (bloco "Destino da tarefa") monta aqui o seu aviso fixo; o casco
 * existe para o bloco ser montado no modal real. As demais seções (título,
 * contato, prioridade, prazo, lembrete, coerência, prévia) entram por cima em
 * seus próprios cartões, sem reescrever isto.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DestinationBlock } from './new-task/DestinationBlock';

export interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewTaskDialog({ open, onOpenChange }: NewTaskDialogProps) {
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

        <DestinationBlock />
      </DialogContent>
    </Dialog>
  );
}
