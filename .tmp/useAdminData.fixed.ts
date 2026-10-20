import { useState, useCallback, useRef } from 'react';
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

// Mensagens claras para os erros levantados pela RPC `admin_set_role`
// (PostgREST devolve o texto do RAISE EXCEPTION em `error.message`).
const ROLE_CHANGE_ERROR_MESSAGES: Record<string, string> = {
  cannot_demote_self: 'Você não pode remover o próprio papel de administrador.',
  cannot_demote_last_admin: 'A instalação precisa de pelo menos um administrador.',
  admin_required: 'Apenas administradores podem alterar papéis.',
  jwt_session_required: 'Sessão expirada. Faça login novamente.',
};

function roleChangeErrorMessage(error: { message?: string }): string {
  const message = error.message ?? '';
  for (const [code, text] of Object.entries(ROLE_CHANGE_ERROR_MESSAGES)) {
    if (message.includes(code)) return text;
  }
  return 'Erro ao atualizar role';
}

export const accessLevelConfig: Record<string, { label: string; description: string }> = {
  basic: { label: 'Básico', description: 'Acesso apenas aos próprios atendimentos' },
  standard: { label: 'Padrão', description: 'Acesso a atendimentos e contatos atribuídos' },
  advanced: { label: 'Avançado', description: 'Acesso a relatórios e métricas da equipe' },
  full: { label: 'Completo', description: 'Acesso total ao sistema' },
};

// Item 1 (paridade V2/V3): a Edge `create-user` valida a senha com
// `z.string().min(8)` (supabase/functions/create-user/index.ts), mas o
// formulário do painel exigia só 6. A régua vem daqui para a tela usar o
// mesmo número e o mesmo texto.
export const MIN_PASSWORD_LENGTH = 8;

export const AUDIT_PAGE_SIZE = 50;

// Filtros da aba de auditoria (item 1): intervalo de datas inclusivo (dias
// inteiros, em UTC) e paginação 1-based. Quem chama (AdminView) monta o estado
// e passa adiante; o hook só monta a consulta.
export interface AuditLogFilter {
  /** Data inicial inclusiva, 'YYYY-MM-DD'. */
  from?: string;
  /** Data final inclusiva, 'YYYY-MM-DD'. */
  to?: string;
  /** Página 1-based. Padrão 1. */
  page?: number;
  /** Tamanho da página. Padrão AUDIT_PAGE_SIZE. */
  pageSize?: number;
}

export function useAdminData(activeTab: 'users' | 'audit' | 'crm', auditFilter?: AuditLogFilter) {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // Erro nunca pode virar lista vazia silenciosa (critério 1): o estado fica
  // na tela e o toast avisa quem operou.
  const [error, setError] = useState<string | null>(null);
  // Reentrância de desativação/reativação por usuário: evita que um duplo clique
  // no Switch dispare duas gravações concorrentes do mesmo perfil.
  const togglingRef = useRef<Set<string>>(new Set());

  // Dependências primitivas: evita refetch a cada render quando o chamador
  // passa um objeto de filtro inline.
  const auditFrom = auditFilter?.from;
  const auditTo = auditFilter?.to;
  const auditPage = Math.max(1, auditFilter?.page ?? 1);
  const auditPageSize = auditFilter?.pageSize ?? AUDIT_PAGE_SIZE;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (activeTab === 'users') {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, name, email, avatar_url, nickname, signature, job_title, department, phone, access_level, max_chats, can_download, is_active, created_at')
        .order('name');

      if (profilesError) {
        setError('Não foi possível carregar os usuários.');
        toast.error('Não foi possível carregar os usuários. Tente novamente.');
        setLoading(false);
        return;
      }

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) {
        setError('Não foi possível carregar os papéis dos usuários.');
        toast.error('Não foi possível carregar os papéis dos usuários. Tente novamente.');
        setLoading(false);
        return;
      }

      const usersWithRoles = (profiles ?? []).map(profile => {
        const userRole = (roles ?? []).find(r => r.user_id === profile.user_id);
        return {
          ...profile,
          role: (userRole?.role || 'agent') as AppRole,
        };
      });
      setUsers(usersWithRoles);
    } else if (activeTab === 'audit') {
      const start = (auditPage - 1) * auditPageSize;

      let query = supabase
        .from('audit_logs')
        .select('id, user_id, action, entity_type, details, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(start, start + auditPageSize - 1);

      if (auditFrom) query = query.gte('created_at', `${auditFrom}T00:00:00.000Z`);
      if (auditTo) query = query.lte('created_at', `${auditTo}T23:59:59.999Z`);

      const { data: logs, error: logsError, count } = await query;

      if (logsError) {
        setError('Não foi possível carregar a auditoria.');
        toast.error('Não foi possível carregar a auditoria. Tente novamente.');
        setLoading(false);
        return;
      }

      const rows = logs ?? [];
      const userIds = [...new Set(rows.map(l => l.user_id).filter((id): id is string => id !== null))];
      const { data: profiles, error: profilesError } = userIds.length > 0
        ? await supabase
          .from('profiles')
          .select('user_id, name, email')
          .in('user_id', userIds)
        : { data: [] as { user_id: string; name: string; email: string | null }[], error: null };

      if (profilesError) {
        // A auditoria carregou; só os nomes dos autores falharam — mostra os
        // registros sem nome em vez de esconder a lista inteira.
        toast.error('Não foi possível carregar os nomes dos autores.');
      }

      const logsWithUsers: AuditLog[] = rows.map(log => ({
        ...log,
        user: profiles?.find(p => p.user_id === log.user_id) || null,
      }));
      setAuditLogs(logsWithUsers);
      setAuditTotal(count ?? rows.length);
    }

    setLoading(false);
  }, [activeTab, auditFrom, auditTo, auditPage, auditPageSize]);

  // R2-AUTH-008 (item 74): a troca de papel vai pela RPC atômica
  // `admin_set_role` (SECURITY DEFINER). O caminho delete+insert era
  // não-transacional — se o INSERT falhava depois do DELETE, o usuário
  // ficava sem role. A RPC exige JWT real, autoriza só admin, protege
  // auto-rebaixamento e o último administrador, e faz INSERT/UPDATE atômico.
  const handleRoleChange = useCallback(async (userId: string, newRole: AppRole) => {
    const { error } = await supabase.rpc('admin_set_role', { _user_id: userId, _role: newRole });
    if (error) {
      toast.error(roleChangeErrorMessage(error));
      return;
    }
    toast.success(`Usuário agora é ${roleConfig[newRole].label}.`);
    fetchData();
  }, [fetchData]);

  const handleToggleActive = useCallback(async (user: UserWithRole) => {
    // R2-AUTH-004 (item 6): desativar deve depender da operação server-side
    // atômica — o trigger `trg_revoke_sessions_on_profile_deactivate` revoga as
    // sessões Auth do usuário quando `is_active` vira false. Aqui o frontend só
    // grava o campo; a revogação real é do backend. Reativar só volta `is_active`
    // para true e NÃO cria sessão (o trigger só dispara na transição para false).
    if (togglingRef.current.has(user.id)) return;
    togglingRef.current.add(user.id);
    try {
      const deactivating = user.is_active !== false;
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !deactivating })
        .eq('id', user.id);
      if (error) {
        toast.error('Erro ao atualizar status');
        return;
      }
      if (deactivating) {
        toast.success(
          'Usuário desativado. As sessões foram revogadas agora; um token de acesso já emitido pode continuar válido até expirar.'
        );
      } else {
        toast.success('Usuário reativado. Nenhuma sessão foi criada.');
      }
      fetchData();
    } finally {
      togglingRef.current.delete(user.id);
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
    // Mesma régua da Edge `create-user` (z.string().min(8)): o frontend não
    // pode aceitar senha que o backend vai recusar.
    if (payload.password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
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
    auditTotal,
    loading,
    error,
    fetchData,
    handleRoleChange,
    handleToggleActive,
    handleSaveUser,
    handleCreateUser,
  };
}
