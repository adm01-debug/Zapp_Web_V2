 import { useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { toast } from '@/hooks/ui/use-toast';
 import { ContactService } from '@/services/contact.service';
 import { AuthService } from '@/services/auth.service';
 import { useAuth } from '@/hooks/auth/useAuth';
import { log } from '@/lib/logger';
import { conversationTabCountsKey } from '@/hooks/chat/useConversationTabCounts';
import { supabase } from '@/integrations/supabase/client';
import { createStorageObjectId } from '@/lib/storage_object_upload';
import type { Database } from '@/integrations/supabase/types';

/** Bucket de mídia já usado pelas mensagens (mesmo padrão do chat). */
const NOTES_MEDIA_BUCKET = 'whatsapp-media';

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
  /**
   * URL do objeto de áudio quando a nota é uma nota de voz; `null`/ausente em
   * notas de texto. Opcional de propósito: literais de `ContactNote` em testes
   * de outros cartões não o trazem.
   */
  audio_url?: string | null;
  author?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
}

export const contactNotesKey = (contactId: string, userId?: string | null) => ['contact-notes', userId ?? null, contactId] as const;

export function useContactNotes(contactId: string, options?: { category?: ContactNoteCategory }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

   const { profile } = useAuth();

   const { data: allNotes = [], isLoading, error, refetch } = useQuery({
     queryKey: contactNotesKey(contactId, user?.id),
     queryFn: async () => {
       const notes = (await ContactService.fetchNotes(contactId)) as ContactNote[];
       // `contact_notes.audio_url` é coluna nova e o select do ContactService ainda
       // não a traz (arquivo fora do escopo deste cartão). Buscamos só essa coluna
       // pelos ids já carregados e mesclamos em memória.
       const ids = notes.map((n) => n.id);
       if (ids.length === 0) return notes;
       const { data } = await supabase
         .from('contact_notes')
         .select('id, audio_url')
         .in('id', ids);
       const rows = (data ?? []) as unknown as Array<{ id: string; audio_url: string | null }>;
       const audioById = new Map(rows.map((r) => [r.id, r.audio_url]));
       return notes.map((n) => ({ ...n, audio_url: audioById.get(n.id) ?? null }));
     },
     enabled: !!contactId,
   });

  const categoryFilter = options?.category;
  const notes = useMemo(
    () => (categoryFilter ? allNotes.filter((n) => n.category === categoryFilter) : allNotes),
    [allNotes, categoryFilter],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: contactNotesKey(contactId, user?.id) });
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

  const addAudioNoteMutation = useMutation({
    mutationFn: async ({ blob, category, dueDate }: { blob: Blob; category?: ContactNoteCategory; dueDate?: string | null }) => {
      if (!profile?.id) throw new Error('Perfil não encontrado');
      const path = `${contactId}/${createStorageObjectId()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from(NOTES_MEDIA_BUCKET)
        .upload(path, blob, { cacheControl: '31536000', upsert: false });
      if (uploadError) throw new Error(`Erro ao enviar áudio: ${uploadError.message}`);

      const { data: locator } = supabase.storage.from(NOTES_MEDIA_BUCKET).getPublicUrl(path);
      const audioUrl = locator?.publicUrl;
      if (!audioUrl) {
        await supabase.storage.from(NOTES_MEDIA_BUCKET).remove([path]);
        throw new Error('Não foi possível obter a URL do áudio.');
      }

      // `types.ts` é gerado e ainda não conhece `audio_url` (coluna desta migration);
      // cast único para não tocar no arquivo de tipos, fora do escopo do cartão.
      const payload = {
        contact_id: contactId,
        author_id: profile.id,
        content: '',
        category: category ?? 'note',
        due_date: dueDate ?? null,
        audio_url: audioUrl,
      } as unknown as Database['public']['Tables']['contact_notes']['Insert'];

      const { data, error } = await supabase.from('contact_notes').insert(payload).select().single();
      if (error) {
        await supabase.storage.from(NOTES_MEDIA_BUCKET).remove([path]);
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({
        title: 'Nota de áudio adicionada',
        description: 'O áudio foi salvo na nota.',
      });
    },
    onError: (error) => {
      log.error('Error adding audio note:', error);
      toast({
        title: 'Erro ao salvar áudio',
        description: 'Não foi possível salvar a nota de áudio.',
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

  const addAudioNote = useCallback((blob: Blob, category?: ContactNoteCategory, dueDate?: string | null) => {
    return addAudioNoteMutation.mutateAsync({ blob, category, dueDate });
  }, [addAudioNoteMutation]);

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
    addAudioNote,
    deleteNote,
    updateNote,
    toggleNoteDone,
    isAdding: addNoteMutation.isPending,
    isAddingAudio: addAudioNoteMutation.isPending,
    isDeleting: deleteNoteMutation.isPending,
    isUpdating: updateNoteMutation.isPending,
    currentProfileId: profile?.id,
  };
}
