import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUrlFilters } from '@/hooks/system/useUrlFilters';
import { InboxFiltersState } from '@/components/inbox/InboxFilters';
import { FILTER_OPTIONS } from '@/components/inbox/ContactTypeFilter';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';
import { parseISO } from 'date-fns';
import { localDayKey } from '@/lib/localDay';
import { MainTab, SubTab, ChipTab } from '@/components/inbox/TicketTabs';
import {
  hasContact,
  isSnoozed,
  isUnread,
  isOpenActive,
  isAttending,
  isWaiting,
  isResolved,
  isArchived,
  isInQueue,
  passesExtraFilters,
  countByChip,
} from './chipCounts';

interface UseInboxFiltersProps {
  conversations: ConversationWithMessages[];
  profileId: string | undefined;
  // Contatos adiados (R2-INB-029): a lista ativa não mostra conversa adiada e a
  // retomada acontece quando o conjunto encolhe no vencimento do prazo.
  snoozedIds?: Set<string>;
}

/** Estado da inbox que o usuário espera reencontrar ao reabrir a tela. */
interface InboxFilterPrefs {
  chipTab: ChipTab;
  mainTab: MainTab;
  subTab: SubTab | null;
  queueId: string | null;
  contactType: string | null;
}

const CHIP_TABS: readonly ChipTab[] =
  ['all', 'unread', 'attending', 'waiting', 'resolved', 'archived'];
const DEFAULT_CHIP: ChipTab = 'attending';

/** Sem identidade o filtro não é guardado — `draft` vive só nesta sessão. */
const NO_OWNER = '';

/**
 * Convenção da casa: `zapp.<area>:<dono>` em localStorage — filtro é do
 * usuário, não do navegador (mesmo escopo do histórico de busca e dos rascunhos).
 */
export function inboxFiltersStorageKey(userId: string): string {
  return `zapp.inbox.filters:${userId}`;
}

/** Chips derivam mainTab/subTab (compat com os filtros existentes). */
function tabsForChip(tab: ChipTab): { mainTab: MainTab; subTab: SubTab | null } {
  return {
    mainTab: tab === 'resolved' ? 'resolved' : 'open',
    subTab: tab === 'attending' ? 'attending' : tab === 'waiting' ? 'waiting' : null,
  };
}

/** Valor desconhecido (versão antiga, dado adulterado) não vira filtro. */
function normalizeContactType(value: unknown): string | null {
  return typeof value === 'string' && value !== 'all' && FILTER_OPTIONS.some((o) => o.value === value)
    ? value
    : null;
}

/**
 * Lê a preferência do dono. Storage hostil: JSON corrompido, raiz que não é
 * objeto e campo de valor desconhecido caem no padrão, campo a campo.
 */
function readStoredPrefs(storageKey: string | null): Partial<InboxFilterPrefs> | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const data = parsed as Record<string, unknown>;
    return {
      chipTab:
        typeof data.chipTab === 'string' && (CHIP_TABS as readonly string[]).includes(data.chipTab)
          ? (data.chipTab as ChipTab)
          : DEFAULT_CHIP,
      queueId: typeof data.queueId === 'string' && data.queueId.length > 0 ? data.queueId : null,
      contactType: normalizeContactType(data.contactType),
    };
  } catch {
    return null;
  }
}

export function useInboxFilters({ conversations, profileId, snoozedIds }: UseInboxFiltersProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = profileId ? inboxFiltersStorageKey(profileId) : null;
  const ownerKey = storageKey ?? NO_OWNER;

  const storedPrefs = useMemo(() => readStoredPrefs(storageKey), [storageKey]);
  const [draft, setDraft] = useState<Record<string, InboxFilterPrefs>>({});

  const basePrefs = useMemo<InboxFilterPrefs>(() => {
    const chipTab = storedPrefs?.chipTab ?? DEFAULT_CHIP;
    const typeParam = searchParams.get('type');
    const contactType = typeParam !== null
      ? normalizeContactType(typeParam)
      : storedPrefs?.contactType ?? null;
    return {
      chipTab,
      ...tabsForChip(chipTab),
      queueId: storedPrefs?.queueId ?? null,
      contactType,
    };
  }, [storedPrefs, searchParams]);

  const prefs = draft[ownerKey] ?? basePrefs;
  const { chipTab, mainTab, subTab, queueId: selectedQueueId, contactType: selectedContactType } = prefs;

  const applyPrefs = useCallback((patch: Partial<InboxFilterPrefs>) => {
    setDraft((prev) => {
      const atual = prev[ownerKey] ?? basePrefs;
      const next = { ...atual, ...patch };
      if (storageKey) {
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ chipTab: next.chipTab, queueId: next.queueId, contactType: next.contactType }),
          );
        } catch { /* storage unavailable */ }
      }
      return { ...prev, [ownerKey]: next };
    });
  }, [basePrefs, ownerKey, storageKey]);

  const [showAll, setShowAll] = useState(false);

  const { filters: urlFilters, setFilters: setUrlFilters, clearFilters: clearUrlFilters } = useUrlFilters();

  const setChipTab = useCallback((tab: ChipTab) => {
    applyPrefs({ chipTab: tab, ...tabsForChip(tab) });
  }, [applyPrefs]);

  const setMainTab = useCallback((tab: MainTab) => applyPrefs({ mainTab: tab }), [applyPrefs]);
  const setSubTab = useCallback((tab: SubTab | null) => applyPrefs({ subTab: tab }), [applyPrefs]);
  const setSelectedQueueId = useCallback((id: string | null) => applyPrefs({ queueId: id }), [applyPrefs]);

  const handleContactTypeChange = useCallback((value: string | null) => {
    applyPrefs({ contactType: value && value !== 'all' ? value : null });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== 'all') {
        next.set('type', value);
      } else {
        next.delete('type');
      }
      return next;
    }, { replace: true });
  }, [applyPrefs, setSearchParams]);

  // Quando o URL muda por navegação browser (back/forward), o rascunho do dono
  // ainda guarda o valor antigo e sobrepõe basePrefs. Este efeito detecta a troca
  // externa do param `type` e sincroniza o rascunho — sem isso o filtro de tipo
  // não acompanha o botão de voltar.
  const lastUrlType = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const urlType = normalizeContactType(searchParams.get('type'));
    if (lastUrlType.current === undefined) {
      lastUrlType.current = urlType;
      return;
    }
    if (urlType !== lastUrlType.current) {
      lastUrlType.current = urlType;
      setDraft((prev) => {
        const atual = prev[ownerKey] ?? basePrefs;
        return { ...prev, [ownerKey]: { ...atual, contactType: urlType } };
      });
    }
  }, [searchParams, ownerKey, basePrefs]);

  const filters = useMemo<InboxFiltersState>(() => ({
    status: urlFilters.status,
    agentId: urlFilters.agentId,
    dateRange: {
      from: urlFilters.dateFrom ? parseISO(urlFilters.dateFrom) : null,
      to: urlFilters.dateTo ? parseISO(urlFilters.dateTo) : null,
    },
  }), [urlFilters]);

  const [search, setSearch] = useState('');

  const setFilters = useCallback((newFilters: InboxFiltersState) => {
    setUrlFilters({
      status: newFilters.status,
      agentId: newFilters.agentId,
      dateFrom: localDayKey(newFilters.dateRange.from),
      dateTo: localDayKey(newFilters.dateRange.to),
    });
  }, [setUrlFilters]);

  const extraFilterContext = useMemo(
    () => ({ search, selectedContactType, filters }),
    [search, selectedContactType, filters],
  );

  const filteredConversations = useMemo(() => {
    let result = conversations.filter(hasContact);
    result = result.filter(c => !isSnoozed(c, snoozedIds));
    if (chipTab === 'archived') {
      result = result.filter(isArchived);
      if (selectedQueueId) {
        result = result.filter(c => isInQueue(c, selectedQueueId));
      }
    } else if (mainTab === 'open') {
      result = result.filter(isOpenActive);
      if (subTab === 'attending') {
        if (!showAll) {
          result = result.filter(c => isAttending(c, profileId));
        }
      } else if (subTab === 'waiting') {
        result = result.filter(isWaiting);
      }
      if (selectedQueueId) {
        result = result.filter(c => isInQueue(c, selectedQueueId));
      }
    } else if (mainTab === 'resolved') {
      result = result.filter(isResolved);
    }
    if (chipTab === 'unread') {
      result = result.filter(isUnread);
    }
    result = result.filter((c) => passesExtraFilters(c, extraFilterContext));
    result.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : new Date(a.contact.updated_at).getTime();
      const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : new Date(b.contact.updated_at).getTime();
      return bTime - aTime;
    });
    return result;
  }, [conversations, extraFilterContext, mainTab, subTab, chipTab, showAll, selectedQueueId, profileId, snoozedIds]);

  const chipCounts = useMemo(
    () =>
      countByChip(conversations, profileId, {
        snoozedIds,
        showAll,
        selectedQueueId,
        ...extraFilterContext,
      }),
    [conversations, profileId, snoozedIds, showAll, selectedQueueId, extraFilterContext],
  );

  return {
    chipTab, setChipTab,
    mainTab, setMainTab,
    subTab, setSubTab,
    showAll, setShowAll,
    selectedQueueId, setSelectedQueueId,
    selectedContactType, handleContactTypeChange,
    filters, setFilters,
    search, setSearch,
    filteredConversations,
    chipCounts,
    clearUrlFilters,
  };
}
