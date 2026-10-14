import { useState, useMemo, useCallback, useEffect } from 'react';
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

/** Chave legada, sem escopo de usuário: a lista vazava entre contas no mesmo navegador. */
const LEGACY_FAVORITES_KEY = 'quick-reply-favorites';

/** Convenção da casa: `zapp.<area>:<userId>` — o favorito é do usuário, não do navegador. */
export function quickReplyFavoritesKey(userId: string): string {
  return `zapp.quickreplies.favorites:${userId}`;
}

function readFavorites(key: string | null): QuickReplyFavorite[] {
  if (!key) return [];
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as QuickReplyFavorite[]) : [];
  } catch {
    return [];
  }
}

/** Favoritos gravados antes do escopo por usuário não são lidos; o legado é removido sem leitura. */
function purgeLegacyFavorites(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key === LEGACY_FAVORITES_KEY) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch { /* storage unavailable */ }
}

/** Normalize text for accent-insensitive search (mesma regra da `normalizeText` do chat). */
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function useQuickReplies() {
  const { user } = useAuth();
  const userId = user?.id;
  const favoritesKey = userId ? quickReplyFavoritesKey(userId) : null;
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

  useEffect(() => {
    purgeLegacyFavorites();
  }, []);

  // Favoritos por usuário: a lista guardada diz de quem é (`key`); se a conta trocou,
  // ela é relida do storage do novo dono em vez de vazar a do dono anterior.
  const [favoritesState, setFavoritesState] = useState<{ key: string | null; list: QuickReplyFavorite[] }>(
    () => ({ key: favoritesKey, list: readFavorites(favoritesKey) }),
  );
  const favorites = favoritesState.key === favoritesKey
    ? favoritesState.list
    : readFavorites(favoritesKey);

  // Save favorites to localStorage (só do usuário atual)
  const saveFavorites = useCallback((newFavorites: QuickReplyFavorite[]) => {
    setFavoritesState({ key: favoritesKey, list: newFavorites });
    if (!favoritesKey) return;
    try { localStorage.setItem(favoritesKey, JSON.stringify(newFavorites)); } catch { /* storage unavailable */ }
  }, [favoritesKey]);

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

  // Increment use count — contagem atômica no servidor (RPC do PH-10)
  const incrementUseCount = useCallback(async (templateId: string) => {
    const template = templates?.find((t) => t.id === templateId);
    if (!template) return;

    // A RPC soma no banco e só toca linha visível ao chamador (dono ou global).
    const { error } = await (supabase as any).rpc('increment_quick_reply_use', { p_id: templateId }); // eslint-disable-line @typescript-eslint/no-explicit-any -- RPC nova (PH-10, cartão pai t_32034c99), types.ts ainda não sincronizado
    if (error) {
      toast.error('Erro ao registrar o uso da resposta rápida');
      log.error('Error incrementing quick reply use:', error);
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['quick-replies'] });
  }, [templates, queryClient]);

  // Smart search with fuzzy matching (sem acento: 'saudacao' acha 'Saudação')
  const searchTemplates = useCallback((query: string) => {
    if (!templates) return [];
    if (!query.trim()) return templates;

    const lowerQuery = normalizeText(query);
    
    return templates.filter(t => {
      const titleMatch = normalizeText(t.title).includes(lowerQuery);
      const contentMatch = normalizeText(t.content).includes(lowerQuery);
      const shortcutMatch = t.shortcut ? normalizeText(t.shortcut).includes(lowerQuery) : false;
      const categoryMatch = t.category ? normalizeText(t.category).includes(lowerQuery) : false;
      
      return titleMatch || contentMatch || shortcutMatch || categoryMatch;
    }).sort((a, b) => {
      // Prioritize title matches
      const aTitle = normalizeText(a.title).includes(lowerQuery);
      const bTitle = normalizeText(b.title).includes(lowerQuery);
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
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
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
