import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Fingerprint, Loader2 } from 'lucide-react';

interface PasskeyDialogsProps {
  showRegisterDialog: boolean;
  setShowRegisterDialog: (v: boolean) => void;
  showRenameDialog: boolean;
  setShowRenameDialog: (v: boolean) => void;
  showDeleteDialog: boolean;
  setShowDeleteDialog: (v: boolean) => void;
  passkeyName: string;
  setPasskeyName: (v: string) => void;
  newName: string;
  setNewName: (v: string) => void;
  loading: boolean;
  onRegister: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function PasskeyDialogs({
  showRegisterDialog, setShowRegisterDialog,
  showRenameDialog, setShowRenameDialog,
  showDeleteDialog, setShowDeleteDialog,
  passkeyName, setPasskeyName,
  newName, setNewName,
  loading, onRegister, onRename, onDelete,
}: PasskeyDialogsProps) {
  return (
    <>
      <Dialog open={showRegisterDialog} onOpenChange={setShowRegisterDialog}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Fingerprint className="h-5 w-5" />Adicionar Passkey</DialogTitle>
            <DialogDescription>Dê um nome para identificar esta passkey (ex: "MacBook Pro", "iPhone 15")</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input placeholder="Nome da passkey (opcional)" value={passkeyName} onChange={(e) => setPasskeyName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegisterDialog(false)}>Cancelar</Button>
            <Button onClick={onRegister} disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aguardando...</> : <><Fingerprint className="h-4 w-4 mr-2" />Registrar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Renomear Passkey</DialogTitle>
            <DialogDescription>Digite um novo nome para identificar esta passkey</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input placeholder="Novo nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>Cancelar</Button>
            <Button onClick={onRename} disabled={!newName}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Passkey?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. Você não poderá mais usar esta passkey para fazer login.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
