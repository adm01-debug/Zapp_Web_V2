import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { loadRolesWithProfiles } from './loadRolesWithProfiles';

type RoleType = 'admin' | 'supervisor' | 'agent' | 'special_agent';

export interface UserWithRole {
  id: string;
  user_id: string;
  role: RoleType;
  profile?: {
    name: string;
    email: string | null;
    avatar_url: string | null;
  };
}

/**
 * O carregador lança o erro do PostgREST, que NÃO é instância de `Error` (é um
 * objeto com `message`). Sem ler esse campo, a mensagem exibida ficaria genérica.
 */
function mensagemDoErro(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return 'Não foi possível carregar as roles.';
}

export function useRolesPageState() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  // R2-AUTH-035: a falha do carregador não pode virar lista vazia — isso comunica
  // "nenhum usuário" quando na verdade a consulta quebrou. O erro fica explícito
  // e a página troca os cartões de roles por um estado de falha com nova tentativa.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleType>('agent');
  const [availableUsers, setAvailableUsers] = useState<{ user_id: string; name: string; email: string }[]>([]);
  const [userToRemove, setUserToRemove] = useState<UserWithRole | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const roles = await loadRolesWithProfiles();
      setUsers(roles.map((role) => ({
        id: role.id,
        user_id: role.user_id,
        role: role.role,
        profile: role.profile,
      })));
      setLoadError(null);
    } catch (error) {
      setLoadError(mensagemDoErro(error));
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableUsers = async () => {
    const { data } = await supabase.from('profiles').select('user_id, name, email').order('name');
    if (data) {
      const usersWithRoles = users.map(u => u.user_id);
      setAvailableUsers(data.filter(u => !usersWithRoles.includes(u.user_id)) as { user_id: string; name: string; email: string }[]);
    }
  };

  useEffect(() => { void fetchUsers(); }, []);
  useEffect(() => { if (showAddDialog) void fetchAvailableUsers(); }, [showAddDialog, users]);

  const handleAddRole = async () => {
    if (!selectedUser || !selectedRole) return;
    setUpdating(true);
    const { error } = await supabase.from('user_roles').insert({ user_id: selectedUser, role: selectedRole });
    if (error) toast.error('Erro ao adicionar role');
    else { toast.success('Role adicionada com sucesso'); setShowAddDialog(false); setSelectedUser(''); void fetchUsers(); }
    setUpdating(false);
  };

  const handleRemoveRole = async () => {
    if (!userToRemove) return;
    setUpdating(true);
    const { error } = await supabase.from('user_roles').delete().eq('id', userToRemove.id);
    if (error) toast.error('Erro ao remover role');
    else { toast.success('Role removida com sucesso'); setUserToRemove(null); void fetchUsers(); }
    setUpdating(false);
  };

  const filteredUsers = useMemo(() =>
    users.filter(u =>
      u.profile?.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.profile?.email?.toLowerCase().includes(search.toLowerCase())
    ), [users, search]);

  const groupedUsers = useMemo(() => ({
    admin: filteredUsers.filter(u => u.role === 'admin'),
    supervisor: filteredUsers.filter(u => u.role === 'supervisor'),
    special_agent: filteredUsers.filter(u => u.role === 'special_agent'),
    agent: filteredUsers.filter(u => u.role === 'agent'),
  }), [filteredUsers]);

  return {
    users, loading, loadError, retryLoad: fetchUsers,
    search, setSearch, showAddDialog, setShowAddDialog,
    selectedUser, setSelectedUser, selectedRole, setSelectedRole,
    availableUsers, userToRemove, setUserToRemove, updating,
    handleAddRole, handleRemoveRole, groupedUsers,
  };
}
