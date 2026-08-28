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

    const [safetyForced, setSafetyForced] = useState(false);
    const loading = (authLoading || rolesLoading) && !safetyForced;

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
     return (
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
   }

    if (!user) {
      return <Navigate to="/auth" state={{ from: location }} replace />;
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
