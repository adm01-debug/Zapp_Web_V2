/**
 * Hook para Filtros Salvos
 * 
 * @module hooks/useSavedFilters
 * @description Gerencia filtros salvos por usuário e entidade
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ============================================
// TIPOS
// ============================================

export interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  is_default: boolean;
  is_shared: boolean;
  user_id: string;
  created_at: string;
}

interface SaveFilterInput {
  name: string;
  filters: Record<string, unknown>;
  is_default?: boolean;
  is_shared?: boolean;
}

// ============================================
// HOOK
// ============================================

export function useSavedFilters(entityType: string) {
  const queryClient = useQueryClient();
  const queryKey = ['saved-filters', entityType];

  // Listar filtros salvos (próprios + compartilhados)
  const { data: filters = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Fetch own filters + shared filters from others
      const { data, error } = await supabase
        .from('saved_filters')
        .select('*')
        .eq('entity_type', entityType)
        .or(`user_id.eq.${user.id},is_shared.eq.true`)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as SavedFilter[];
    },
  });

  // Obter filtro padrão
  const defaultFilter = filters.find(f => f.is_default);

  // Salvar novo filtro
  const saveMutation = useMutation({
    mutationFn: async (input: SaveFilterInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Se marcado como padrão, remove padrão dos outros
      if (input.is_default) {
        await supabase
          .from('saved_filters')
          .update({ is_default: false })
          .eq('user_id', user.id)
          .eq('entity_type', entityType);
      }

      const { data, error } = await supabase
        .from('saved_filters')
        .insert({
          user_id: user.id,
          entity_type: entityType,
          name: input.name,
          filters: input.filters as unknown as import('@/integrations/supabase/types').Json,
          is_default: input.is_default ?? false,
          is_shared: input.is_shared ?? false,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Filtro salvo com sucesso!');
    },
    onError: (error) => {
      toast.error(`Erro ao salvar filtro: ${error.message}`);
    },
  });

  // Atualizar filtro
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...input }: SaveFilterInput & { id: string }) => {
      const updateData = { ...input, filters: input.filters as unknown as import('@/integrations/supabase/types').Json };
      const { error } = await supabase
        .from('saved_filters')
        .update(updateData)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Filtro atualizado!');
    },
  });

  // Deletar filtro
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('saved_filters')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Filtro removido');
    },
    onError: (error) => {
      toast.error(`Erro ao remover: ${error.message}`);
    },
  });

  // Definir como padrão
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Remove padrão de todos
      await supabase
        .from('saved_filters')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('entity_type', entityType);
      
      // Define novo padrão
      const { error } = await supabase
        .from('saved_filters')
        .update({ is_default: true })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success('Filtro padrão definido');
    },
  });

  // Alternar compartilhamento
  const shareMutation = useMutation({
    mutationFn: async ({ id, is_shared }: { id: string; is_shared: boolean }) => {
      const { error } = await supabase
        .from('saved_filters')
        .update({ is_shared })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey });
      toast.success(variables.is_shared ? 'Filtro compartilhado com a equipe!' : 'Filtro deixou de ser compartilhado');
    },
  });

  return {
    filters,
    isLoading,
    defaultFilter,
    saveFilter: saveMutation.mutate,
    updateFilter: updateMutation.mutate,
    deleteFilter: deleteMutation.mutate,
    setDefault: setDefaultMutation.mutate,
    toggleShare: shareMutation.mutate,
    isSaving: saveMutation.isPending,
  };
}

export default useSavedFilters;
