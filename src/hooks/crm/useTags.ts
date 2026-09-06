import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from '@/hooks/ui/use-toast';

export interface Tag {
  id: string;
  name: string;
  color: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contact_count?: number;
}

export function useTags() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all tags with contact count
  const { data: tags = [], isLoading, error, refetch } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data: tagsData, error: tagsError } = await supabase
        .from('tags')
        .select('*')
        .order('name');

      if (tagsError) throw tagsError;

      // Get contact counts for each tag
      const { data: contactCounts, error: countError } = await supabase
        .from('contact_tags')
        .select('tag_id');

      if (countError) throw countError;

      // Count contacts per tag
      const countMap = (contactCounts || []).reduce((acc, ct) => {
        acc[ct.tag_id] = (acc[ct.tag_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return (tagsData || []).map(tag => ({
        ...tag,
        contact_count: countMap[tag.id] || 0,
      })) as Tag[];
    },
  });

  // Create tag mutation
  const createMutation = useMutation({
    mutationFn: async (data: { name: string; color: string; description?: string }) => {
      // Get current user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id ?? '')
        .maybeSingle();

      const { data: tag, error } = await supabase
        .from('tags')
        .insert({
          name: data.name,
          color: data.color,
          description: data.description || null,
          created_by: profile?.id || null,
        })
        .select()
        .single();

      if (error) throw error;
      return tag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast({
        title: 'Etiqueta criada',
        description: 'A etiqueta foi criada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar etiqueta',
        description: error.message.includes('duplicate') 
          ? 'Já existe uma etiqueta com este nome.' 
          : error.message,
        variant: 'destructive',
      });
    },
  });

  // Update tag mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; color: string; description?: string }) => {
      const { data: tag, error } = await supabase
        .from('tags')
        .update({
          name: data.name,
          color: data.color,
          description: data.description || null,
        })
        .eq('id', data.id)
        .select()
        .single();

      if (error) throw error;
      return tag;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast({
        title: 'Etiqueta atualizada',
        description: 'A etiqueta foi atualizada com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar etiqueta',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete tag mutation
  const deleteMutation = useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast({
        title: 'Etiqueta excluída',
        description: 'A etiqueta foi excluída com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao excluir etiqueta',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    tags,
    isLoading,
    error,
    refetch,
    createTag: createMutation.mutateAsync,
    updateTag: updateMutation.mutateAsync,
    deleteTag: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}

// Hook for managing tags on a specific contact
export function useContactTags(contactId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: contactTags = [], isLoading } = useQuery({
    queryKey: ['contact-tags', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('contact_tags')
        .select('tag_id, tags(*)')
        .eq('contact_id', contactId);

      if (error) throw error;
      return data?.map(ct => ct.tags).filter(Boolean) as Tag[];
    },
    enabled: !!contactId,
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!contactId) throw new Error('Contact ID is required');

      const { error } = await supabase
        .from('contact_tags')
        .insert({ contact_id: contactId, tag_id: tagId });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-tags', contactId] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      if (!contactId) throw new Error('Contact ID is required');

      const { error } = await supabase
        .from('contact_tags')
        .delete()
        .eq('contact_id', contactId)
        .eq('tag_id', tagId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-tags', contactId] });
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  return {
    contactTags,
    isLoading,
    addTag: addTagMutation.mutateAsync,
    removeTag: removeTagMutation.mutateAsync,
  };
}