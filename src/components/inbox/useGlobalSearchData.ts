import { useState, useCallback, useEffect, useMemo } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { getExternalSupabase, isExternalConfigured } from '@/integrations/supabase/externalClient';
import { useDebounce } from '@/hooks/system/useDebounce';
import { useSearchHistory } from '@/hooks/system/useSearchHistory';
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
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allTags, setAllTags] = useState<TagSuggestion[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [activeTypes, setActiveTypes] = useState<Set<ResultType>>(new Set(['message', 'transcription', 'contact', 'action', 'crm']));
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all');
  const [showFilters, setShowFilters] = useState(false);

  const { history, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();

  useEffect(() => {
    if (open) {
      supabase.from('tags').select('id, name, color').order('name').then(({ data }) => {
        if (data) setAllTags(data);
      });
    }
  }, [open]);

  useEffect(() => {
    if (search.startsWith('#') || search.includes(' #')) {
      const tagQuery = search.includes(' #')
        ? search.split(' #').pop()?.toLowerCase() || ''
        : search.slice(1).toLowerCase();
      setTagSuggestions(allTags.filter(t => t.name.toLowerCase().includes(tagQuery) && !selectedTags.includes(t.id)).slice(0, 5));
    } else {
      setTagSuggestions([]);
    }
  }, [search, allTags, selectedTags]);

  const toggleType = useCallback((type: ResultType) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); } else { next.add(type); }
      return next;
    });
  }, []);

  const performSearch = useCallback(async (query: string, types: Set<ResultType>, dateRange: DateFilter, tags: string[], mediaType: MediaTypeFilter = 'all') => {
    const cleanQuery = query.replace(/#\w*/g, '').trim();
    if (cleanQuery.length < 2 && tags.length === 0 && mediaType === 'all') { setResults([]); return; }

    const isLinkSearch = mediaType === 'link';
    setIsLoading(true);
    const dateStart = getDateFilterStart(dateRange);

    try {
      const searchResults: SearchResult[] = [];
      const addedMessageIds = new Set<string>();

      if (types.has('message') && (cleanQuery.length >= 2 || mediaType !== 'all')) {
        let textQuery = supabase.from('messages')
          .select(`id, content, message_type, created_at, contact_id, contacts:contact_id (id, name, surname)`)
          .order('created_at', { ascending: false }).limit(20);

        if (cleanQuery.length >= 2) {
          if (isLinkSearch) {
            textQuery = textQuery.or(`content.ilike.%http://%,content.ilike.%https://%,content.ilike.%www.%`);
            textQuery = textQuery.ilike('content', `%${cleanQuery}%`);
          } else {
            textQuery = textQuery.ilike('content', `%${cleanQuery}%`);
          }
        } else if (isLinkSearch) {
          textQuery = textQuery.or(`content.ilike.%http://%,content.ilike.%https://%,content.ilike.%www.%`);
        }

        if (mediaType !== 'all' && mediaType !== 'link') textQuery = textQuery.eq('message_type', mediaType);
        if (dateStart) textQuery = textQuery.gte('created_at', dateStart.toISOString());

        const { data: textMessages } = await textQuery;
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

      if (types.has('transcription') && cleanQuery.length >= 2) {
        let audioQuery = supabase.from('messages')
          .select(`id, content, transcription, message_type, created_at, contact_id, contacts:contact_id (id, name, surname)`)
          .not('transcription', 'is', null).ilike('transcription', `%${cleanQuery}%`)
          .order('created_at', { ascending: false }).limit(15);
        if (dateStart) audioQuery = audioQuery.gte('created_at', dateStart.toISOString());

        const { data: audioMessages } = await audioQuery;
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

      if (types.has('contact')) {
        let contactQuery = supabase.from('contacts').select('id, name, surname, phone, email, created_at, tags');
        if (cleanQuery.length >= 2) contactQuery = contactQuery.or(`name.ilike.%${cleanQuery}%,surname.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%,email.ilike.%${cleanQuery}%`);

        const { data: contacts } = await contactQuery.order('name', { ascending: true }).limit(10);
        if (contacts) {
          let filtered = contacts;
          if (tags.length > 0) {
            const tagNames = allTags.filter(t => tags.includes(t.id)).map(t => t.name);
            filtered = contacts.filter(c => c.tags && c.tags.some((tag: string) => tagNames.includes(tag)));
          }
          filtered.forEach((contact) => {
            searchResults.push({
              id: contact.id, type: 'contact',
              title: `${contact.name}${contact.surname ? ` ${contact.surname}` : ''}`,
              preview: contact.phone || contact.email || '',
              timestamp: new Date(contact.created_at), contactId: contact.id, tags: contact.tags,
            });
          });
        }
      }

      if (types.has('crm') && isExternalConfigured && cleanQuery.length >= 3) {
        try {
          const { data: crmData } = await getExternalSupabase().rpc('search_contacts_advanced', {
            p_search: cleanQuery, p_vendedor: null, p_ramo: null, p_rfm_segment: null,
            p_estado: null, p_cliente_ativado: null, p_ja_comprou: null,
            p_sort_by: 'relevance', p_page: 0, p_page_size: 8,
          });
          if (crmData?.results) {
            const localPhones = new Set(searchResults.filter(r => r.type === 'contact').map(r => r.preview.replace(/\D/g, '')));
            crmData.results.forEach((cr: Record<string, string | null>) => {
              const phone = cr.phone_primary?.replace(/\D/g, '') || '';
              if (phone && localPhones.has(phone)) return;
              searchResults.push({
                id: `crm-${cr.contact_id}`, type: 'crm',
                title: cr.full_name || cr.nome_tratamento || 'Sem nome',
                preview: [cr.company_name, cr.phone_primary, cr.rfm_segment].filter(Boolean).join(' • '),
                timestamp: new Date(), crmPhone: cr.phone_primary,
              });
            });
          }
        } catch (err) { log.error('Unexpected error in useGlobalSearchData:', err); }
      }

      searchResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      setResults(searchResults);
      if (cleanQuery.length >= 2) addToHistory(cleanQuery, searchResults.length);
    } catch (error) {
      log.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [addToHistory, allTags]);

  const debouncedSearch = useDebounce((query: string) => {
    performSearch(query, activeTypes, dateFilter, selectedTags, mediaTypeFilter);
  }, 300);

  const handleSearch = useCallback((query: string) => {
    setSearch(query);
    setSelectedIndex(0);
    debouncedSearch(query);
  }, [debouncedSearch]);

  useEffect(() => {
    if (search.length >= 2 || selectedTags.length > 0 || mediaTypeFilter !== 'all') {
      performSearch(search, activeTypes, dateFilter, selectedTags, mediaTypeFilter);
    }
  }, [activeTypes, dateFilter, selectedTags, mediaTypeFilter]);

  const handleTagSelect = useCallback((tag: TagSuggestion) => {
    setSelectedTags(prev => [...prev, tag.id]);
    setSearch(prev => prev.replace(/#\w*$/, '').trim());
    setTagSuggestions([]);
  }, []);

  const removeTag = useCallback((tagId: string) => {
    setSelectedTags(prev => prev.filter(t => t !== tagId));
  }, []);

  return {
    search, setSearch, isLoading, results, setResults, selectedIndex, setSelectedIndex,
    allTags, tagSuggestions, selectedTags, activeTypes, dateFilter, setDateFilter,
    mediaTypeFilter, setMediaTypeFilter, showFilters, setShowFilters,
    history, removeFromHistory, clearHistory,
    toggleType, handleSearch, handleTagSelect, removeTag, performSearch,
  };
}
