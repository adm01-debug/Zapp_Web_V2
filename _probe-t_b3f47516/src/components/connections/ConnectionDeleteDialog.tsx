import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Confirmação em duas etapas da exclusão da conexão (paridade V3 -> V2,
 * t_a369905d): um clique apagava a instância na Evolution e o vínculo local.
 * Etapa 1 = abrir o diálogo; etapa 2 = digitar o nome exato da conexão para
 * liberar a ação. O texto explica o efeito real e que não há volta.
 */
interface ConnectionDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectionName: string;
  onConfirm: () => void;
}

export function ConnectionDeleteDialog({
  open, onOpenChange, connectionName, onConfirm,
}: ConnectionDeleteDialogProps) {
  const [typedName, setTypedName] = useState('');
  const matches = typedName.trim() === connectionName.trim();

  // Zera o campo ao fechar sem useEffect (o lint barra setState sincrono em
  // efeito): o reset acompanha a mudança de `open` no proprio handler, entao
  // uma reabertura nunca herda o texto da vez anterior.
  const handleOpenChange = (next: boolean) => {
    if (!next) setTypedName('');
    onOpenChange(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">Excluir {connectionName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso apaga a instância desta conexão na Evolution API e o vínculo local.{' '}
            <strong>Não pode ser desfeito.</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-delete-connection-name">
            Digite <strong>{connectionName}</strong> para confirmar
          </Label>
          <Input
            id="confirm-delete-connection-name"
            value={typedName}
            autoComplete="off"
            placeholder={connectionName}
            onChange={(e) => setTypedName(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!matches}
            onClick={onConfirm}
            className="bg-destructive hover:bg-destructive/90"
          >
            Excluir conexão
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
