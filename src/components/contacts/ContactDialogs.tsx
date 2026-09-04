import { motion } from 'framer-motion';
import { ContactForm } from '@/components/contacts/ContactForm';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, Copy, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Contact } from './useContactsCRUD';

interface ContactFormValues {
  name: string;
  nickname?: string | null;
  surname?: string | null;
  job_title?: string | null;
  company?: string | null;
  phone: string;
  email?: string | null;
  contact_type?: string | null;
}

interface ContactDialogsProps {
  // Add dialog
  isAddDialogOpen: boolean;
  setIsAddDialogOpen: (open: boolean) => void;
  newContact: ContactFormValues;
  handleNewContactChange: (field: string, value: string) => void;
  handleAddContact: () => void;
  handleCancelForm: () => void;
  isSubmitting: boolean;
  // Edit dialog
  isEditDialogOpen: boolean;
  setIsEditDialogOpen: (open: boolean) => void;
  editingContact: Contact | null;
  handleEditContactChange: (field: string, value: string) => void;
  handleEditContact: () => void;
  // Success dialog
  showSuccess: { name: string; protocol: string } | null;
  setShowSuccess: (val: { name: string; protocol: string } | null) => void;
  // Delete dialog
  deleteTarget: Contact | null;
  setDeleteTarget: (val: Contact | null) => void;
  handleDeleteContact: (id: string) => void;
}

export function ContactDialogs({
  isAddDialogOpen, setIsAddDialogOpen, newContact, handleNewContactChange,
  handleAddContact, handleCancelForm, isSubmitting,
  isEditDialogOpen, setIsEditDialogOpen, editingContact, handleEditContactChange, handleEditContact,
  showSuccess, setShowSuccess,
  deleteTarget, setDeleteTarget, handleDeleteContact,
}: ContactDialogsProps) {
  return (
    <>
      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogTrigger asChild>
          <Button className="bg-whatsapp hover:bg-whatsapp-dark text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />
            Novo Contato
          </Button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Contato</DialogTitle>
          </DialogHeader>
          <ContactForm
            values={newContact}
            onChange={handleNewContactChange}
            onSubmit={handleAddContact}
            onCancel={handleCancelForm}
            submitLabel="Adicionar"
            isSubmitting={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
          </DialogHeader>
          {editingContact && (
            <ContactForm
              values={editingContact}
              onChange={handleEditContactChange}
              onSubmit={handleEditContact}
              onCancel={handleCancelForm}
              submitLabel="Salvar"
              isSubmitting={isSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Success Dialog */}
      <Dialog open={!!showSuccess} onOpenChange={() => setShowSuccess(null)}>
        <DialogContent aria-describedby={undefined} className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="flex flex-col items-center gap-3">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <CheckCircle2 className="w-16 h-16 text-success" />
              </motion.div>
              Contato Adicionado!
            </DialogTitle>
            <DialogDescription className="text-center space-y-3 pt-2">
              <p><strong>{showSuccess?.name}</strong> foi adicionado com sucesso.</p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <p className="text-xs text-muted-foreground">Protocolo</p>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-sm font-mono font-semibold text-foreground">{showSuccess?.protocol}</code>
                  <Button
                    variant="ghost" size="icon" className="w-6 h-6"
                    onClick={() => {
                      navigator.clipboard.writeText(showSuccess?.protocol || '');
                      toast.success('Protocolo copiado!');
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setShowSuccess(null)} className="w-full bg-whatsapp hover:bg-whatsapp-dark">
            Continuar
          </Button>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDeleteContact(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
