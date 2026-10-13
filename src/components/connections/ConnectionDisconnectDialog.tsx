import { Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Confirmação do "Desconectar" (paridade V3 -> V2, t_a369905d): antes um clique
 * derrubava a sessão do WhatsApp direto, sem perguntar. O diálogo mostra o nome
 * da conexão e o número MASCARADO — a confirmação não precisa expor o telefone
 * inteiro — e só chama `onConfirm` na ação. Cancelar/Esc fecham sem chamar nada.
 */
function maskPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 5) return '****';
  return `+${digits.slice(0, 2)} *****-${digits.slice(-4)}`;
}

interface ConnectionDisconnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionName: string;
  phoneNumber: string;
  /** Desconectar em voo: mantém o diálogo aberto com o spinner e trava tudo. */
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConnectionDisconnectDialog({
  open, onOpenChange, connectionName, phoneNumber, pending = false, onConfirm,
}: ConnectionDisconnectDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desconectar {connectionName}?</AlertDialogTitle>
          <AlertDialogDescription>
            A conexão <strong>{connectionName}</strong> ({maskPhoneNumber(phoneNumber)}) será
            desconectada do WhatsApp. As conversas e os contatos continuam salvos — para voltar a
            atender por este número é só ler um novo QR Code.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void onConfirm(); }}
            disabled={pending}
            aria-busy={pending}
            className="bg-destructive hover:bg-destructive/90"
          >
            {pending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Desconectando…</>
              : 'Desconectar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
