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
  onConfirm: () => void;
}

export function ConnectionDisconnectDialog({
  open, onOpenChange, connectionName, phoneNumber, onConfirm,
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
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive hover:bg-destructive/90">
            Desconectar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
