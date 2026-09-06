import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from 'sonner';
import { useGroupActions } from '../groups/actions';
import type { WhatsAppGroup, WhatsAppConnection } from '../groups/types';

// Re-export for external consumers
export type { WhatsAppGroup, WhatsAppConnection } from '../groups/types';
export { GROUP_CATEGORIES } from '../groups/types';

export function useGroupsManager() {
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('whatsapp_groups').select('*').order('name', { ascending: true });
    if (error) { toast.error('Erro ao carregar grupos'); log.error('Error fetching groups:', error); }
    else setGroups((data || []) as WhatsAppGroup[]);
    setIsLoading(false);
  }, []);

  const fetchConnections = useCallback(async () => {
    const { data, error } = await supabase.from('whatsapp_connections').select('id, name, phone_number, instance_id').order('name', { ascending: true });
    if (error) log.error('Error fetching connections:', error);
    else setConnections((data || []) as WhatsAppConnection[]);
  }, []);

  useEffect(() => { fetchGroups(); fetchConnections(); }, [fetchGroups, fetchConnections]);

  const actions = useGroupActions({ connections, groups, selectedGroups, setGroups, setSelectedGroups, fetchGroups });

  const filteredGroups = groups.filter((group) => {
    const matchesSearch = group.name.toLowerCase().includes(search.toLowerCase()) || group.group_id.includes(search);
    const matchesCategory = !categoryFilter || (categoryFilter === 'sem_categoria' ? !group.category : group.category === categoryFilter);
    return matchesSearch && matchesCategory;
  });

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const selectAllGroups = () => {
    if (selectedGroups.size === filteredGroups.length) setSelectedGroups(new Set());
    else setSelectedGroups(new Set(filteredGroups.map(g => g.id)));
  };

  const getConnectionName = (connectionId: string | null) => {
    if (!connectionId) return 'Não vinculado';
    return connections.find(c => c.id === connectionId)?.name || 'Desconhecido';
  };

  return {
    groups, connections, search, setSearch, categoryFilter, setCategoryFilter,
    isLoading, isSyncing, selectedGroups, filteredGroups,
    handleAutoSync: () => actions.handleAutoSync(setIsSyncing),
    handleAddGroup: actions.handleAddGroup,
    handleDeleteGroup: actions.handleDeleteGroup,
    handleBroadcast: actions.handleBroadcast,
    handleCategoryChange: actions.handleCategoryChange,
    toggleGroupSelection, selectAllGroups, getConnectionName,
  };
}
