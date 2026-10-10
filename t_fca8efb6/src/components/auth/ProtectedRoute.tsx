 import { type ComponentType, ReactNode, useEffect, useState } from 'react';
 import { Navigate, useLocation } from 'react-router-dom';
 import { Loader2 } from 'lucide-react';
 import { useAuth } from '@/hooks/auth/useAuth';
 import { useUserRole } from '@/hooks/system/useUserRole';
 import { RoleService } from '@/services/role.service';
 import { AuthService } from '@/services/auth.service';
 import { log } from '@/lib/logger';

 interface ProtectedRouteProps {
   children: ReactNode;
   requiredRoles?: ('admin' | 'supervisor' | 'agent')[];
   requiredPermission?: string;
   fallback?: ReactNode;
 }

 export function ProtectedRoute({
   children,
   requiredRoles,
   requiredPermission,
   fallback
 }: ProtectedRouteProps) {
   const { user, loading: authLoading } = useAuth();
   const { loading: rolesLoading, hasRole } = useUserRole();
   const location = useLocation();
   const [hasPermission, setHasPermission] = useState<boolean | null>(null);
   const [mfaGate, setMfaGate] = useState<{ userId: string; status: 'required' | 'ok' | 'error' } | null>(null);

    const [safetyForced, setSafetyForced] = useState(false);
    const loading = (authLoading || rolesLoading) && !safetyForced;
    // O gate vale só para o usuário que o gerou — sessão trocada cai em 'checking'
    // até a decisão nova sair, sem depender de reset em effect.
    const gate = user && mfaGate?.userId === user.id ? mfaGate.status : 'checking';

    const verificandoAcesso = (
      <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-busy="true" aria-label="Verificando acesso">
        <div className="flex flex-col items-center gap-4 max-w-xs text-center px-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden="true" />
          <p className="text-foreground font-medium">Verificando acesso...</p>

          {/* Escape hatch for infinite loading */}
          <div className="mt-8 pt-8 border-t border-border w-full">
            <p className="text-xs text-muted-foreground mb-4 italic">Se o carregamento demorar muito, tente:</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => window.location.reload()}
                className="text-xs px-4 py-2 bg-muted hover:bg-muted/80 rounded-md transition-colors"
              >
                Recarregar Página
              </button>
              <button
                onClick={() => {
                  void AuthService.signOut();
                  window.location.href = '/auth';
                }}
                className="text-xs px-4 py-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              >
                Sair e Entrar Novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    );

    // Safety timeout: forces render after 7 s even if hooks haven't resolved.
    useEffect(() => {
      const timer = setTimeout(() => {
        if (authLoading || rolesLoading) {
          log.warn('[ProtectedRoute] Safety timeout reached, forcing render');
          setSafetyForced(true);
        }
      }, 7000);
      return () => clearTimeout(timer);
    }, [authLoading, rolesLoading]);

   /**
    * BUG-8 FIX: reset hasPermission whenever the user identity or the required
    * permission changes so stale permission state is never shown to a new user.
    */
    useEffect(() => {
      setHasPermission(null);
    }, [user?.id, requiredPermission]);

    useEffect(() => {
      if (loading || !user) return;
      // R2-AUTH-003: o desafio MFA entra na cadeia de autorização da rota. A
      // decisão currentLevel/nextLevel roda antes de liberar o conteúdo — aal1
      // com fator pendente (nextLevel aal2) vai para /2fa; erro fecha o acesso
      // com estado explícito, nunca libera silenciosamente.
      let cancelled = false;
      const timeout = setTimeout(() => {
        if (!cancelled) {
          log.error('[ProtectedRoute] Verificação MFA expirou');
          setMfaGate({ userId: user.id, status: 'error' });
        }
      }, 8000);
      AuthService.getMfaAssurance()
        .then((assurance) => {
          if (cancelled) return;
          if (!assurance) {
            setMfaGate({ userId: user.id, status: 'error' });
            return;
          }
          const pendente = assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2';
          setMfaGate({ userId: user.id, status: pendente ? 'required' : 'ok' });
        })
        .catch((err) => {
          if (!cancelled) {
            log.error('[ProtectedRoute] Falha na verificação MFA:', err);
            setMfaGate({ userId: user.id, status: 'error' });
          }
        })
        .finally(() => clearTimeout(timeout));
      return () => {
        cancelled = true;
        clearTimeout(timeout);
      };
    }, [loading, user]);

    useEffect(() => {
      if (!loading && user && requiredPermission) {
        log.debug('[ProtectedRoute] Checking permission:', requiredPermission);

        const permTimeout = setTimeout(() => {
          if (hasPermission === null) {
            log.warn('[ProtectedRoute] Permission check timed out');
            setHasPermission(false);
          }
        }, 5000);

        RoleService.checkPermission(user.id, requiredPermission)
          .then(result => {
            log.debug('[ProtectedRoute] Permission result:', requiredPermission, result);
            setHasPermission(result);
          })
          .catch(err => {
            log.error('[ProtectedRoute] Permission error:', err);
            setHasPermission(false);
          })
          .finally(() => {
            clearTimeout(permTimeout);
          });
      } else if (!loading && !requiredPermission) {
        setHasPermission(true);
      } else if (!loading && !user) {
        setHasPermission(false);
      }
    }, [loading, user, requiredPermission]);

   if (loading || (requiredPermission && hasPermission === null)) {
     return verificandoAcesso;
   }

    // R2-AUTH-003: enquanto a decisão AAL da sessão não sai, a rota continua em
    // verificação — o conteúdo protegido nunca renderiza antes dela (fail closed).
    if (user && gate === 'checking') {
      return verificandoAcesso;
    }

    if (!user) {
      return <Navigate to="/auth" state={{ from: location }} replace />;
    }

    if (gate === 'required') {
      return <Navigate to="/2fa" state={{ from: location }} replace />;
    }

    if (gate === 'error') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-destructive">Erro ao verificar autenticação</h1>
            <p className="text-muted-foreground">Não foi possível confirmar o nível de segurança da sessão.</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
              >
                Tentar Novamente
              </button>
              <button
                onClick={() => {
                  void AuthService.signOut();
                  window.location.href = '/auth';
                }}
                className="px-4 py-2 text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              >
                Sair e Entrar Novamente
              </button>
            </div>
          </div>
        </div>
      );
    }

    const isAuthorized = !requiredRoles?.length || requiredRoles.some(role => hasRole(role));
    const isPermissioned = !requiredPermission || hasPermission;

    if (!isAuthorized || !isPermissioned) {
      if (fallback) return <>{fallback}</>;
      if (location.pathname !== "/") {
        return <Navigate to="/" replace />;
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
          <div className="space-y-4">
            <h1 className="text-2xl font-bold text-destructive">Acesso Negado</h1>
            <p className="text-muted-foreground">Você não tem permissão para acessar esta área.</p>
            <button
              onClick={() => window.location.href = '/auth'}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
            >
              Voltar para Login
            </button>
          </div>
        </div>
      );
    }

   return <>{children}</>;
 }

// BUG-9 FIX: use ComponentType<P> (named import) instead of React.ComponentType<P>
// to avoid relying on the React global namespace when using named-only imports.
export function withPermission<P extends object>(
  WrappedComponent: ComponentType<P>,
  permission: string
) {
  return function PermissionWrapper(props: P) {
    return (
      <ProtectedRoute requiredPermission={permission}>
        <WrappedComponent {...props} />
      </ProtectedRoute>
    );
  };
}
