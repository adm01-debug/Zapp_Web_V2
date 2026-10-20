import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { NavigationService } from '@/services/navigation.service';
import { RoleService, type AppRole } from '@/services/role.service';

export type { AppRole };

export function useUserRole() {
  const { user } = useAuth();

  // queryKey compartilhada: os ~8 componentes que chamam useUserRole() ao
  // mesmo tempo (Sidebar, ProtectedRoute, CommandPalette, etc.) dividem um
  // único fetch e um único loading state em vez de cada um correr sua
  // própria requisição e seu próprio timer de segurança.
  const { data: roles = [], isLoading, refetch } = useQuery({
    queryKey: ['user-roles', user?.id],
    // Deriva o userId da própria queryKey em vez de "user!.id": refetch()
    // chamado manualmente ignora `enabled`, então um non-null assertion
    // aqui quebraria em runtime se refetch() rodasse com user null (logout).
    queryFn: ({ queryKey }) => {
      const [, userId] = queryKey;
      return userId ? RoleService.fetchUserRoles(userId) : Promise.resolve([]);
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  // Permissoes NOMEADAS exigidas pela navegacao (ex.: multiplix.dispatch.create)
  // que o usuario logado possui. Fonte = RPC `user_has_permission` via
  // RoleService.checkPermission — o MESMO caminho do ProtectedRoute
  // (src/components/auth/ProtectedRoute.tsx). Nao da para ler role_permissions
  // direto: a RLS so libera admin/supervisor, agente viria com zero linhas.
  // A lista de permissoes vem do proprio metadata da nav (NavigationService),
  // entao um item novo com `permission` passa a ser resolvido sem mexer aqui.
  const requiredPermissions = useMemo(() => NavigationService.getRequiredPermissions(), []);

  const { data: permissions = [], isLoading: permissionsLoading } = useQuery({
    queryKey: ['user-nav-permissions', user?.id, requiredPermissions],
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return [];
      const checks = await Promise.all(
        requiredPermissions.map(async (permission) => ({
          permission,
          granted: await RoleService.checkPermission(userId, permission),
        })),
      );
      return checks.filter(({ granted }) => granted).map(({ permission }) => permission);
    },
    enabled: !!user && requiredPermissions.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const derivedRoles = useMemo(() => ({
    isAdmin: roles.includes('admin'),
    isSupervisor: roles.includes('supervisor') || roles.includes('admin'),
    isSpecialAgent: roles.includes('special_agent'),
  }), [roles]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);

  return {
    roles,
    ...derivedRoles,
    hasRole,
    loading: isLoading,
    // Permissoes nomeadas da nav que o usuario possui + o loading delas
    // (separado de `loading` para nao mudar o tempo de espera do ProtectedRoute).
    permissions,
    permissionsLoading,
    refetch,
  };
}
