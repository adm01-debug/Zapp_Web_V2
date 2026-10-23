import { useMemo, useCallback, useState } from 'react';
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

/** Sem identidade o filtro não é guardado — o rascunho vive só nesta sessão. */
const NO_OWNER = '';

/**
 * Convenção da casa: `zapp.<area>:<dono>` em localStorage — o filtro é do
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
  const storageKey = profileId ? inboxFiltersStorageKey(profileId) : null;
  const ownerKey = storageKey ?? NO_OWNER;
  const [searchParams, setSearchParams] = useSearchParams();

  // Preferência do dono lida do storage; muda quando a identidade aparece (o
  // perfil carrega assíncrono depois do primeiro render).
  const storedPrefs = useMemo(() => readStoredPrefs(storageKey), [storageKey]);
  // Rascunho por dono: o que este usuário mexeu na sessão precede o storage, e a
  // troca de conta no mesmo navegador não reaproveita o estado do anterior.
  const [draft, setDraft] = useState<Record<string, InboxFilterPrefs>>({});

  const basePrefs = useMemo<InboxFilterPrefs>(() => {
    const chipTab = storedPrefs?.chipTab ?? DEFAULT_CHIP;
    return {
      chipTab,
      ...tabsForChip(chipTab),
      queueId: storedPrefs?.queueId ?? null,
      // O tipo do deep-link manda; sem ele, vale o que o dono guardou.
      contactType: normalizeContactType(searchParams.get('type')) ?? storedPrefs?.contactType ?? null,
    };
  }, [storedPrefs, searchParams]);

  const prefs = draft[ownerKey] ?? basePrefs;
  const { chipTab, mainTab, subTab, queueId: selectedQueueId, contactType: selectedContactType } = prefs;

  /**
   * Aplica a mudança sobre o estado vivo do dono e persiste só o que sobrevive
   * ao reload (chip, fila, tipo) — mainTab/subTab são derivados do chip.
   */
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

  // Chips derivam mainTab/subTab (compat com filtros existentes). setMainTab/setSubTab
  // seguem expostos à parte — RealtimeInboxView usa setMainTab('search') no deep-link
  // de contato pendente, fora do ciclo de vida dos chips.
  const setChipTab = useCallback((tab: ChipTab) => {
    applyPrefs({ chipTab: tab, ...tabsForChip(tab) });
  }, [applyPrefs]);

  const setMainTab = useCallback((tab: MainTab) => applyPrefs({ mainTab: tab }), [applyPrefs]);
  const setSubTab = useCallback((tab: SubTab | null) => applyPrefs({ subTab: tab }), [applyPrefs]);
  const setSelectedQueueId = useCallback((id: string | null) => applyPrefs({ queueId: id }), [applyPrefs]);

  const handleContactTypeChange = useCallback((value: string | null) => {
    const normalized = value && value !== 'all' ? value : null;
    applyPrefs({ contactType: normalized });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (normalized) {
        next.set('type', normalized);
      } else {
        next.delete('type');
      }
      return next;
    }, { replace: true });
  }, [applyPrefs, setSearchParams]);

  // Convert URL filters to InboxFiltersState
  const filters = useMemo<InboxFiltersState>(() => ({
    status: urlFilters.status,
    agentId: urlFilters.agentId,
    dateRange: {
      from: urlFilters.dateFrom ? parseISO(urlFilters.dateFrom) : null,
      to: urlFilters.dateTo ? parseISO(urlFilters.dateTo) : null,
    },
  }), [urlFilters]);

  // Busca só em memória: telefone/nome digitado não pode ir para a URL.
  const [search, setSearch] = useState('');

  const setFilters = useCallback((newFilters: InboxFiltersState) => {
    setUrlFilters({
      status: newFilters.status,
      agentId: newFilters.agentId,
      dateFrom: localDayKey(newFilters.dateRange.from),
      dateTo: localDayKey(newFilters.dateRange.to),
    });
  }, [setUrlFilters]);

  // Contexto dos filtros extras (busca, tipo, painel) — o MESMO objeto alimenta
  // a lista e o countByChip, para os dois nunca usarem regras diferentes.
  const extraFilterContext = useMemo(
    () => ({ search, selectedContactType, filters }),
    [search, selectedContactType, filters],
  );

  const filteredConversations = useMemo(() => {
    let result = conversations.filter(hasContact);

    // Adiamento (R2-INB-029): conversa adiada sai da listagem até o prazo vencer.
    // `snoozedIds` só traz os adiamentos ainda vigentes — no vencimento o hook de
    // origem a remove do conjunto e ela volta a aparecer sem recarregar a lista.
    result = result.filter(c => !isSnoozed(c, snoozedIds));

    // Tab-based filtering — ADR-005 (passo 3): o estado da conversa vem do campo
    // persistido `contacts.conversation_status`, e não mais da derivação por
    // `messages.length` (que mostrava como "aberta" toda conversa com mensagem e
    // como "resolvida" apenas a que nunca teve nenhuma).
    // As regras de cada chip vivem em ./chipCounts (as mesmas que contam os chips).
    if (chipTab === 'archived') {
      // Chip "Arquivadas" (B2): a lista obedece o estado persistido
      // `conversation_status === 'archived'`, independente de mainTab/subTab
      // (o chip deriva mainTab 'open'/subTab null, ramo que não conhece esse
      // estado). Busca, fila e tipo de contato seguem aplicados por cima,
      // abaixo — por isso só o filtro de fila, que hoje vive no ramo 'open',
      // é replicado aqui.
      result = result.filter(isArchived);
      if (selectedQueueId) {
        result = result.filter(c => isInQueue(c, selectedQueueId));
      }
    } else if (mainTab === 'open') {
      // Ativas = open|waiting. O `messages.length > 0` abaixo não decide estado:
      // é o guarda de atividade que mantém fora da inbox o contato histórico que
      // nunca conversou (buildConversation sintetiza 1 mensagem quando há agregado).
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
    // 'all' não filtra por assigned_to (subTab já vem null) — mostra todas abertas
    // attending e waiting já são tratados pelo subTab derivado

    // Filtros por cima do chip — busca, painel Filtros (status/atendente/
    // datas) e tipo de contato. A regra vive em passesExtraFilters, em
    // ./chipCounts: é a MESMA que o countByChip aplica, então o número do chip e
    // o length da lista não têm mais como divergir.
    result = result.filter((c) => passesExtraFilters(c, extraFilterContext));

    // Smart sorting
    result.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      const aTime = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : new Date(a.contact.updated_at).getTime();
      const bTime = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : new Date(b.contact.updated_at).getTime();
      return bTime - aTime;
    });

    return result;
  }, [conversations, extraFilterContext, mainTab, subTab, chipTab, showAll, selectedQueueId, profileId, snoozedIds]);

  // Contadores dos chips com o contexto atual — a tela só lê o número. Memoizado
  // pelos mesmos insumos da lista; cada tecla da busca recalcula UMA varredura
  // (o loop testa os seis chips por conversa), sem uma passada por chip.
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
