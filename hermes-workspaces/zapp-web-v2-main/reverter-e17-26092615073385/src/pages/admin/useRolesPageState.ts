import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

export function useRolesPageState() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleType>('agent');
  const [availableUsers, setAvailableUsers] = useState<{ user_id: string; name: string; email: string }[]>([]);
  const [userToRemove, setUserToRemove] = useState<UserWithRole | null>(null);
  const [updating, setUpdating] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_roles')
      .select(`id, user_id, role, profiles!user_roles_user_id_fkey (name, email, avatar_url)`)
      .order('role');

    if (!error && data) {
      setUsers(data.map(u => ({
        id: u.id,
        user_id: u.user_id,
        role: u.role as RoleType,
        profile: Array.isArray(u.profiles) ? u.profiles[0] : u.profiles
      })));
    }
    setLoading(false);
  };

  const fetchAvailableUsers = async () => {
    const { data } = await supabase.from('profiles').select('user_id, name, email').order('name');
    if (data) {
      const usersWithRoles = users.map(u => u.user_id);
      setAvailableUsers(data.filter(u => !usersWithRoles.includes(u.user_id)) as { user_id: string; name: string; email: string }[]);
    }
  };

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { if (showAddDialog) fetchAvailableUsers(); }, [showAddDialog, users]);

  const handleAddRole = async () => {
    if (!selectedUser || !selectedRole) return;
    setUpdating(true);
    const { error } = await supabase.from('user_roles').insert({ user_id: selectedUser, role: selectedRole });
    if (error) toast.error('Erro ao adicionar role');
    else { toast.success('Role adicionada com sucesso'); setShowAddDialog(false); setSelectedUser(''); fetchUsers(); }
    setUpdating(false);
  };

  const handleRemoveRole = async () => {
    if (!userToRemove) return;
    setUpdating(true);
    const { error } = await supabase.from('user_roles').delete().eq('id', userToRemove.id);
    if (error) toast.error('Erro ao remover role');
    else { toast.success('Role removida com sucesso'); setUserToRemove(null); fetchUsers(); }
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
    users, loading, search, setSearch, showAddDialog, setShowAddDialog,
    selectedUser, setSelectedUser, selectedRole, setSelectedRole,
    availableUsers, userToRemove, setUserToRemove, updating,
    handleAddRole, handleRemoveRole, groupedUsers,
  };
}
