import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';

interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string;
}

interface RolePermission {
  role: 'admin' | 'supervisor' | 'agent' | 'special_agent';
  permission_id: string;
  permission?: Permission;
}

export function usePermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    const { data, error: permError } = await supabase
      .from('permissions')
      .select('*')
      .order('category', { ascending: true });

    // Falha de leitura não é "sem permissão": lança para o loadAll registrar o erro.
    if (permError) throw permError;

    setPermissions(data ?? []);
    return data || [];
  }, []);

  const fetchRolePermissions = useCallback(async () => {
    const { data, error: rpError } = await supabase
      .from('role_permissions')
      .select(`
        role,
        permission_id,
        permissions (
          id,
          name,
          description,
          category
        )
      `);

    if (rpError) throw rpError;

    if (data) {
      const mapped = data.map(rp => ({
        role: rp.role as 'admin' | 'supervisor' | 'agent' | 'special_agent',
        permission_id: rp.permission_id,
        permission: rp.permissions as unknown as Permission
      }));
      setRolePermissions(mapped);
    }
    return data || [];
  }, []);

  const fetchUserPermissions = useCallback(async () => {
    if (!user) {
      setUserPermissions([]);
      return [];
    }

    // Get user's roles first
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    // Antes o erro era engolido e as permissões ficavam vazias como se o usuário não
    // tivesse nenhuma: lança para o loadAll poder tentar de novo e sinalizar a falha.
    if (rolesError) throw rolesError;

    if (!userRoles || userRoles.length === 0) {
      setUserPermissions([]);
      return [];
    }

    const roles = userRoles.map(r => r.role);

    // Get permissions for those roles
    const { data: perms, error: permsError } = await supabase
      .from('role_permissions')
      .select('permissions(name)')
      .in('role', roles);

    if (permsError) throw permsError;

    if (perms) {
      const permNames = perms
        .map(p => (p.permissions as unknown as { name: string } | null)?.name)
        .filter(Boolean) as string[];
      const uniquePerms = [...new Set(permNames)];
      setUserPermissions(uniquePerms);
      return uniquePerms;
    }

    return [];
  }, [user]);

  /** Repete a leitura de permissões do usuário antes de desistir (falha transitória de rede). */
  const fetchUserPermissionsWithRetry = useCallback(async () => {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fetchUserPermissions();
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Falha ao carregar as permissões do usuário');
  }, [fetchUserPermissions]);

  /** Server-side permission check via SECURITY DEFINER RPC */
  const checkPermissionServer = useCallback(async (permissionName: string): Promise<boolean> => {
    if (!user) return false;
    const { data, error } = await supabase.rpc('user_has_permission', {
      _user_id: user.id,
      _permission_name: permissionName,
    });
    if (error) return false;
    return !!data;
  }, [user]);

  const hasPermission = useCallback((permissionName: string): boolean => {
    return userPermissions.includes(permissionName);
  }, [userPermissions]);

  const hasAnyPermission = useCallback((permissionNames: string[]): boolean => {
    return permissionNames.some(p => userPermissions.includes(p));
  }, [userPermissions]);

  const hasAllPermissions = useCallback((permissionNames: string[]): boolean => {
    return permissionNames.every(p => userPermissions.includes(p));
  }, [userPermissions]);

  const addPermissionToRole = useCallback(async (role: 'admin' | 'supervisor' | 'agent' | 'special_agent', permissionId: string) => {
    const { error } = await supabase
      .from('role_permissions')
      .insert({ role, permission_id: permissionId });

    if (error) {
      throw error;
    }
    await fetchRolePermissions();
    return true;
  }, [fetchRolePermissions]);

  const removePermissionFromRole = useCallback(async (role: 'admin' | 'supervisor' | 'agent' | 'special_agent', permissionId: string) => {
    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role', role)
      .eq('permission_id', permissionId);

    if (error) {
      throw error;
    }
    await fetchRolePermissions();
    return true;
  }, [fetchRolePermissions]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          fetchPermissions(),
          fetchRolePermissions(),
          fetchUserPermissionsWithRetry()
        ]);
      } catch (err) {
        // Permissões não carregaram: nega por padrão (userPermissions vazio) e sinaliza.
        console.error('[usePermissions] falha ao carregar as permissões', err);
        setUserPermissions([]);
        setError(err instanceof Error ? err.message : 'Falha ao carregar as permissões');
      } finally {
        setLoading(false);
      }
    };
    void loadAll();
  }, [fetchPermissions, fetchRolePermissions, fetchUserPermissionsWithRetry]);

  return {
    permissions,
    rolePermissions,
    userPermissions,
    loading,
    /** Mensagem quando as permissões não carregaram; `null` = leitura ok. A UI nega por padrão. */
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    checkPermissionServer,
    addPermissionToRole,
    removePermissionFromRole,
    refetch: async () => {
      setError(null);
      try {
        return await Promise.all([fetchPermissions(), fetchRolePermissions(), fetchUserPermissionsWithRetry()]);
      } catch (err) {
        console.error('[usePermissions] falha ao carregar as permissões', err);
        setUserPermissions([]);
        setError(err instanceof Error ? err.message : 'Falha ao carregar as permissões');
        throw err;
      }
    }
  };
}
