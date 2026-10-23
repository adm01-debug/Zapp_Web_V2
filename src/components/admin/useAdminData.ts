import { useState, useCallback, useRef } from 'react';
// eslint-disable-next-line no-restricted-imports
import { supabase, SUPABASE_URL} from '@/integrations/supabase/client';
import { parseSupabaseStorageObjectUrl } from '@/lib/storage_object_reference';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';
import { describeAccessError, isAccessDeniedError } from '@/lib/rlsError';
import type { AppRole } from '@/hooks/system/useUserRole';
import { invokeEdge, readEdgeError } from '@/lib/invokeEdge';

const log = getLogger('useAdminData');

const AVATAR_BUCKET = 'avatars';
// Mesma validade curta usada no AvatarUpload: o perfil guarda só o caminho e a
// tela assina a URL sob demanda — o bucket `avatars` deixou de ser público.
const AVATAR_SIGNED_URL_TTL_SECONDS = 300;

function isStorageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Devolve o caminho durável do objeto a partir de uma URL assinada (ou do próprio caminho).
 * URL http que não é do bucket `avatars` devolve null: nunca gravamos URL http
 * em profiles.avatar_url (o bucket é privado e a URL assinada expira). */
function avatarObjectPath(value: string | null): string | null {
  if (!value || !isStorageUrl(value)) return value;
  try {
    const origin = new URL(SUPABASE_URL).origin;
    return parseSupabaseStorageObjectUrl(value, [AVATAR_BUCKET], [origin])?.path ?? null;
  } catch {
    return null;
  }
}

export interface UserWithRole {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: AppRole;
  is_active: boolean;
  avatar_url: string | null;
  nickname?: string | null;
  signature?: string | null;
  job_title?: string | null;
  department?: string | null;
  phone?: string | null;
  access_level?: string;
  max_chats?: number;
  can_download?: boolean;
  created_at?: string;
}

export interface CreateUserFieldError {
  field: 'email' | 'password' | 'name' | 'role' | null;
  message: string;
}

export const MIN_PASSWORD_LENGTH = 8;
export const AUDIT_PAGE_SIZE = 50;

export const accessLevelConfig = {
  basic: { label: 'Básico', description: '' },
  standard: { label: 'Padrão', description: '' },
  advanced: { label: 'Avançado', description: '' },
  full: { label: 'Completo', description: '' },
};

export function mapCreateUserError(rawMessage: string | undefined): CreateUserFieldError {
  if (!rawMessage) return { field: null, message: 'Erro ao criar usuário' };
  const msg = rawMessage.toLowerCase();
  if (msg.includes('already') || msg.includes('registered')) return { field: 'email', message: 'Este e-mail já está cadastrado.' };
  if (msg.includes('enum')) return { field: 'role', message: 'Papel de usuário inválido.' };
  if (msg.includes('email') || msg.includes('e-mail')) return { field: 'email', message: 'Informe um e-mail válido.' };
  if (msg.includes('senha') || msg.includes('password')) return { field: 'password', message: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  if (msg.includes('nome') || msg.includes('name')) return { field: 'name', message: 'Informe o nome do usuário.' };
  return { field: null, message: 'Erro ao criar usuário' };
}

interface AuditParams {
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function translateRoleChangeError(error: { code?: string; message?: string }): string {
  if (error.code === '42501') return 'Acesso negado.';
  const msg = error.message ?? '';
  if (msg.includes('cannot_demote_self')) return 'Você não pode remover o próprio papel de administrador.';
  if (msg.includes('cannot_demote_last_admin')) return 'A instalação precisa de pelo menos um administrador.';
  return 'Erro ao atualizar papel.';
}

export function useAdminData(tab: string = 'users', auditParams?: AuditParams) {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<unknown[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [createUserError, setCreateUserError] = useState<CreateUserFieldError | null>(null);
  const deletingIdRef = useRef<string | null>(null);
  const inFlightToggleRef = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'users') {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, name, email, role, is_active, avatar_url')
          .order('name', { ascending: true });
        if (profileError) {
          const msg = (profileError as { message?: string }).message ?? 'Erro ao carregar usuários';
          setError(msg);
          if (isAccessDeniedError(profileError)) {
            toast.error(describeAccessError(profileError, 'Usuários'));
          } else {
            toast.error('Erro ao carregar usuários');
          }
          setUsers([]);
          return;
        }
        const { error: roleError } = await supabase.from('user_roles').select('*');
        if (roleError) {
          const msg = (roleError as { message?: string }).message ?? 'Erro ao carregar usuários';
          setError(msg);
          toast.error('Erro ao carregar usuários');
          return;
        }
        const raw = (profileData ?? []).map((u: { id: string }) => ({ ...u, user_id: u.id })) as UserWithRole[];
        const signed = await Promise.all(
          raw.map(async (u) => {
            const path = avatarObjectPath(u.avatar_url);
            if (!path) return u;
            const { data: signedData } = await supabase.storage
              .from(AVATAR_BUCKET)
              .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);
            return { ...u, avatar_url: signedData?.signedUrl ?? null };
          })
        );
        setUsers(signed);
      } else if (tab === 'audit') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = supabase
          .from('audit_logs')
          .select('id, user_id, action, entity_type, details, created_at', { count: 'exact' });
        if (auditParams?.from) {
          const fromDate = new Date(`${auditParams.from}T00:00:00`);
          query = query.gte('created_at', fromDate.toISOString());
        }
        if (auditParams?.to) {
          const toDate = new Date(`${auditParams.to}T23:59:59.999`);
          query = query.lte('created_at', toDate.toISOString());
        }
        const page = auditParams?.page ?? 1;
        const pageSize = auditParams?.pageSize ?? AUDIT_PAGE_SIZE;
        const rangeFrom = (page - 1) * pageSize;
        query = query.range(rangeFrom, rangeFrom + pageSize - 1);
        const { data, error: auditError, count } = await query;
        if (auditError) {
          const msg = (auditError as { message?: string }).message ?? 'Erro ao carregar auditoria';
          setError(msg);
          toast.error('Erro ao carregar auditoria');
          setAuditLogs([]);
          return;
        }
        setAuditLogs(data ?? []);
        setAuditTotal(count ?? 0);
      }
    } catch (err) {
      log.error('fetchData error', err);
      setError('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [tab, auditParams]);

  const handleCreateUser = useCallback(
    async (payload: { name: string; email: string; password: string; role: AppRole }): Promise<boolean> => {
      if (payload.password.length < MIN_PASSWORD_LENGTH) {
        toast.error(`A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
        return false;
      }
      setIsCreatingUser(true);
      const invokeArgs = {
        name: payload.name,
        email: payload.email,
        password: payload.password,
        role: payload.role,
      };
      try {
        try {
          await invokeEdge('create-user', invokeArgs);
        } catch (err) {
          const parsed = await readEdgeError(err);
          if (parsed.status === 401) {
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              setCreateUserError({ field: null, message: 'Erro ao criar usuário' });
              toast.error('Erro ao criar usuário');
              return false;
            }
            try {
              await invokeEdge('create-user', invokeArgs);
            } catch (retryErr) {
              const rp = await readEdgeError(retryErr);
              const fe = mapCreateUserError(rp.message);
              setCreateUserError(fe);
              toast.error(fe.message);
              return false;
            }
          } else {
            const fe = mapCreateUserError(parsed.message);
            setCreateUserError(fe);
            toast.error(fe.message);
            return false;
          }
        }
        setCreateUserError(null);
        toast.success('Usuário criado com sucesso!');
        await fetchData();
        return true;
      } finally {
        setIsCreatingUser(false);
      }
    },
    [fetchData]
  );

  const handleRoleChange = useCallback(
    async (userId: string, role: AppRole): Promise<void> => {
      const { error: rpcError } = await supabase.rpc('admin_set_role', {
        _user_id: userId,
        _role: role,
      });
      if (rpcError) {
        toast.error(translateRoleChangeError(rpcError as { code?: string; message?: string }));
        return;
      }
      toast.success('Papel atualizado com sucesso.');
      await fetchData();
    },
    [fetchData]
  );

  const handleToggleActive = useCallback(
    async (user: UserWithRole): Promise<void> => {
      if (inFlightToggleRef.current.has(user.id)) return;
      inFlightToggleRef.current.add(user.id);
      try {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ is_active: !user.is_active })
          .eq('id', user.id);
        if (updateError) {
          toast.error('Erro ao atualizar status do usuário.');
          return;
        }
        toast.success(user.is_active ? 'Usuário desativado.' : 'Usuário ativado.');
        await fetchData();
      } finally {
        inFlightToggleRef.current.delete(user.id);
      }
    },
    [fetchData]
  );

  const handleSaveRamal = useCallback(
    async (profileId: string, ramal: string, sipPassword: string): Promise<boolean> => {
      const { error: rpcError } = await supabase.rpc('set_voip_profile_credentials', {
        p_profile_id: profileId,
        p_ramal: ramal,
        p_sip_password: sipPassword,
      });
      if (rpcError) {
        const msg = (rpcError as { message?: string }).message ?? '';
        if (msg.includes('ramal_em_uso')) {
          toast.error('Este ramal já está em uso por outro atendente.');
        } else if (msg.includes('not_authorized')) {
          toast.error('Apenas administradores podem definir o ramal.');
        } else {
          toast.error('Erro ao salvar ramal.');
        }
        return false;
      }
      toast.success('Ramal salvo com sucesso.');
      return true;
    },
    []
  );

  // Legacy fetchUsers kept for existing callers
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, name, email, role, is_active, avatar_url')
        .order('name', { ascending: true });
      if (fetchError) {
        if (isAccessDeniedError(fetchError)) {
          toast.error(describeAccessError(fetchError, 'Usuários'));
        } else {
          toast.error('Erro ao carregar usuários');
        }
        return;
      }
      const raw = (data ?? []).map((u: { id: string }) => ({ ...u, user_id: u.id })) as UserWithRole[];
      const signed = await Promise.all(
        raw.map(async (u) => {
          const path = avatarObjectPath(u.avatar_url);
          if (!path) return u;
          const { data: signedData } = await supabase.storage
            .from(AVATAR_BUCKET)
            .createSignedUrl(path, AVATAR_SIGNED_URL_TTL_SECONDS);
          return { ...u, avatar_url: signedData?.signedUrl ?? null };
        })
      );
      setUsers(signed);
    } catch (err) {
      log.error('fetchUsers error', err);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, []);

  const createUser = useCallback(
    async (payload: { name: string; email: string; password: string; role: AppRole }): Promise<CreateUserFieldError | null> => {
      setIsCreatingUser(true);
      try {
        const response = await invokeEdge('create-user', {
          name: payload.name,
          email: payload.email,
          password: payload.password,
          role: payload.role,
        });
        if (!(response as { ok?: boolean }).ok) {
          const errMsg = await readEdgeError(response as Response);
          return mapCreateUserError(errMsg.message);
        }
        toast.success('Usuário criado com sucesso');
        await fetchUsers();
        return null;
      } catch (err) {
        log.error('createUser error', err);
        return { field: null, message: 'Erro ao criar usuário' };
      } finally {
        setIsCreatingUser(false);
      }
    },
    [fetchUsers]
  );

  const updateUserRole = useCallback(
    async (userId: string, newRole: AppRole): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role: newRole })
          .eq('id', userId);
        if (updateError) {
          toast.error('Erro ao atualizar papel');
          return false;
        }
        await fetchUsers();
        return true;
      } catch (err) {
        log.error('updateUserRole error', err);
        return false;
      }
    },
    [fetchUsers]
  );

  const toggleUserActive = useCallback(
    async (userId: string, isActive: boolean): Promise<boolean> => {
      try {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ is_active: isActive })
          .eq('id', userId);
        if (updateError) {
          toast.error('Erro ao atualizar status');
          return false;
        }
        await fetchUsers();
        return true;
      } catch (err) {
        log.error('toggleUserActive error', err);
        return false;
      }
    },
    [fetchUsers]
  );

  const deleteUser = useCallback(
    async (userId: string): Promise<boolean> => {
      deletingIdRef.current = userId;
      setIsDeletingUser(true);
      try {
        const response = await invokeEdge('delete-user', { userId });
        if (!(response as { ok?: boolean }).ok) {
          const errMsg = await readEdgeError(response as Response);
          toast.error(errMsg.message ?? 'Erro ao excluir usuário');
          return false;
        }
        toast.success('Usuário excluído com sucesso');
        await fetchUsers();
        return true;
      } catch (err) {
        log.error('deleteUser error', err);
        toast.error('Erro ao excluir usuário');
        return false;
      } finally {
        setIsDeletingUser(false);
        deletingIdRef.current = null;
      }
    },
    [fetchUsers]
  );

  return {
    users,
    loading,
    error,
    auditLogs,
    auditTotal,
    isCreatingUser,
    isDeletingUser,
    createUserError,
    deletingIdRef,
    fetchData,
    handleCreateUser,
    handleRoleChange,
    handleToggleActive,
    handleSaveRamal,
    fetchUsers,
    createUser,
    updateUserRole,
    toggleUserActive,
    deleteUser,
  };
}
