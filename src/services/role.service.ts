 import { supabase } from '@/integrations/supabase/client';

 export type AppRole = 'admin' | 'supervisor' | 'agent' | 'special_agent';

// Deduplicate concurrent role fetches: multiple useUserRole instances mount
// simultaneously and would otherwise each trigger an identical DB query and
// each fire the 5-second safety timeout. A single in-flight promise per userId
// ensures only one network round-trip happens regardless of hook count.
const _pendingFetch = new Map<string, Promise<AppRole[]>>();

 export class RoleService {
   static async fetchUserRoles(userId: string): Promise<AppRole[]> {
     if (_pendingFetch.has(userId)) {
       return _pendingFetch.get(userId)!;
     }

     const promise = supabase
       .from('user_roles')
       .select('role')
       .eq('user_id', userId)
       .then(({ data, error }) => {
         _pendingFetch.delete(userId);
         if (error) throw error;
         return (data?.map((r) => r.role) || []) as AppRole[];
       })
       .catch((err) => {
         _pendingFetch.delete(userId);
         throw err;
       });

     _pendingFetch.set(userId, promise);
     return promise;
   }
 
   static async checkPermission(userId: string, permission: string): Promise<boolean> {
     const { data, error } = await supabase.rpc('user_has_permission', {
       _user_id: userId,
       _permission_name: permission
     });
 
     if (error) return false;
     return data === true;
   }
 }