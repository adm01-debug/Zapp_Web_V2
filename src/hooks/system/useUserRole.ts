import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
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

  const derivedRoles = useMemo(() => ({
    isAdmin: roles.includes('admin'),
    isSupervisor: roles.includes('supervisor') || roles.includes('admin'),
    isSpecialAgent: roles.includes('special_agent'),
  }), [roles]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);

  return { roles, ...derivedRoles, hasRole, loading: isLoading, refetch };
}
