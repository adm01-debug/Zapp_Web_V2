import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import type { AppRole } from '@/services/role.service';

interface Permission {
  id: string;
  name: string;
  description: string | null;
  category: string;
}

interface RolePermission {
  role: AppRole;
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
        role: rp.role as AppRole,
        permission_id: rp.permission_id,
        permission: rp.permissions as unknown as Permission
      }));
      setRolePermissions(mapped);
    }
    return data || [];
  }, []);

  const fetchUserPermissions = useCallback(async () => {
    if (!user) return [];

    const permissionNames = [
      'view_dashboard',
      'view_contacts',
      'view_inbox',
      'manage_contacts',
      'manage_agents',
      'view_agents',
      'view_queues',
      'manage_queues',
      'view_reports',
      'send_messages',
      'export_reports',
      'view_settings',
    ];

    const permissionResults = await Promise.all(
      permissionNames.map(async (perm) => {
        const { data, error } = await supabase.rpc('user_has_permission', {
          _user_id: user.id,
          _permission_name: perm
        });
        return !error && data === true ? perm : null;
      })
    );

    const enabledPermissions = permissionResults.filter(Boolean) as string[];
    setUserPermissions(enabledPermissions);
    return enabledPermissions;
  }, [user]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchPermissions(), fetchRolePermissions(), fetchUserPermissions()]);
      setLoading(false);
    };
    load();
  }, [fetchPermissions, fetchRolePermissions, fetchUserPermissions]);

  const hasPermission = (name: string): boolean => {
    return userPermissions.includes(name);
  };

  const addPermissionToRole = useCallback(async (role: AppRole, permissionId: string) => {
    const { error } = await supabase
      .from('role_permissions')
      .insert({ role, permission_id: permissionId });
    if (!error) {
      await fetchRolePermissions();
    }
    return !error;
  }, [fetchRolePermissions]);

  const removePermissionFromRole = useCallback(async (role: AppRole, permissionId: string) => {
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

  return {
    permissions,
    rolePermissions,
    userPermissions,
    loading,
    hasPermission,
    addPermissionToRole,
    removePermissionFromRole,
  };
}
