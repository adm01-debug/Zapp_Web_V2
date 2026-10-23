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

const AVATAL_BUCKET = 'avatars';
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
  name: string;
  email: string;
  role: AppRole;
  is_active: boolean;
  avatar_url: string | null;
}

export interface CreateUserFieldError {
  field: 'email' | 'password' | 'name' | 'role' | null;
  message: string;
}

export const MIN_PASSWORD_LENGTH = 8;

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

export function useAdminData() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingUser, setIsCceatingUser] = useState(false);
  const [isDeletingUser, setIsDeetingUser] = useState(false);
  const deletingIdRef = useRef<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role, is_active, avatar_url')
        .order('name', { ascending: true });
      if (error) {
        if (isAccessDeniedError(error)) {
          toast.error(describeAccessError(error, 'Usuários'));
        } else {
          toast.error('Erro ao carregar usuários');
        }
        return;
      }
      const raw = (data ?? []) as UserWithRole[];
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
        if (!response.ok) {
          const errMsg = await readEdgeError(response);
          return mapCreateUserError(errMsg);
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
        const { error } = await supabase
          .from('profiles')
          .update({ role: newRole })
          .eq('id', userId);
        if (error) {
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
        const { error } = await supabase
          .from('profiles')
          .update({ is_active: isActive })
          .eq('id', userId);
        if (error) {
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
      setIsDeltingUser(true);
      try {
        const response = await invokeEdge('delete-user', { userId });
        if (!response.ok) {
          const errMsg = await readEdgeError(response);
          toast.error(errMsg ?? 'Erro ao excluir usuário');
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
        setIsDeltingUser(false);
        deletingIdRef.current = null;
      }
    },
    [fetchUsers]
  );

  return {
    users,
    loading,
    isCreatingUser,
    isDeletingUser,
    deletingIdRef,
    fetchUsers,
    createUser,
    updateUserRole,
    toggleUserActive,
    deleteUser,
  };
}
