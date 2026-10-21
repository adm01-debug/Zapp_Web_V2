import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { callCRMIntegration } from '@/lib/crmIntegration';
import { useSearchHistory } from '@/hooks/system/useSearchHistory';
import { useUserRole } from '@/hooks/system/useUserRole';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { escapeLikeWildcards } from '@/lib/emailThreadQuery';
import { subDays, subMonths, startOfDay } from 'date-fns';

export interface SearchResult {
  id: string;
  type: 'message' | 'contact' | 'transcription' | 'action' | 'crm';
  title: string;
  preview: string;
  timestamp: Date;
  contactId?: string;
  contactName?: string;
  messageType?: string;
  tags?: string[];
  action?: () => void;
  crmPhone?: string;
}

export type ResultType = 'message' | 'contact' | 'transcription' | 'action' | 'crm';
export type DateFilter = 'all' | 'today' | '7days' | '30days' | '90days';
export type MediaTypeFilter = 'all' | 'text' | 'image' | 'video' | 'audio' | 'document' | 'link';

export interface TagSuggestion { id: string; name: string; color: string; }

/** Mínimo de caracteres para a busca virar evento (abaixo disso é navegação, não consulta). */
export const MIN_SEARCH_EVENT_TERM_LENGTH = 3;

/**
 * Filtro LEVE no cliente: termo que pareça e-mail, telefone/CPF/CNPJ ou token
 * não é enviado. A RPC `log_search_event` descarta os MESMOS casos no servidor —
 * esta é só a primeira barreira, para o dado nem sair do navegador.
 */
export function isLoggableSearchTerm(term: string): boolean {
  const t = term.trim();
  if (t.length < MIN_SEARCH_EVENT_TERM_LENGTH) return false;
  if (t.includes('@')) return false;
  if (t.replace(/\D/g, '').length >= 7) return false;
  if (/[A-Za-z0-9._~+/=-]{32,}/.test(t)) return false;
  return true;
}

/** UUID aleatório estável também em browsers sem `crypto.randomUUID`. */
function createSearchEventId(): string | null {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') return null;

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface LogSearchEventArgs {
  p_term: string;
  p_result_count: number;
  p_clicked: boolean;
  p_event_id: string;
  p_result_kind: SearchResult['type'] | null;
}

/**
 * A função é versionada por migration, mas ainda não está em
 * `src/integrations/supabase/types.ts` (arquivo gerado pelo types-sync). O
 * cliente tipado recusaria o nome da RPC, então a chamada passa por este facade.
 */
const searchEventsRpc = supabase as unknown as {
  rpc(fn: 'log_search_event', args: LogSearchEventArgs):
    PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

function getDateFilterStart(filter: DateFilter): Date | null {
  const now = new Date();
  switch (filter) {
    case 'today': return startOfDay(now);
    case '7days': return subDays(now, 7);
    case '30days': return subMonths(now, 1);
    case '90days': return subMonths(now, 3);
    default: return null;
  }
}

export function useGlobalSearchData(open: boolean) {
  const { isSupervisor } = useUserRole();
  const crmIntegrationEnabled = useCRMIntegrationEnabled();
  const searchRequestId = useRef(0);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allTags, setAllTags] = useState<TagSuggestion[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<ResultType>>(new Set(['message', 'transcription', 'contact', 'action', 'crm']));
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  const { history, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();

  /**
   * Termo da última busca CONCLUÍDA: o clique reusa o MESMO termo e a contagem
   * de resultados daquela busca (o evento de clique não é uma busca nova).
   */
  const lastSearchEvent = useRef<{ term: string; resultCount: number; eventId: string; clicked: boolean } | null>(null);
  /** Último termo já registrado: uma chamada por termo, não por tecla nem por filtro. */
  const lastLoggedTerm = useRef<string | null>(null);

  /**
   * Envia UM evento de busca para a RPC `log_search_event`, em segundo plano.
   * Telemetria NUNCA atrapalha a busca: erro é registrado no log e nada mais —
   * sem toast, sem mexer no resultado na tela e sem o termo no console.
   */
  const logSearchEvent = useCallback(async (
    term: string,
    resultCount: number,
    eventId: string,
    clicked: boolean,
    resultKind: SearchResult['type'] | null = null,
  ) => {
    if (!isLoggableSearchTerm(term)) return;
    try {
      const { error } = await searchEventsRpc.rpc('log_search_event', {
        p_term: term,
        p_result_count: resultCount,
        p_clicked: clicked,
        p_event_id: eventId,
        p_result_kind: resultKind,
      });
      if (error) throw error;
    } catch (error) {
      log.error('Register search event error:', error);
    }
  }, []);

  /**
   * Clique num resultado: mouse e teclado passam pelo mesmo `handleSelect` do
   * host (`GlobalSearch`), então o Enter conta igual ao clique.
   */
  const registerResultClick = useCallback((resultKind: SearchResult['type']) => {
    const last = lastSearchEvent.current;
    if (!last || last.clicked) return;
    last.clicked = true;
    void logSearchEvent(last.term, last.resultCount, last.eventId, true, resultKind);
  }, [logSearchEvent]);

  useEffect(() => {
    if (open) {
      supabase.from('contacts').select('tags').not('tags', 'is', null).then(({ data }) => {
        if (data) {
          const tagSet = new Set<string>();
          data.forEach(c => (c.tags || []).forEach((t: string) => tagSet.add(t)));
          setAllTags([...tagSet].sort((a, b) => a.localeCompare(b)).map(name => ({ id: name, name, color: '#6366f1' })));
        }
      });
    }
  }, [open]);

  const tagSuggestions = useMemo(() => {
    if (search.startsWith('#') || search.includes(' #')) {
      const tagQuery = search.includes(' #')
        ? search.split(' #').pop()?.toLowerCase() || ''
        : search.slice(1).toLowerCase();
      return allTags
        .filter(t => t.name.toLowerCase().includes(tagQuery) && !selectedTags.includes(t.id))
        .slice(0, 5);
    }
    return [];
  }, [search, allTags, selectedTags]);

  const toggleType = useCallback((type: ResultType) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); } else { next.add(type); }
      return next;
    });
  }, []);

  const performSearch = useCallback(async (query: string, types: Set<ResultType>, dateRange: DateFilter, tags: string[], mediaType: MediaTypeFilter = 'all') => {
    const requestId = ++searchRequestId.current;
    const cleanQuery = query.replace(/#\w*/g, '').trim();
    if (cleanQuery.length < 2 && tags.length === 0 && mediaType === 'all') {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const isLinkSearch = mediaType === 'link';
    setIsLoading(true);
    const dateStart = getDateFilterStart(dateRange);

    try {
      const searchResults: SearchResult[] = [];
      const addedMessageIds = new Set<string>();

      if (types.has('message') && (cleanQuery.length >= 2 || mediaType !== 'all')) {
        const contactSelect = tags.length > 0
          ? 'contacts!inner (id, name, surname, tags)'
          : 'contacts:contact_id (id, name, surname)';
        let textQuery = supabase.from('messages')
          .select(`id, content, message_type, created_at, contact_id, ${contactSelect}`)
          .order('created_at', { ascending: false }).limit(20);

        if (cleanQuery.length >= 2) {
          if (isLinkSearch) {
            textQuery = textQuery.or(`content.ilike.%http://%,content.ilike.%https://%,content.ilike.%www.%`);
            textQuery = textQuery.ilike('content', `%${escapeLikeWildcards(cleanQuery)}%`);
          } else {
            textQuery = textQuery.ilike('content', `%${escapeLikeWildcards(cleanQuery)}%`);
          }
        } else if (isLinkSearch) {
          textQuery = textQuery.or(`content.ilike.%http://%,content.ilike.%https://%,content.ilike.%www.%`);
        }

        if (mediaType !== 'all' && mediaType !== 'link') textQuery = textQuery.eq('message_type', mediaType);
        if (dateStart) textQuery = textQuery.gte('created_at', dateStart.toISOString());
        if (tags.length > 0) textQuery = textQuery.overlaps('contacts.tags', tags);

        const { data: textMessages, error: textError } = await textQuery;
        if (textError) {
          log.error('Search messages error:', textError);
        } else {
          textMessages?.forEach((msg) => {
            const contact = msg.contacts as { id: string; name: string; surname: string | null } | null;
            addedMessageIds.add(msg.id);
            searchResults.push({
              id: msg.id, type: 'message',
              title: contact ? `Conversa com ${contact.name}${contact.surname ? ` ${contact.surname}` : ''}` : 'Mensagem',
              preview: msg.content.length > 100 ? `${msg.content.substring(0, 100)}...` : msg.content,
              timestamp: new Date(msg.created_at), contactId: msg.contact_id || undefined,
              contactName: contact ? `${contact.name}${contact.surname ? ` ${contact.surname}` : ''}` : undefined,
              messageType: msg.message_type,
            });
          });
        }
      }

      if (types.has('transcription') && cleanQuery.length >= 2) {
        const contactSelect = tags.length > 0
          ? 'contacts!inner (id, name, surname, tags)'
          : 'contacts:contact_id (id, name, surname)';
        let audioQuery = supabase.from('messages')
          .select(`id, content, transcription, message_type, created_at, contact_id, ${contactSelect}`)
          .not('transcription', 'is', null).ilike('transcription', `%${escapeLikeWildcards(cleanQuery)}%`)
          .order('created_at', { ascending: false }).limit(15);
        if (dateStart) audioQuery = audioQuery.gte('created_at', dateStart.toISOString());
        if (tags.length > 0) audioQuery = audioQuery.overlaps('contacts.tags', tags);

        const { data: audioMessages, error: audioError } = await audioQuery;
        if (audioError) {
          log.error('Search transcriptions error:', audioError);
        } else {
          audioMessages?.forEach((msg) => {
            if (addedMessageIds.has(msg.id)) return;
            const contact = msg.contacts as { id: string; name: string; surname: string | null } | null;
            const transcription = msg.transcription || '';
            searchResults.push({
              id: msg.id, type: 'transcription',
              title: contact ? `Áudio de ${contact.name}${contact.surname ? ` ${contact.surname}` : ''}` : 'Áudio transcrito',
              preview: transcription.length > 100 ? `${transcription.substring(0, 100)}...` : transcription,
              timestamp: new Date(msg.created_at), contactId: msg.contact_id || undefined,
              contactName: contact ? `${contact.name}${contact.surname ? ` ${contact.surname}` : ''}` : undefined,
              messageType: msg.message_type,
            });
          });
        }
      }

      if (types.has('contact')) {
        let contactQuery = supabase.from('contacts').select('id, name, surname, phone, email, created_at, tags').eq('is_lid_legacy', false);
        if (cleanQuery.length >= 2) {
          const q = escapeOrFilterValue(`%${escapeLikeWildcards(cleanQuery)}%`);
          contactQuery = contactQuery.or(`name.ilike.${q},surname.ilike.${q},phone.ilike.${q},email.ilike.${q}`);
        }
        // A tag entra na CONSULTA, antes do `.limit(10)`: filtrar em JS depois do
        // LIMIT devolvia zero quando o contato marcado era o 11º da ordem.
        if (tags.length > 0) contactQuery = contactQuery.overlaps('tags', tags);

        const { data: contacts, error: contactError } = await contactQuery.order('name', { ascending: true }).limit(10);
        if (contactError) {
          log.error('Search contacts error:', contactError);
        } else {
          contacts?.forEach((contact) => {
            searchResults.push({
              id: contact.id, type: 'contact',
              title: `${contact.name}${contact.surname ? ` ${contact.surname}` : ''}`,
              preview: contact.phone ?? contact.email ?? '',
              timestamp: new Date(contact.created_at), contactId: contact.id, tags: contact.tags ?? undefined,
            });
          });
        }
      }

      if (types.has('crm') && isSupervisor && crmIntegrationEnabled && cleanQuery.length >= 3) {
        try {
          const { data: crmData } = await callCRMIntegration<{ results?: Record<string, string | null>[] }>('rpc', {
            rpc: 'search_contacts_advanced',
            params: { p_search: cleanQuery, p_vendedor: null, p_ramo: null, p_rfm_segment: null,
              p_estado: null, p_cliente_ativado: null, p_ja_comprou: null,
              p_sort_by: 'relevance', p_page: 0, p_page_size: 8 },
          });
          if (crmData?.results) {
            const externalIds = crmData.results
              .map((result) => result.contact_id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0);
            const { data: links, error: linksError } = externalIds.length
              ? await supabase.from('crm_contact_links')
                .select('zapp_contact_id,external_contact_id').in('external_contact_id', externalIds)
              : { data: [], error: null };
            if (linksError) log.error('Search CRM links error:', linksError);
            const localByExternalId = new Map((links || []).map((link) => [link.external_contact_id, link.zapp_contact_id]));
            const localPhones = new Set(searchResults.filter(r => r.type === 'contact').map(r => r.preview.replace(/\D/g, '')));
            crmData.results.forEach((cr: Record<string, string | null>) => {
              const phone = cr.phone_primary?.replace(/\D/g, '') || '';
              if (phone && localPhones.has(phone)) return;
              const contactId = cr.contact_id ? localByExternalId.get(cr.contact_id) : undefined;
              if (!contactId) return;
              searchResults.push({
                id: `crm-${cr.contact_id}`, type: 'crm',
                title: cr.full_name || cr.nome_tratamento || 'Sem nome',
                preview: [cr.company_name, cr.phone_primary, cr.rfm_segment].filter(Boolean).join(' • '),
                timestamp: new Date(), contactId, crmPhone: cr.phone_primary ?? undefined,
              });
            });
          }
        } catch (err) { log.error('Unexpected error in useGlobalSearchData:', err); }
      }

      searchResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      if (requestId !== searchRequestId.current) return;
      setResults(searchResults);
      if (cleanQuery.length >= 2) addToHistory(cleanQuery, searchResults.length);
      // Telemetria da trilha de busca: o resultado já está na tela quando a RPC
      // sai (`void`). Uma vez por termo — mudar um filtro reexecuta a busca, mas
      // o mesmo termo não conta duas vezes.
      if (cleanQuery.length < MIN_SEARCH_EVENT_TERM_LENGTH) {
        // Uma busca curta pode mostrar resultados, mas não pertence à telemetria
        // da busca anterior; evita atribuir a ela um clique antigo.
        lastSearchEvent.current = null;
        lastLoggedTerm.current = null;
      } else if (cleanQuery !== lastLoggedTerm.current) {
        // O mesmo UUID torna o clique um update idempotente do evento da busca,
        // em vez de inflar a métrica como se fosse uma segunda busca.
        const eventId = createSearchEventId();
        if (eventId) {
          lastLoggedTerm.current = cleanQuery;
          lastSearchEvent.current = { term: cleanQuery, resultCount: searchResults.length, eventId, clicked: false };
          void logSearchEvent(cleanQuery, searchResults.length, eventId, false);
        } else {
          lastSearchEvent.current = null;
        }
      }
    } catch (error) {
      log.error('Search error:', error);
      if (requestId === searchRequestId.current) setResults([]);
    } finally {
      if (requestId === searchRequestId.current) setIsLoading(false);
    }
  }, [addToHistory, crmIntegrationEnabled, isSupervisor, logSearchEvent]);

  const handleSearch = useCallback((query: string) => {
    searchRequestId.current += 1;
    setSearch(query);
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    if (search.length >= 2 || selectedTags.length > 0 || mediaTypeFilter !== 'all') {
      searchRequestId.current += 1;
      const timer = window.setTimeout(() => {
        void performSearch(search, activeTypes, dateFilter, selectedTags, mediaTypeFilter);
      }, 300);
      return () => window.clearTimeout(timer);
    } else {
      searchRequestId.current += 1;
      lastSearchEvent.current = null;
      lastLoggedTerm.current = null;
      const timer = window.setTimeout(() => {
        setResults([]);
        setIsLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [search, activeTypes, dateFilter, selectedTags, mediaTypeFilter, performSearch]);

  const resetFilters = useCallback(() => {
    setActiveTypes(new Set(['message', 'transcription', 'contact', 'action', 'crm']));
    setDateFilter('all');
    setMediaTypeFilter('all');
    setSelectedTags([]);
  }, []);

  const handleTagSelect = useCallback((tag: TagSuggestion) => {
    setSelectedTags(prev => [...prev, tag.id]);
    setSearch(prev => prev.replace(/#\w*$/, '').trim());
  }, []);

  const removeTag = useCallback((tagId: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tagId));
  }, []);

  return {
    search, setSearch, isLoading, results, setResults, selectedIndex, setSelectedIndex,
    allTags, tagSuggestions, selectedTags, activeTypes, dateFilter, setDateFilter,
    mediaTypeFilter, setMediaTypeFilter, showFilters, setShowFilters,
    history, removeFromHistory, clearHistory,
    toggleType, handleSearch, handleTagSelect, removeTag, performSearch, resetFilters,
    registerResultClick,
  };
}
