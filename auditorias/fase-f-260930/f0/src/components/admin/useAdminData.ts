import { useState, useCallback } from 'react';
import { supabase, SUPABASE_URL } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { AppRole } from '@/hooks/system/useUserRole';

export interface UserWithRole {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  nickname: string | null;
  signature: string | null;
  role: AppRole;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  access_level: string | null;
  max_chats: number | null;
  can_download: boolean;
  is_active: boolean | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  details: unknown;
  created_at: string;
  user?: { name: string; email: string | null } | null;
}

export const roleConfig: Record<AppRole, { label: string; icon: string; color: string }> = {
  admin: { label: 'Administrador', icon: 'Crown', color: 'text-warning' },
  supervisor: { label: 'Supervisor', icon: 'UserCog', color: 'text-info' },
  agent: { label: 'Atendente', icon: 'User', color: 'text-muted-foreground' },
  special_agent: { label: 'Agente Especial', icon: 'Eye', color: 'text-accent-foreground' },
};

export const accessLevelConfig: Record<string, { label: string; description: string }> = {
  basic: { label: 'Básico', description: 'Acesso apenas aos próprios atendimentos' },
  standard: { label: 'Padrão', description: 'Acesso a atendimentos e contatos atribuídos' },
  advanced: { label: 'Avançado', description: 'Acesso a relatórios e métricas da equipe' },
  full: { label: 'Completo', description: 'Acesso total ao sistema' },
};

export function useAdminData(activeTab: 'users' | 'audit' | 'crm') {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    if (activeTab === 'users') {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('name');

      const { data: roles } = await supabase
        .from('user_roles')
        .select('*');

      if (profiles && roles) {
        const usersWithRoles = profiles.map(profile => {
          const userRole = roles.find(r => r.user_id === profile.user_id);
          return {
            ...profile,
            role: (userRole?.role || 'agent') as AppRole,
          };
        });
        setUsers(usersWithRoles);
      }
    } else if (activeTab === 'audit') {
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (logs) {
        const userIds = [...new Set(logs.map(l => l.user_id).filter((id): id is string => id !== null))];
        const { data: profiles } = userIds.length > 0
          ? await supabase
            .from('profiles')
            .select('user_id, name, email')
            .in('user_id', userIds)
          : { data: [] };

        const logsWithUsers: AuditLog[] = logs.map(log => ({
          ...log,
          user: profiles?.find(p => p.user_id === log.user_id) || null,
        }));
        setAuditLogs(logsWithUsers);
      }
    }

    setLoading(false);
  }, [activeTab]);

  const handleRoleChange = useCallback(async (userId: string, newRole: AppRole) => {
    await supabase.from('user_roles').delete().eq('user_id', userId);
    const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole });
    if (error) {
      toast.error('Erro ao atualizar role');
    } else {
      toast.success(`Usuário agora é ${roleConfig[newRole].label}.`);
      fetchData();
    }
  }, [fetchData]);

  const handleToggleActive = useCallback(async (user: UserWithRole) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: !user.is_active })
      .eq('id', user.id);
    if (error) {
      toast.error('Erro ao atualizar status');
    } else {
      toast.success(user.is_active ? 'Usuário desativado' : 'Usuário ativado');
      fetchData();
    }
  }, [fetchData]);

  const handleSaveUser = useCallback(async (
    editingUser: UserWithRole,
    avatarFile: File | null,
  ): Promise<boolean> => {
    let avatarUrl = editingUser.avatar_url;
    if (avatarFile) {
      const fileExt = avatarFile.name.split('.').pop();
      const filePath = `${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, avatarFile);
      if (uploadError) {
        toast.error('Erro ao enviar foto');
        return false;
      }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      avatarUrl = urlData.publicUrl;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        name: editingUser.name,
        nickname: editingUser.nickname,
        signature: editingUser.signature,
        job_title: editingUser.job_title,
        department: editingUser.department,
        phone: editingUser.phone,
        avatar_url: avatarUrl,
        access_level: editingUser.access_level,
        max_chats: editingUser.max_chats,
        can_download: editingUser.can_download,
      })
      .eq('id', editingUser.id);

    if (error) {
      toast.error('Erro ao salvar usuário');
      return false;
    }
    toast.success('Usuário atualizado com sucesso');
    fetchData();
    return true;
  }, [fetchData]);

  interface CreateUserPayload {
    name: string;
    nickname?: string;
    signature?: string;
    job_title?: string;
    avatarFile?: File | null;
    email: string;
    password: string;
    role: AppRole;
    gmail_email?: string;
    google_services?: string[];
    dropbox_email?: string;
  }

  const handleCreateUser = useCallback(async (payload: CreateUserPayload): Promise<boolean> => {
    if (!payload.name || !payload.email || !payload.password) {
      toast.error('Preencha todos os campos obrigatórios');
      return false;
    }
    if (payload.password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return false;
    }

    let avatarUrl: string | undefined;
    if (payload.avatarFile) {
      const fileExt = payload.avatarFile.name.split('.').pop();
      const filePath = `${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, payload.avatarFile);
      if (uploadError) {
        toast.error('Erro ao fazer upload da foto');
        return false;
      }
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      avatarUrl = urlData.publicUrl;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            name: payload.name,
            nickname: payload.nickname || undefined,
            signature: payload.signature || undefined,
            job_title: payload.job_title || undefined,
            avatar_url: avatarUrl,
            email: payload.email,
            password: payload.password,
            role: payload.role,
            gmail_email: payload.gmail_email || undefined,
            google_services: payload.google_services,
            dropbox_email: payload.dropbox_email || undefined,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || 'Erro ao criar usuário');
        return false;
      }
      toast.success('Usuário criado com sucesso!');
      fetchData();
      return true;
    } catch {
      toast.error('Erro ao criar usuário');
      return false;
    }
  }, [fetchData]);

  return {
    users,
    auditLogs,
    loading,
    fetchData,
    handleRoleChange,
    handleToggleActive,
    handleSaveUser,
    handleCreateUser,
  };
}
