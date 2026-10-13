import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { NavigationService } from '@/services/navigation.service';
import { RoleService, type AppRole } from '@/services/role.service';

export type { AppRole };

/**
 * Papel/perfil ao vivo, com UM canal por usuário compartilhado entre as ~8
 * telas que chamam o hook (Sidebar, ProtectedRoute, CommandPalette...).
 * O `supabase.channel(topic)` devolve o MESMO canal para o mesmo tópico: se
 * cada instância assinasse por conta própria, os callbacks duplicariam e o
 * primeiro componente a desmontar fecharia o canal de todos. Aqui um contador
 * de ouvintes mantém o canal vivo enquanto houver ao menos uma tela.
 */
type OuvinteDeAcesso = { papel: () => void; perfil: () => void };
type CanalAssinado = ReturnType<typeof supabase.channel>;

const canaisDeAcesso = new Map<string, { canal: CanalAssinado; ouvintes: Set<OuvinteDeAcesso> }>();

function assinarAcessoDoUsuario(userId: string, ouvinte: OuvinteDeAcesso): () => void {
  let entrada = canaisDeAcesso.get(userId);
  if (!entrada) {
    const ouvintes = new Set<OuvinteDeAcesso>();
    const canal = supabase
      .channel(`user-access:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles', filter: `user_id=eq.${userId}` },
        () => { ouvintes.forEach((o) => o.papel()); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` },
        () => { ouvintes.forEach((o) => o.perfil()); },
      )
      .subscribe();
    entrada = { canal, ouvintes };
    canaisDeAcesso.set(userId, entrada);
  }

  entrada.ouvintes.add(ouvinte);

  return () => {
    const atual = canaisDeAcesso.get(userId);
    if (!atual) return;
    atual.ouvintes.delete(ouvinte);
    if (atual.ouvintes.size === 0) {
      // Logout/troca de usuário: o canal do usuário que saiu tem de fechar
      // junto, senão ele segue entregando eventos à sessão nova.
      canaisDeAcesso.delete(userId);
      void supabase.removeChannel(atual.canal);
    }
  };
}

export function useUserRole() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  // refreshProfile muda de identidade a cada troca de usuário; guardar em ref
  // evita reassinar o canal (e perder o toggle de papel) a cada render.
  const refreshProfileRef = useRef(refreshProfile);
  useEffect(() => {
    refreshProfileRef.current = refreshProfile;
  }, [refreshProfile]);

  /**
   * Um admin muda o papel DESTE usuário e o servidor aplica na hora, mas o
   * cache só venceria em 5 min (staleTime). O canal é filtrado por `user_id`:
   * evento de outro usuário não derruba o cache sem necessidade.
   */
  useEffect(() => {
    if (!userId) return;

    return assinarAcessoDoUsuario(userId, {
      papel: () => { void queryClient.invalidateQueries({ queryKey: ['user-roles', userId] }); },
      perfil: () => { void refreshProfileRef.current(); },
    });
  }, [userId, queryClient]);


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
