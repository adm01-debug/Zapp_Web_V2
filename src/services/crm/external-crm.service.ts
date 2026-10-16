import { callCRMIntegration } from '@/lib/crmIntegration';
import { queryExternalProxy } from '@/lib/externalProxy';
import { log } from '@/lib/logger';
import type { ContactSidebarData } from '@/types/contactSidebar';
import type { ExternalDBFilter } from '@/types/externalDB';
import type { EvolutionMessage } from '@/types/evolutionExternal';

 export class ExternalCRMService {
   static async getContact360Batch(contacts: Array<{ id: string; phone: string }>) {
     const contactIds = [...new Set(contacts.map((contact) => contact.id).filter(Boolean))];
     if (contactIds.length === 0) return new Map();
 
     const chunks: string[][] = [];
     for (let index = 0; index < contactIds.length; index += 100) {
       chunks.push(contactIds.slice(index, index + 100));
     }
     const map = new Map<string, unknown>();
     let nextChunk = 0;
     let successfulChunks = 0;
     const worker = async () => {
       while (nextChunk < chunks.length) {
         const chunk = chunks[nextChunk++];
         try {
           const { data } = await callCRMIntegration<Record<string, unknown>>('contactLookupBatch', { contactIds: chunk });
           successfulChunks += 1;
       if (data && typeof data === 'object') {
         for (const [phone, info] of Object.entries(data)) {
           map.set(phone, info);
           const clean = phone.replace(/[^0-9]/g, '');
           if (clean !== phone) map.set(clean, info);
           if (!phone.startsWith('55') && clean.length <= 11) map.set('55' + clean, info);
         }
       }
         } catch (error) {
           log.error('[ExternalCRMService] CRM batch chunk failed:', error);
         }
       }
     };
     await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, () => worker()));
     if (successfulChunks === 0) throw new Error('Todos os lotes de enriquecimento CRM falharam');
     return map;
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
 
   static async getContact360(contactId: string) {
     try {
       const { data } = await callCRMIntegration<unknown>('contactLookup', { contactId, lookup: '360' });
       return data;
     } catch (error) {
       log.error('[ExternalCRMService] Error fetching contact 360:', error);
       return null;
     }
   }

   static async getContactSidebar(contactId: string): Promise<ContactSidebarData | null> {
     const { data } = await callCRMIntegration<ContactSidebarData>('contactLookup', { contactId, lookup: 'sidebar' });
     return data;
   }
 
   /**
    * Sugestões de empresa do formulário de contato (autocomplete).
    *
    * Fonte: ação estreita `companyNames` da Edge `crm-integration` (papel
    * `view_contacts`) → `companies.nome_fantasia|nome_crm|razao_social`, já
    * deduplicada/ordenada e com teto no servidor. Antes chamávamos
    * `rpc`→`search_contacts_advanced` (admin-only): o atendente levava 403 a
    * cada abertura do formulário e o supervisor baixava até 5×200 LINHAS de
    * contato (nome, telefone) só para extrair um texto.
    */
   static async fetchUniqueCompanies(): Promise<string[]> {
     const { data } = await callCRMIntegration<string[]>('companyNames');
     return Array.isArray(data) ? data : [];
   }

   /**
    * Sugestões de cargo do formulário de contato (autocomplete).
    *
    * Fonte: ação estreita `roleNames` da Edge `crm-integration` (papel
    * `view_contacts`) → `salespeople.role`, já deduplicada/ordenada no servidor.
    * Mesma troca de fonte do `fetchUniqueCompanies`: antes o RPC admin-only
    * devolvia linhas de contato e o atendente não recebia nada.
    */
   static async fetchUniqueRoles(): Promise<string[]> {
     const { data } = await callCRMIntegration<string[]>('roleNames');
     return Array.isArray(data) ? data : [];
   }
}
