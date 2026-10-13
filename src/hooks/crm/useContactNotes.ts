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
  /**
   * Nota fixada (aparece no topo da lista do contato). Opcional de propósito:
   * as notas antigas lidas antes da coluna existir chegam sem a marca e valem
   * como NÃO fixadas (`is_pinned === true` é a única leitura que fixa).
   */
  is_pinned?: boolean;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

export const contactNotesKey = (contactId: string, userId?: string | null) => ['contact-notes', userId ?? null, contactId] as const;

/**
 * Ordem da lista: fixadas primeiro, depois `created_at` desc e, no empate exato
 * de instante, `id` desc como desempate final — a MESMA ordem que o servidor usa
 * na paginação (`created_at desc, id desc`). Sem isso, uma nota fixada podia cair
 * no meio de duas notas do mesmo instante e a página seguinte parecia fora de ordem.
 * O servidor NÃO ordena por `is_pinned` (o índice parcial é só de leitura barata);
 * a verdade sobre a nota completa segue no select e aqui só reordenamos a cópia do cache.
 */
function compareContactNotes(a: ContactNote, b: ContactNote): number {
  const pinnedDiff = Number(b.is_pinned === true) - Number(a.is_pinned === true);
  if (pinnedDiff !== 0) return pinnedDiff;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
  if (a.id !== b.id) return a.id < b.id ? 1 : -1;
  return 0;
}

export function useContactNotes(contactId: string, options?: { category?: ContactNoteCategory }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

   const { profile } = useAuth();

   const { data: allNotes = [], isLoading, error, refetch } = useQuery({
     queryKey: contactNotesKey(contactId, user?.id),
     queryFn: () => ContactService.fetchNotes(contactId) as Promise<ContactNote[]>,
     enabled: !!contactId,
   });

  // Cópia ordenada: fixadas primeiro. A ordenação roda sobre a página já lida
  // (o hook não busca de novo); o desempate por `id` mantém a ordem determinística.
  const sortedNotes = useMemo(() => [...allNotes].sort(compareContactNotes), [allNotes]);

  const categoryFilter = options?.category;
  const notes = useMemo(
    () => (categoryFilter ? sortedNotes.filter((n) => n.category === categoryFilter) : sortedNotes),
    [sortedNotes, categoryFilter],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: contactNotesKey(contactId, user?.id) });
    queryClient.invalidateQueries({ queryKey: conversationTabCountsKey(contactId) });
  };

   const addNoteMutation = useMutation({
     mutationFn: ({ content, category, dueDate, isPinned }: { content: string; category?: ContactNoteCategory; dueDate?: string | null; isPinned?: boolean }) => {
       if (!profile?.id) throw new Error('Perfil não encontrado');
       return ContactService.addNote(contactId, profile.id, content, { category, dueDate, isPinned });
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
    mutationFn: ({ id, updates }: { id: string; updates: Partial<{ content: string; is_done: boolean; is_pinned: boolean; due_date: string | null }> }) =>
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

  const addNote = useCallback((content: string, category?: ContactNoteCategory, dueDate?: string | null, isPinned?: boolean) => {
    return addNoteMutation.mutateAsync({ content, category, dueDate, isPinned });
  }, [addNoteMutation]);

  const deleteNote = useCallback((noteId: string) => {
    return deleteNoteMutation.mutateAsync(noteId);
  }, [deleteNoteMutation]);

  const updateNote = useCallback((id: string, updates: Partial<{ content: string; is_done: boolean; is_pinned: boolean; due_date: string | null }>) => {
    return updateNoteMutation.mutateAsync({ id, updates });
  }, [updateNoteMutation]);

  const toggleNoteDone = useCallback((note: ContactNote) => {
    return updateNoteMutation.mutateAsync({ id: note.id, updates: { is_done: !note.is_done } });
  }, [updateNoteMutation]);

  /** Edita SÓ o texto da nota (conteúdo); o autor é quem manda a requisição e a RLS
   * de UPDATE do banco é a barreira de quem pode editar. */
  const editNote = useCallback((id: string, content: string) => {
    return updateNoteMutation.mutateAsync({ id, updates: { content } });
  }, [updateNoteMutation]);

  /** Fixa/desfixa pelo id: o estado atual vem da lista já carregada. Nota fora da
   * lista carregada NÃO é fixada às cegas — lança erro claro para o chamador. */
  const togglePin = useCallback((id: string) => {
    const note = sortedNotes.find((n) => n.id === id);
    if (!note) throw new Error('Nota não encontrada na lista carregada');
    return updateNoteMutation.mutateAsync({ id, updates: { is_pinned: note.is_pinned !== true } });
  }, [sortedNotes, updateNoteMutation]);

  return {
    notes,
    allNotes: sortedNotes,
    isLoading,
    error,
    refetch,
    addNote,
    deleteNote,
    updateNote,
    editNote,
    toggleNoteDone,
    togglePin,
    isAdding: addNoteMutation.isPending,
    isDeleting: deleteNoteMutation.isPending,
    isUpdating: updateNoteMutation.isPending,
    currentProfileId: profile?.id,
  };
}
