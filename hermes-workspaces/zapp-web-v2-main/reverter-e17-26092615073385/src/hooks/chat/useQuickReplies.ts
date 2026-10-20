import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from 'sonner';
import { log } from '@/lib/logger';

export interface QuickReplyTemplate {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  category: string | null;
  is_global: boolean | null;
  use_count: number | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface QuickReplyFavorite {
  id: string;
  templateId: string;
  order: number;
}

export interface CreateTemplateInput {
  title: string;
  content: string;
  shortcut?: string;
  category?: string;
  is_global?: boolean;
}

const FAVORITES_STORAGE_KEY = 'quick-reply-favorites';

export function useQuickReplies() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch templates from Supabase
  const { data: templates, isLoading, error, refetch } = useQuery({
    queryKey: ['quick-replies', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .or(`user_id.eq.${user.id},is_global.eq.true`)
        .order('use_count', { ascending: false });

      if (error) throw error;
      return data as QuickReplyTemplate[];
    },
    enabled: !!user?.id,
  });

  // Local favorites storage (synced with localStorage for persistence)
  const [favorites, setFavorites] = useState<QuickReplyFavorite[]>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Save favorites to localStorage
  const saveFavorites = useCallback((newFavorites: QuickReplyFavorite[]) => {
    setFavorites(newFavorites);
    try { localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(newFavorites)); } catch { /* storage unavailable */ }
  }, []);

  // Toggle favorite
  const toggleFavorite = useCallback((templateId: string) => {
    const isFav = favorites.some(f => f.templateId === templateId);
    
    if (isFav) {
      const newFavorites = favorites.filter(f => f.templateId !== templateId);
      saveFavorites(newFavorites);
      toast.success('Removido dos favoritos');
    } else {
      const newFavorite: QuickReplyFavorite = {
        id: crypto.randomUUID(),
        templateId,
        order: favorites.length,
      };
      saveFavorites([...favorites, newFavorite]);
      toast.success('Adicionado aos favoritos');
    }
  }, [favorites, saveFavorites]);

  // Check if template is favorite
  const isFavorite = useCallback((templateId: string) => {
    return favorites.some(f => f.templateId === templateId);
  }, [favorites]);

  // Reorder favorites
  const reorderFavorites = useCallback((fromIndex: number, toIndex: number) => {
    const result = Array.from(favorites);
    const [removed] = result.splice(fromIndex, 1);
    result.splice(toIndex, 0, removed);
    const reordered = result.map((f, index) => ({ ...f, order: index }));
    saveFavorites(reordered);
  }, [favorites, saveFavorites]);

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('message_templates')
        .insert({
          title: input.title,
          content: input.content,
          shortcut: input.shortcut || null,
          category: input.category || 'geral',
          is_global: input.is_global || false,
          user_id: user.id,
          use_count: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      toast.success('Resposta rápida criada!');
    },
    onError: (error) => {
      toast.error('Erro ao criar resposta rápida');
      log.error('Error creating quick reply:', error);
    },
  });

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<CreateTemplateInput>) => {
      const { data, error } = await supabase
        .from('message_templates')
        .update({
          title: input.title,
          content: input.content,
          shortcut: input.shortcut,
          category: input.category,
          is_global: input.is_global,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      toast.success('Resposta rápida atualizada!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar resposta rápida');
      log.error('Error updating quick reply:', error);
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('message_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      // Also remove from favorites
      const newFavorites = favorites.filter(f => f.templateId !== id);
      saveFavorites(newFavorites);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
      toast.success('Resposta rápida excluída!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir resposta rápida');
      log.error('Error deleting quick reply:', error);
    },
  });

  // Increment use count
  const incrementUseCount = useCallback(async (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (!template) return;

    await supabase
      .from('message_templates')
      .update({ use_count: (template.use_count || 0) + 1 })
      .eq('id', templateId);

    queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
  }, [templates, queryClient]);

  // Smart search with fuzzy matching
  const searchTemplates = useCallback((query: string) => {
    if (!templates) return [];
    if (!query.trim()) return templates;

    const lowerQuery = query.toLowerCase();
    
    return templates.filter(t => {
      const titleMatch = t.title.toLowerCase().includes(lowerQuery);
      const contentMatch = t.content.toLowerCase().includes(lowerQuery);
      const shortcutMatch = t.shortcut?.toLowerCase().includes(lowerQuery);
      const categoryMatch = t.category?.toLowerCase().includes(lowerQuery);
      
      return titleMatch || contentMatch || shortcutMatch || categoryMatch;
    }).sort((a, b) => {
      // Prioritize title matches
      const aTitle = a.title.toLowerCase().includes(lowerQuery);
      const bTitle = b.title.toLowerCase().includes(lowerQuery);
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      
      // Then by use count
      return (b.use_count || 0) - (a.use_count || 0);
    });
  }, [templates]);

  // Filtered templates based on search
  const filteredTemplates = useMemo(() => {
    return searchTemplates(searchQuery);
  }, [searchQuery, searchTemplates]);

  // Favorite templates
  const favoriteTemplates = useMemo(() => {
    if (!templates) return [];
    
    return favorites
      .map(f => templates.find(t => t.id === f.templateId))
      .filter(Boolean) as QuickReplyTemplate[];
  }, [templates, favorites]);

  // Categories list
  const categories = useMemo(() => {
    if (!templates) return [];
    
    const cats = new Set(templates.map(t => t.category || 'geral'));
    return Array.from(cats).sort();
  }, [templates]);

  // Recent templates (most used)
  const recentTemplates = useMemo(() => {
    if (!templates) return [];
    
    return [...templates]
      .sort((a, b) => (b.use_count || 0) - (a.use_count || 0))
      .slice(0, 5);
  }, [templates]);

  // Convert to QuickReply format for compatibility
  const quickReplies = useMemo(() => {
    if (!templates) return [];
    
    return templates.map((t) => ({
      id: t.id,
      title: t.title,
      shortcut: t.shortcut || `/${t.title.toLowerCase().replace(/\s+/g, '-')}`,
      content: t.content,
      category: t.category || 'geral',
    }));
  }, [templates]);

  return {
    // Data
    templates,
    quickReplies,
    filteredTemplates,
    favoriteTemplates,
    recentTemplates,
    categories,
    favorites,
    
    // State
    isLoading,
    error,
    searchQuery,
    setSearchQuery,
    
    // Actions
    refetch,
    incrementUseCount,
    createTemplate: createMutation.mutateAsync,
    updateTemplate: updateMutation.mutateAsync,
    deleteTemplate: deleteMutation.mutateAsync,
    
    // Favorites
    toggleFavorite,
    isFavorite,
    reorderFavorites,
    
    // Search
    searchTemplates,
    
    // Loading states
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
