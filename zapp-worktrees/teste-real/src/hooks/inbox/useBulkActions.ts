/**
 * Hook para Ações em Massa
 * 
 * @module hooks/useBulkActions
 * @description Gerenciamento de seleção e ações em múltiplos itens
 */

import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fromTable } from '@/lib/supabaseHelpers';
import { toast } from 'sonner';

// ============================================
// TIPOS
// ============================================

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'destructive' | 'outline';
  action: (items: T[]) => Promise<void>;
  confirm?: {
    title: string;
    description: string;
  };
}

interface UseBulkActionsOptions<T> {
  tableName?: string;
  queryKey?: string[];
  actions?: BulkAction<T>[];
  onActionComplete?: () => void;
}

interface UseBulkActionsResult<T> {
  selectedIds: Set<string>;
  selectedItems: T[];
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  selectOne: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  toggleSelection: (id: string) => void;
  isSelected: (id: string) => boolean;
  executeAction: (actionId: string) => Promise<void>;
  availableActions: BulkAction<T>[];
  isExecuting: boolean;
  hasSelection: boolean;
  selectionCount: number;
}

// ============================================
// HOOK
// ============================================

export function useBulkActions<T extends { id: string }>(
  items: T[],
  options: UseBulkActionsOptions<T> = {}
): UseBulkActionsResult<T> {
  const { tableName, queryKey, actions = [], onActionComplete } = options;
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isPartiallySelected = selectedIds.size > 0 && selectedIds.size < items.length;
  const hasSelection = selectedIds.size > 0;

  const selectOne = useCallback((id: string) => {
    setSelectedIds((prev) => new Set([...prev, id]));
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map((item) => item.id)));
  }, [items]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const defaultActions: BulkAction<T>[] = useMemo(() => {
    if (!tableName) return [];

    return [
      {
        id: 'delete',
        label: 'Excluir Selecionados',
        variant: 'destructive' as const,
        confirm: {
          title: 'Confirmar Exclusão',
          description: `Tem certeza que deseja excluir ${selectedIds.size} item(s)? Esta ação não pode ser desfeita.`,
        },
        action: async (actionItems: T[]) => {
          const ids = actionItems.map((i) => i.id);
          const { error } = await fromTable(tableName)
            .delete()
            .in('id', ids);
          
          if (error) throw error;
          toast.success(`${ids.length} item(s) excluído(s)`);
        },
      },
      {
        id: 'archive',
        label: 'Arquivar Selecionados',
        variant: 'outline' as const,
        action: async (actionItems: T[]) => {
          const ids = actionItems.map((i) => i.id);
          const { error } = await fromTable(tableName)
            .update({ status: 'archived', updated_at: new Date().toISOString() } as Record<string, unknown>)
            .in('id', ids);
          
          if (error) throw error;
          toast.success(`${ids.length} item(s) arquivado(s)`);
        },
      },
    ];
  }, [tableName, selectedIds.size]);

  const availableActions = useMemo(
    () => [...defaultActions, ...actions],
    [defaultActions, actions]
  );

  const executeAction = useCallback(async (actionId: string) => {
    const action = availableActions.find((a) => a.id === actionId);
    if (!action || selectedItems.length === 0) return;

    setIsExecuting(true);

    try {
      await action.action(selectedItems);
      
      if (queryKey) {
        await queryClient.invalidateQueries({ queryKey });
      }

      deselectAll();
      onActionComplete?.();
    } catch (error) {
      toast.error(`Erro ao executar ação: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    } finally {
      setIsExecuting(false);
    }
  }, [availableActions, selectedItems, queryClient, queryKey, deselectAll, onActionComplete]);

  return {
    selectedIds,
    selectedItems,
    isAllSelected,
    isPartiallySelected,
    selectOne,
    selectAll,
    deselectAll,
    toggleSelection,
    isSelected,
    executeAction,
    availableActions,
    isExecuting,
    hasSelection,
    selectionCount: selectedIds.size,
  };
}

export default useBulkActions;
