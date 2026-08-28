 import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
 import { useAuth } from '@/hooks/auth/useAuth';
 import { RoleService, type AppRole } from '@/services/role.service';
import { logger } from '@/lib/logger';
 export type { AppRole };
 
 export function useUserRole() {
   const { user } = useAuth();
   const [roles, setRoles] = useState<AppRole[]>([]);
    const [loading, setLoading] = useState(true);
    const mountedRef = useRef(true);
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
    useEffect(() => {
      mountedRef.current = true;
      return () => { 
        mountedRef.current = false; 
        if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      };
    }, []);
  
    const fetchRoles = useCallback(async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      
      // Safety timeout: stop loading after 8 seconds no matter what
      fetchTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          logger.warn('[useUserRole] Fetching roles timed out, forcing loading state to false');
          setLoading(false);
        }
      }, 5000);

      try {
        const userRoles = await RoleService.fetchUserRoles(user.id);
        if (mountedRef.current) {
          setRoles(userRoles);
        }
      } catch (err) {
        logger.error('[useUserRole] Error fetching roles:', err);
      } finally {
        if (mountedRef.current) {
          setLoading(false);
          if (fetchTimeoutRef.current) {
            clearTimeout(fetchTimeoutRef.current);
            fetchTimeoutRef.current = null;
          }
        }
      }
    }, [user]);

    useEffect(() => {
      if (user) {
        fetchRoles();
      } else {
        setRoles([]);
        setLoading(false);
      }
    }, [user, fetchRoles]);
 
   const derivedRoles = useMemo(() => ({
     isAdmin: roles.includes('admin'),
     isSupervisor: roles.includes('supervisor') || roles.includes('admin'),
     isSpecialAgent: roles.includes('special_agent'),
   }), [roles]);
 
   const hasRole = useCallback((role: AppRole) => roles.includes(role), [roles]);
 
   return { roles, ...derivedRoles, hasRole, loading, refetch: fetchRoles };
 }
