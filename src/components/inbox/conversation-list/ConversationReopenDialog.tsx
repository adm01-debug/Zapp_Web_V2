import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArchiveRestore, Loader2, RotateCcw } from 'lucide-react';

/**
 * Confirmação leve antes de reabrir/desarquivar. `reopen` = conversa resolvida,
 * `unarchive` = conversa arquivada (só o rótulo muda; a RPC é a mesma).
 */
export type ReopenAction = 'reopen' | 'unarchive';

interface ConversationReopenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: ReopenAction;
  contactName?: string;
  /** Enquanto a RPC roda: botões travados e espera visível. */
  isPending?: boolean;
  /** Falha da RPC — fica dentro do diálogo, sem fechar em silêncio. */
  error?: string | null;
  onConfirm: () => void;
}

/** Diálogo de confirmação de reabertura/desarquivamento de conversa. */
export function ConversationReopenDialog({
  open,
  onOpenChange,
  action,
  contactName,
  isPending = false,
  error = null,
  onConfirm,
}: ConversationReopenDialogProps) {
  const desarquivar = action === 'unarchive';
  const verbo = desarquivar ? 'Desarquivar' : 'Reabrir';
  const Icone = desarquivar ? ArchiveRestore : RotateCcw;
  const comQuem = contactName ? ` com ${contactName}` : '';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Icone className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            {verbo} conversa?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {desarquivar
              ? `A conversa${comQuem} sai de Arquivadas e volta para a fila de atendimento.`
              : `A conversa${comQuem} sai de Resolvidas e volta para a fila de atendimento.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Mantém o diálogo aberto enquanto a RPC roda (a espera fica visível
              // aqui); quem chamou fecha no sucesso.
              e.preventDefault();
              onConfirm();
            }}
            disabled={isPending}
            aria-label={verbo}
          >
            {isPending && <Loader2 className="w-4 h-4 mr-2 motion-safe:animate-spin" aria-hidden="true" />}
            {verbo}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
