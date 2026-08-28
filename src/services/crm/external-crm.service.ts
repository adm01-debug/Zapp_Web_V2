 import { getExternalSupabase } from '@/integrations/supabase/externalClient';
 import { queryExternalProxy } from '@/lib/externalProxy';
 import { log } from '@/lib/logger';
 
 export class ExternalCRMService {
   static async getContact360Batch(phones: string[]) {
     const cleanedPhones = [...new Set(phones.map(p => p.replace(/[^0-9]/g, '')).filter(p => p.length >= 8))];
     if (cleanedPhones.length === 0) return new Map();
 
     const { data, error } = await getExternalSupabase().rpc('get_companies_by_phones_batch', {
       p_phones: cleanedPhones,
     });
 
     if (error) {
       log.error('[ExternalCRMService] Batch CRM lookup error:', error);
       return new Map();
     }
 
     const map = new Map<string, any>();
     if (data && typeof data === 'object') {
       for (const [phone, info] of Object.entries(data)) {
         map.set(phone, info);
         const clean = phone.replace(/[^0-9]/g, '');
         if (clean !== phone) map.set(clean, info);
         if (!phone.startsWith('55') && clean.length <= 11) {
           map.set('55' + clean, info);
         }
       }
     }
     return map;
   }
 
   static async queryExternal<T = unknown>(params: {
     table: string;
     select?: string;
     filters?: any[];
     order?: { column: string; ascending?: boolean };
     limit?: number;
     offset?: number;
     countMode?: 'exact' | 'planned' | 'estimated';
   }) {
     const start = performance.now();
     let query = getExternalSupabase()
       .from(params.table)
       .select(params.select || '*', { count: params.countMode || undefined });
 
     if (params.filters) {
       for (const f of params.filters) {
         query = query.filter(f.column, f.operator, f.value as string);
       }
     }
 
     if (params.order) {
       query = query.order(params.order.column, { ascending: params.order.ascending ?? true });
     }
 
     const limit = params.limit || 50;
     const offset = params.offset || 0;
     query = query.range(offset, offset + limit - 1);
 
     const { data, error, count } = await query;
     const duration = Math.round(performance.now() - start);
 
     if (error) throw new Error(error.message);
 
     return {
       data: (data as T[]) || [],
       meta: {
         record_count: count ?? (Array.isArray(data) ? data.length : null),
         duration_ms: duration,
         severity: duration > 3000 ? 'slow' : 'ok',
       },
     };
   }
 
   static async callRPC<T = unknown>(rpc: string, params?: Record<string, unknown>) {
     const start = performance.now();
     const { data, error } = await getExternalSupabase().rpc(rpc, params || {});
     const duration = Math.round(performance.now() - start);
     if (error) throw new Error(error.message);
     return {
       data: Array.isArray(data) ? data as T[] : [data as T],
       meta: { record_count: Array.isArray(data) ? data.length : 1, duration_ms: duration, severity: 'ok' },
     };
   }
 
   static async fetchEvolutionMessages(limit = 500) {
     const result = await queryExternalProxy<any>({
       table: 'evolution_messages',
       select: '*',
       order: { column: 'created_at', ascending: false },
       limit,
     });
     return result.data;
   }
 
   static async fetchEvolutionMessagesByJid(remoteJid: string, limit = 1000) {
     const result = await queryExternalProxy<any>({
       table: 'evolution_messages',
       select: '*',
       filters: [{ column: 'remote_jid', operator: 'eq', value: remoteJid }],
       order: { column: 'created_at', ascending: true },
       limit,
     });
     return result.data;
   }
 
   static async getContact360(phone: string) {
     const cleanedPhone = phone.replace(/[^0-9]/g, '');
     if (cleanedPhone.length < 8) return null;
 
     const { data, error } = await getExternalSupabase().rpc('get_contact_360_by_phone', {
       p_phone: cleanedPhone,
     });
 
     if (error) {
       log.error('[ExternalCRMService] Error fetching contact 360:', error);
       return null;
     }
 
     return data;
   }
 
   static async fetchUniqueCompanies(maxPages = 5, pageSize = 200) {
     const allNames: string[] = [];
     let page = 0;
 
     while (page < maxPages) {
       const { data, error } = await getExternalSupabase().rpc('search_contacts_advanced', {
         p_search: null,
         p_vendedor: null,
         p_ramo: null,
         p_rfm_segment: null,
         p_estado: null,
         p_cliente_ativado: true,
         p_ja_comprou: null,
         p_sort_by: 'name',
         p_page: page,
         p_page_size: pageSize,
       });
 
       if (error) {
         log.error('[ExternalCRMService] Error fetching companies:', error);
         break;
       }
 
       const results = (data as any)?.results || [];
       if (results.length === 0) break;
 
       results.forEach((r: any) => {
         const name = String(r.company_name || '').trim();
         if (name) allNames.push(name);
       });
 
       if (results.length < pageSize) break;
       page++;
     }
 
     return [...new Set(allNames)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
   }
 
   static async fetchUniqueRoles() {
     const allCargos: string[] = [];
 
     const { data: salesRoles, error: e1 } = await getExternalSupabase()
       .from('salespeople')
       .select('role')
       .not('role', 'is', null)
       .limit(500);
 
     if (!e1 && salesRoles) {
       salesRoles.forEach((r: any) => {
         const v = String(r.role || '').trim();
         if (v) allCargos.push(v);
       });
     }
 
     const { data: searchData, error: e2 } = await getExternalSupabase().rpc('search_contacts_advanced', {
       p_cliente_ativado: true,
       p_page: 0,
       p_page_size: 200,
     });
 
     if (!e2 && searchData) {
       const results = (searchData as any)?.results || [];
       results.forEach((r: any) => {
         const v = String(r.cargo || '').trim();
         if (v) allCargos.push(v);
       });
     }
 
     return [...new Set(allCargos)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
   }
 }