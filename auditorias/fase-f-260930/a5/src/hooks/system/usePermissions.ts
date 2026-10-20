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

  const fetchPermissions = useCallback(async () => {
    const { data, error } = await supabase
      .from('permissions')
      .select('*')
      .order('category', { ascending: true });

    if (!error && data) {
      setPermissions(data);
    }
    return data || [];
  }, []);

  const fetchRolePermissions = useCallback(async () => {
    const { data, error } = await supabase
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

    if (!error && data) {
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
    if (!user) return [];

    // Get user's roles first
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (!userRoles || userRoles.length === 0) {
      setUserPermissions([]);
      return [];
    }

    const roles = userRoles.map(r => r.role);

    // Get permissions for those roles
    const { data: perms } = await supabase
      .from('role_permissions')
      .select('permissions(name)')
      .in('role', roles);

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

    if (!error) {
      await fetchRolePermissions();
    }
    return !error;
  }, [fetchRolePermissions]);

  const removePermissionFromRole = useCallback(async (role: 'admin' | 'supervisor' | 'agent' | 'special_agent', permissionId: string) => {
    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role', role)
      .eq('permission_id', permissionId);

    if (!error) {
      await fetchRolePermissions();
    }
    return !error;
  }, [fetchRolePermissions]);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([
        fetchPermissions(),
        fetchRolePermissions(),
        fetchUserPermissions()
      ]);
      setLoading(false);
    };
    loadAll();
  }, [fetchPermissions, fetchRolePermissions, fetchUserPermissions]);

  return {
    permissions,
    rolePermissions,
    userPermissions,
    loading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    checkPermissionServer,
    addPermissionToRole,
    removePermissionFromRole,
    refetch: () => Promise.all([fetchPermissions(), fetchRolePermissions(), fetchUserPermissions()])
  };
}
