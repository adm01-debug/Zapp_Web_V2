import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { NavigationService } from '@/services/navigation.service';
import { RoleService, type AppRole } from '@/services/role.service';
import { useAppBootstrap, userRolesQueryKey } from './useAppBootstrap';

export type { AppRole };

/**
 * Checagem nomeada pelo RPC `user_has_permission` (SECURITY DEFINER, o mesmo
 * que o ProtectedRoute usa via RoleService). Aqui o ERRO SOBE em vez de virar
 * `false`: "nao deu para ler" nao e a mesma coisa que "nao tem permissao"
 * (PE-96). Quem chama decide mostrar a falha; a lista continua vazia por
 * seguranca (fail-closed).
 */
async function checkNamedPermission(userId: string, permission: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('user_has_permission', {
    _user_id: userId,
    _permission_name: permission,
  });
  if (error) throw error;
  return data === true;
}

export function useUserRole() {
  const { user } = useAuth();

  // O boot faz UMA chamada (RPC `app_bootstrap`) e hidrata as chaves usadas
  // aqui. Enquanto ele esta em curso a leitura direta fica DESLIGADA: era ela
  // a requisicao duplicada de user_roles que este cartao tira. Se o boot
  // falhar, a leitura direta (abaixo) assume o papel — e o erro do boot fica
  // exposto em `bootstrapError` em vez de virar lista vazia.
  const bootstrap = useAppBootstrap();
  const bootstrapPending = !!user && bootstrap.isLoading;

  // queryKey compartilhada: os ~8 componentes que chamam useUserRole() ao
  // mesmo tempo (Sidebar, ProtectedRoute, CommandPalette, etc.) dividem um
  // único fetch e um único loading state em vez de cada um correr sua
  // própria requisição e seu próprio timer de segurança. A chave e a MESMA
  // que o useAppBootstrap hidrata.
  const { data: roles = [], isLoading, isError: rolesLoadError, refetch } = useQuery<AppRole[]>({
    queryKey: userRolesQueryKey(user?.id),
    // Deriva o userId da própria queryKey em vez de "user!.id": refetch()
    // chamado manualmente ignora `enabled`, então um non-null assertion
    // aqui quebraria em runtime se refetch() rodasse com user null (logout).
    queryFn: ({ queryKey }) => {
      const [, userId] = queryKey;
      return userId ? RoleService.fetchUserRoles(userId as string) : Promise.resolve([]);
    },
    enabled: !!user && !bootstrapPending,
    staleTime: 1000 * 60 * 5,
  });

  // Permissoes NOMEADAS exigidas pela navegacao (ex.: multiplix.dispatch.create)
  // que o usuario logado possui. Duas fontes, mesma resposta:
  //  - matriz do boot (role_permissions x papeis do usuario) quando a RLS a
  //    liberou (admin/supervisor). A concessao e a MESMA regra do
  //    user_has_permission: EXISTS(user_roles JOIN role_permissions JOIN permissions);
  //  - caso contrario (agente ve zero linhas, por RLS), a checagem nomeada de
  //    sempre. A lista de permissoes vem do metadata da nav (NavigationService),
  //    entao item novo com `permission` continua resolvido sem mexer aqui.
  const requiredPermissions = useMemo(() => NavigationService.getRequiredPermissions(), []);

  const matrixPermissions = useMemo<string[] | null>(() => {
    const boot = bootstrap.data;
    if (!boot || boot.role_permissions.length === 0) return null;
    const granted = new Set<string>();
    for (const rolePermission of boot.role_permissions) {
      if (boot.roles.includes(rolePermission.role) && rolePermission.permission?.name) {
        granted.add(rolePermission.permission.name);
      }
    }
    return requiredPermissions.filter((permission) => granted.has(permission));
  }, [bootstrap.data, requiredPermissions]);

  const needsNamedChecks =
    !!user &&
    requiredPermissions.length > 0 &&
    matrixPermissions === null &&
    // Durante o boot nao se dispara a checagem nomeada: ou a matriz chega e ela
    // fica dispensada, ou o boot falha e ela assume. Sem esta guarda o boot
    // pagava as N checagens E a matriz ao mesmo tempo.
    !bootstrapPending;

  const {
    data: checkedPermissions = [],
    isLoading: namedChecksLoading,
    isError: permissionsLoadError,
  } = useQuery<string[]>({
    queryKey: ['user-nav-permissions', user?.id, requiredPermissions],
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return [];
      const checks = await Promise.all(
        requiredPermissions.map(async (permission) => ({
          permission,
          granted: await checkNamedPermission(userId, permission),
        })),
      );
      return checks.filter(({ granted }) => granted).map(({ permission }) => permission);
    },
    enabled: needsNamedChecks,
    staleTime: 1000 * 60 * 5,
  });

  const permissions = matrixPermissions ?? (needsNamedChecks ? checkedPermissions : []);
  // Com a matriz do boot ja em maos nao ha espera de permissao; durante o boot
  // a checagem nomeada ainda nao comecou (mas continua "carregando").
  const permissionsLoading =
    matrixPermissions !== null ? false : bootstrapPending || namedChecksLoading;

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
    loading: bootstrapPending || isLoading,
    rolesLoadError,
    // Erro do boot (a leitura direta acima pode ter salvado os papeis): quem
    // quiser avisar sobre a degradacao do boot le daqui.
    bootstrapError: bootstrap.error,
    // Permissoes nomeadas da nav que o usuario possui + o loading delas
    // (separado de `loading` para nao mudar o tempo de espera do ProtectedRoute).
    permissions,
    permissionsLoading,
    // "permissões não carregaram": a leitura falhou e a lista vazia NAO pode ser
    // lida como "nao tem permissao" (PE-96). Fail-closed continua igual.
    permissionsLoadError,
    refetch,
  };
}
