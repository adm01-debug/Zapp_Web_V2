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

/**
 * R2-AUTH-036: as duas mutações passam por RPC, e as RPCs recusam com códigos
 * próprios (`RAISE EXCEPTION 'cannot_demote_last_admin'`). O PostgREST devolve
 * o código em `error.message`, então cada trava tem um texto em pt-BR; código
 * desconhecido cai na mensagem genérica e NUNCA vaza o erro cru para a tela.
 */
const MENSAGENS_RPC: Record<string, string> = {
  jwt_session_required: 'Sessão expirada. Entre novamente para alterar roles.',
  admin_required: 'Apenas administradores podem alterar roles.',
  role_already_assigned: 'Este usuário já possui esta role.',
  cannot_demote_last_admin: 'Não é possível remover o último administrador.',
  cannot_remove_own_admin: 'Você não pode remover a sua própria role de administrador.',
  role_not_assigned: 'Este usuário não possui esta role.',
};

function textoDoErro(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return '';
}

function mensagemDaRpc(error: unknown, fallback: string): string {
  const texto = textoDoErro(error);
  for (const [codigo, mensagem] of Object.entries(MENSAGENS_RPC)) {
    if (texto.includes(codigo)) return mensagem;
  }
  if (texto) console.warn('[roles] RPC recusada com código não mapeado:', texto);
  return fallback;
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
    try {
      // RPC irmã de admin_set_role: única concessão com autoria garantida.
      const { error } = await supabase.rpc('admin_add_role', {
        _user_id: selectedUser,
        _role: selectedRole,
      });
      if (error) {
        toast.error(mensagemDaRpc(error, 'Erro ao adicionar role'));
        return;
      }
      toast.success('Role adicionada com sucesso');
      setShowAddDialog(false);
      setSelectedUser('');
      void fetchUsers(); // invalida o cache de papéis (recarga da lista)
    } catch (error) {
      toast.error(mensagemDaRpc(error, 'Erro ao adicionar role'));
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveRole = async () => {
    if (!userToRemove) return;
    setUpdating(true);
    try {
      const { error } = await supabase.rpc('admin_remove_role', {
        _user_id: userToRemove.user_id,
        _role: userToRemove.role,
      });
      if (error) {
        toast.error(mensagemDaRpc(error, 'Erro ao remover role'));
        return;
      }
      toast.success('Role removida com sucesso');
      setUserToRemove(null);
      void fetchUsers(); // invalida o cache de papéis (recarga da lista)
    } catch (error) {
      toast.error(mensagemDaRpc(error, 'Erro ao remover role'));
    } finally {
      setUpdating(false);
    }
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
