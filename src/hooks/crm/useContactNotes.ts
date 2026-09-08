 import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { toast } from '@/hooks/ui/use-toast';
 import { ContactService } from '@/services/contact.service';
 import { AuthService } from '@/services/auth.service';
 import { useAuth } from '@/hooks/auth/useAuth';
import { log } from '@/lib/logger';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';

export type ContactNoteCategory = 'note' | 'fact' | 'objection' | 'promise';

export interface ContactNote {
  id: string;
  contact_id: string;
  author_id: string;
  content: string;
  category: ContactNoteCategory;
  is_done: boolean;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

export const contactNotesKey = (contactId: string) => ['contact-notes', contactId] as const;

export function useContactNotes(contactId: string, options?: { category?: ContactNoteCategory }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

   const { profile } = useAuth();

   const { data: allNotes = [], isLoading, error, refetch } = useQuery({
     queryKey: contactNotesKey(contactId),
     queryFn: () => ContactService.fetchNotes(contactId) as Promise<ContactNote[]>,
     enabled: !!contactId,
   });

  const categoryFilter = options?.category;
  const notes = useMemo(
    () => (categoryFilter ? allNotes.filter((n) => n.category === categoryFilter) : allNotes),
    [allNotes, categoryFilter],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: contactNotesKey(contactId) });
    queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
  };

   const addNoteMutation = useMutation({
     mutationFn: ({ content, category, dueDate }: { content: string; category?: ContactNoteCategory; dueDate?: string | null }) => {
       if (!profile?.id) throw new Error('Perfil não encontrado');
       return ContactService.addNote(contactId, profile.id, content, { category, dueDate });
     },
    onSuccess: () => {
      invalidate();
      toast({
        title: 'Nota adicionada',
        description: 'A nota foi salva com sucesso.',
      });
    },
    onError: (error) => {
      log.error('Error adding note:', error);
      toast({
        title: 'Erro ao adicionar nota',
        description: 'Não foi possível salvar a nota.',
        variant: 'destructive',
      });
    },
  });

   const deleteNoteMutation = useMutation({
     mutationFn: (noteId: string) => ContactService.deleteNote(noteId),
    onSuccess: () => {
      invalidate();
      toast({
        title: 'Nota removida',
        description: 'A nota foi removida com sucesso.',
      });
    },
    onError: (error) => {
      log.error('Error deleting note:', error);
      toast({
        title: 'Erro ao remover nota',
        description: 'Não foi possível remover a nota.',
        variant: 'destructive',
      });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<{ content: string; is_done: boolean; due_date: string | null }> }) =>
      ContactService.updateNote(id, updates),
    onSuccess: () => invalidate(),
    onError: (error) => {
      log.error('Error updating note:', error);
      toast({
        title: 'Erro ao atualizar nota',
        description: 'Não foi possível salvar a alteração.',
        variant: 'destructive',
      });
    },
  });

  const addNote = useCallback((content: string, category?: ContactNoteCategory, dueDate?: string | null) => {
    return addNoteMutation.mutateAsync({ content, category, dueDate });
  }, [addNoteMutation]);

  const deleteNote = useCallback((noteId: string) => {
    return deleteNoteMutation.mutateAsync(noteId);
  }, [deleteNoteMutation]);

  const updateNote = useCallback((id: string, updates: Partial<{ content: string; is_done: boolean; due_date: string | null }>) => {
    return updateNoteMutation.mutateAsync({ id, updates });
  }, [updateNoteMutation]);

  const toggleNoteDone = useCallback((note: ContactNote) => {
    return updateNoteMutation.mutateAsync({ id: note.id, updates: { is_done: !note.is_done } });
  }, [updateNoteMutation]);

  return {
    notes,
    allNotes,
    isLoading,
    error,
    refetch,
    addNote,
    deleteNote,
    updateNote,
    toggleNoteDone,
    isAdding: addNoteMutation.isPending,
    isDeleting: deleteNoteMutation.isPending,
    isUpdating: updateNoteMutation.isPending,
    currentProfileId: profile?.id,
  };
}
