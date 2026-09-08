import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { StickyNote, Plus, Trash2, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useContactNotes } from '@/hooks/crm/useContactNotes';

interface PrivateNotesProps {
  contactId: string;
}

export function PrivateNotes({ contactId }: PrivateNotesProps) {
  const { notes, isLoading, addNote, deleteNote, isAdding: isSaving, isDeleting, currentProfileId } = useContactNotes(contactId);
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  const handleAddNote = async () => {
    if (newNote.trim()) {
      await addNote(newNote.trim());
      setNewNote('');
      setIsAddingNote(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <StickyNote className="w-4 h-4" />
          <span>Notas Privadas</span>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <StickyNote className="w-4 h-4" />
          <span>Notas Privadas</span>
        </div>
        {!isAddingNote && (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsAddingNote(true)}
            >
              <Plus className="w-3 h-3 mr-1" />
              Nova nota
            </Button>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {isAddingNote && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            <Textarea
              placeholder="Adicione uma nota privada (visível apenas para atendentes)..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              className="text-sm resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAddingNote(false);
                  setNewNote('');
                }}
                disabled={isSaving}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!newNote.trim() || isSaving}
                className="bg-whatsapp hover:bg-whatsapp-dark"
              >
                {isSaving ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Send className="w-3 h-3 mr-1" />
                )}
                Salvar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
        <AnimatePresence>
          {notes.map((note, index) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: index * 0.05 }}
              className="group p-3 bg-muted/50 rounded-lg border border-border/50 hover:border-border transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground flex-1">{note.content}</p>
                {note.author_id === currentProfileId && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleDeleteNote(note.id)}
                    disabled={isDeleting}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded disabled:opacity-50"
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </motion.button>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Avatar className="w-4 h-4">
                  <AvatarImage src={note.author?.avatar_url || undefined} alt={note.author?.name || 'Autor'} />
                  <AvatarFallback className="text-[8px]">
                    {note.author?.name?.[0] || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[10px] text-muted-foreground">
                  {note.author?.name || 'Desconhecido'} • {format(new Date(note.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {notes.length === 0 && !isAddingNote && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma nota adicionada
          </p>
        )}
      </div>
    </div>
  );
}
