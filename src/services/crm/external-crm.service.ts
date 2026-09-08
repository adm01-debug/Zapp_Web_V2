import { callCRMIntegration } from '@/lib/crmIntegration';
import { queryExternalProxy } from '@/lib/externalProxy';
import { log } from '@/lib/logger';
import type { ExternalDBFilter } from '@/types/externalDB';
import type { EvolutionMessage } from '@/types/evolutionExternal';

interface ContactSearchItem {
  company_name?: string | null;
  cargo?: string | null;
}

interface ContactSearchResponse {
  results?: ContactSearchItem[];
}
 
 export class ExternalCRMService {
   static async getContact360Batch(phones: string[]) {
     const cleanedPhones = [...new Set(phones.map(p => p.replace(/[^0-9]/g, '')).filter(p => p.length >= 8))];
     if (cleanedPhones.length === 0) return new Map();
 
     try {
       const { data } = await callCRMIntegration<Record<string, unknown>>('rpc', {
         rpc: 'get_companies_by_phones_batch',
         params: { p_phones: cleanedPhones },
       });
       const map = new Map<string, unknown>();
       if (data && typeof data === 'object') {
         for (const [phone, info] of Object.entries(data)) {
           map.set(phone, info);
           const clean = phone.replace(/[^0-9]/g, '');
           if (clean !== phone) map.set(clean, info);
           if (!phone.startsWith('55') && clean.length <= 11) map.set('55' + clean, info);
         }
       }
       return map;
     } catch (error) {
       log.error('[ExternalCRMService] Batch CRM lookup error:', error);
       return new Map();
     }
   }
 
   static async queryExternal<T = unknown>(params: {
     table: string;
     select?: string;
     filters?: ExternalDBFilter[];
     order?: { column: string; ascending?: boolean };
     limit?: number;
     offset?: number;
     countMode?: 'exact' | 'planned' | 'estimated';
   }) {
     const response = await callCRMIntegration<T[]>('select', params);
     return {
       data: response.data || [],
       meta: response.meta || { record_count: 0, duration_ms: 0, severity: 'ok' as const },
     };
   }
 
   static async callRPC<T = unknown>(rpc: string, params?: Record<string, unknown>) {
     const response = await callCRMIntegration<T | T[]>('rpc', { rpc, params: params || {} });
     const data = response.data;
     return {
       data: Array.isArray(data) ? data as T[] : [data as T],
       meta: response.meta || { record_count: Array.isArray(data) ? data.length : 1, duration_ms: 0, severity: 'ok' as const },
     };
   }
 
   static async fetchEvolutionMessages(limit = 500) {
     const result = await queryExternalProxy<EvolutionMessage>({
       table: 'evolution_messages',
       select: '*',
       order: { column: 'created_at', ascending: false },
       limit,
     });
     return result.data;
   }
 
   static async fetchEvolutionMessagesByJid(remoteJid: string, limit = 1000) {
     const result = await queryExternalProxy<EvolutionMessage>({
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
 
     try {
       const { data } = await callCRMIntegration<unknown>('rpc', {
         rpc: 'get_contact_360_by_phone', params: { p_phone: cleanedPhone },
       });
       return data;
     } catch (error) {
       log.error('[ExternalCRMService] Error fetching contact 360:', error);
       return null;
     }
   }
 
   static async fetchUniqueCompanies(maxPages = 5, pageSize = 200) {
     const allNames: string[] = [];
     let page = 0;
 
     while (page < maxPages) {
       let data: ContactSearchResponse;
       try {
         ({ data } = await callCRMIntegration<ContactSearchResponse>('rpc', {
           rpc: 'search_contacts_advanced',
           params: {
             p_search: null, p_vendedor: null, p_ramo: null, p_rfm_segment: null,
             p_estado: null, p_cliente_ativado: true, p_ja_comprou: null,
             p_sort_by: 'name', p_page: page, p_page_size: pageSize,
           },
         }));
       } catch (error) {
         log.error('[ExternalCRMService] Error fetching companies:', error);
         break;
       }
 
       const results = data?.results || [];
       if (results.length === 0) break;
 
       results.forEach((r) => {
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
 
     let salesRoles: Array<{ role: string | null }> = [];
     try {
       const response = await callCRMIntegration<Array<{ role: string | null }>>('select', {
         table: 'salespeople', select: 'role', limit: 500,
       });
       salesRoles = response.data || [];
     } catch (error) {
       log.error('[ExternalCRMService] Error fetching sales roles:', error);
     }
     if (salesRoles) {
       salesRoles.forEach((r) => {
         const v = String(r.role || '').trim();
         if (v) allCargos.push(v);
       });
     }
 
     let searchData: ContactSearchResponse | null = null;
     try {
       const response = await callCRMIntegration<ContactSearchResponse>('rpc', {
         rpc: 'search_contacts_advanced',
         params: { p_cliente_ativado: true, p_page: 0, p_page_size: 200 },
       });
       searchData = response.data;
     } catch (error) {
       log.error('[ExternalCRMService] Error fetching role facets:', error);
     }
     if (searchData) {
       const results = searchData.results || [];
       results.forEach((r) => {
         const v = String(r.cargo || '').trim();
         if (v) allCargos.push(v);
       });
     }
 
     return [...new Set(allCargos)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
   }
 }
