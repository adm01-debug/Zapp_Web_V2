import { useMemo, useCallback, useState, useEffect } from 'react';
import { useUrlFilters } from '@/hooks/system/useUrlFilters';
import { InboxFiltersState } from '@/components/inbox/InboxFilters';
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
  type ChipCounts,
} from './chipCounts';

/**
 * Persistência dos filtros da Inbox entre recargas de página (`inbox_filters_v2`).
 *
 * O usuário escolhe a aba (chip), a fila e o tipo de contato; a cada recarga o
 * hook voltava tudo ao padrão e a Inbox abria em "Em atendimento", sem a fila
 * nem o tipo escolhidos. Aqui a URL tem prioridade (permite compartilhar o
 * link); o localStorage é o fallback quando a URL não traz o parâmetro.
 *
 * A busca NÃO é persistida: o termo pode conter telefone/nome do contato.
 */
const INBOX_FILTERS_STORAGE_KEY = 'inbox_filters_v2';

const CHIP_TABS: readonly ChipTab[] = [
  'all',
  'unread',
  'attending',
  'waiting',
  'resolved',
  'archived',
];
/** Fila é um id de `queues` (UUID); qualquer outro valor é descartado. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Mesmo formato de `ContactTypeFilter.FILTER_OPTIONS.value`; 'all' não é um tipo. */
const CONTACT_TYPE_RE = /^[a-z0-9_]{1,40}$/;

export interface PersistedInboxFilters {
  chipTab: ChipTab | null;
  queueId: string | null;
  contactType: string | null;
}

const EMPTY_PERSISTED: PersistedInboxFilters = { chipTab: null, queueId: null, contactType: null };

/** Aba (chip) → mainTab/subTab derivados (compat com os filtros da lista). */
const mainTabForChip = (tab: ChipTab): MainTab => (tab === 'resolved' ? 'resolved' : 'open');
export const subTabForChip = (tab: ChipTab): SubTab | null =>
  tab === 'attending' ? 'attending' : tab === 'waiting' ? 'waiting' : null;

/**
 * Fallback de primeira carga: a aba restaurada pode estar vazia (o dado mudou
 * desde a última visita). Nunca abre numa lista vazia quando há Abertos:
 * - "Em atendimento" vazia com "Aguardando" > 0 vai para "Aguardando";
 * - "Resolvidas"/"Não lidas" vazia com Abertos vai para "Em atendimento"
 *   (ou "Aguardando", se não houver ninguém em atendimento).
 * Sem alvo melhor, retorna null e a aba escolhida é mantida.
 */
export function fallbackChipFor(chipTab: ChipTab, counts: ChipCounts): ChipTab | null {
  if (chipTab === 'attending' && counts.attending === 0 && counts.waiting > 0) return 'waiting';
  if ((chipTab === 'resolved' || chipTab === 'unread') && counts[chipTab] === 0 && counts.all > 0) {
    return counts.attending > 0 ? 'attending' : 'waiting';
  }
  return null;
}

function pickChipTab(value: unknown): ChipTab | null {
  return typeof value === 'string' && (CHIP_TABS as readonly string[]).includes(value)
    ? (value as ChipTab)
    : null;
}

function sanitizeQueueId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

function sanitizeContactType(value: unknown): string | null {
  return typeof value === 'string' && value !== 'all' && CONTACT_TYPE_RE.test(value) ? value : null;
}

/** Lê o que ficou guardado da última visita; payload inválido cai no vazio. */
export function readStoredInboxFilters(): PersistedInboxFilters {
  try {
    const raw = window.localStorage.getItem(INBOX_FILTERS_STORAGE_KEY);
    if (!raw) return { ...EMPTY_PERSISTED };
    const parsed = JSON.parse(raw) as Partial<PersistedInboxFilters> | null;
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_PERSISTED };
    return {
      chipTab: pickChipTab(parsed.chipTab),
      queueId: sanitizeQueueId(parsed.queueId),
      contactType: sanitizeContactType(parsed.contactType),
    };
  } catch {
    // localStorage indisponível (modo privado/cota): a Inbox segue em memória.
    return { ...EMPTY_PERSISTED };
  }
}

/** Grava a escolha atual; falha de storage não pode derrubar a tela. */
export function writeStoredInboxFilters(value: PersistedInboxFilters): void {
  try {
    window.localStorage.setItem(INBOX_FILTERS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // sem storage: o filtro continua válido só nesta sessão.
  }
}

/**
 * Remove da query string os parâmetros de filtro com valor inválido (links
 * antigos/manipulados). Devolve a query limpa e os nomes removidos.
 */
export function sanitizeInboxUrlParams(search: string): { search: string; removed: string[] } {
  const params = new URLSearchParams(search);
  const removed: string[] = [];
  const checks: Array<[string, (v: string) => boolean]> = [
    ['chip', (v) => (CHIP_TABS as readonly string[]).includes(v)],
    ['queue', (v) => UUID_RE.test(v)],
    ['type', (v) => v === 'all' || CONTACT_TYPE_RE.test(v)],
  ];
  for (const [key, isValid] of checks) {
    const value = params.get(key);
    if (value !== null && !isValid(value)) {
      params.delete(key);
      removed.push(key);
    }
  }
  return { search: params.toString(), removed };
}

/**
 * Estado inicial: URL (prioridade) sobre o localStorage (fallback). Valor
 * inválido na URL é ignorado e cai no valor guardado — ou no padrão do hook.
 */
export function resolveInitialInboxFilters(search: string): PersistedInboxFilters {
  const params = new URLSearchParams(search);
  const stored = readStoredInboxFilters();
  const rawChip = params.get('chip');
  const rawQueue = params.get('queue');
  const rawType = params.get('type');
  return {
    chipTab: pickChipTab(rawChip) ?? stored.chipTab,
    queueId: sanitizeQueueId(rawQueue) ?? stored.queueId,
    contactType: rawType === 'all' ? null : (sanitizeContactType(rawType) ?? stored.contactType),
  };
}

interface UseInboxFiltersProps {
  conversations: ConversationWithMessages[];
  profileId: string | undefined;
  // Contatos adiados (R2-INB-029): a lista ativa não mostra conversa adiada e a
  // retomada acontece quando o conjunto encolhe no vencimento do prazo.
  snoozedIds?: Set<string>;
}

export function useInboxFilters({ conversations, profileId, snoozedIds }: UseInboxFiltersProps) {
  // Estado inicial: URL (prioridade) sobre o localStorage (fallback). A URL é
  // limpa dos parâmetros inválidos num efeito de montagem (efeito = efeito, nada
  // de mexer na URL durante o render).
  const [initialFilters] = useState(() =>
    resolveInitialInboxFilters(sanitizeInboxUrlParams(window.location.search).search)
  );
  const initialChipTab = initialFilters.chipTab ?? 'attending';

  const [chipTab, setChipTabState] = useState<ChipTab>(initialChipTab);
  const [mainTab, setMainTab] = useState<MainTab>(mainTabForChip(initialChipTab));
  const [subTab, setSubTab] = useState<SubTab | null>(subTabForChip(initialChipTab));

  // Chips derivam mainTab/subTab (compat com filtros existentes). setMainTab/setSubTab
  // seguem expostos à parte — RealtimeInboxView usa setMainTab('search') no deep-link
  // de contato pendente, fora do ciclo de vida dos chips.
  const setChipTab = useCallback((tab: ChipTab) => {
    setChipTabState(tab);
    setMainTab(mainTabForChip(tab));
    setSubTab(subTabForChip(tab));
  }, []);
  const [showAll, setShowAll] = useState(false);
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(initialFilters.queueId);
  const [selectedContactType, setSelectedContactType] = useState<string | null>(
    initialFilters.contactType
  );

  const {
    filters: urlFilters,
    setFilters: setUrlFilters,
    clearFilters: clearUrlFilters,
  } = useUrlFilters();

  // Aba, fila e tipo são persistidos a cada escolha — recarregar mantém o que o
  // usuário estava vendo. A busca fica de fora (pode conter dado do contato).
  useEffect(() => {
    writeStoredInboxFilters({
      chipTab,
      queueId: selectedQueueId,
      contactType: selectedContactType,
    });
  }, [chipTab, selectedQueueId, selectedContactType]);

  // Limpa da URL os parâmetros de filtro inválidos (link antigo/manipulado):
  // `chip`, `queue` e `type` fora do formato são ignorados na leitura e saem da
  // barra de endereços.
  useEffect(() => {
    const { search, removed } = sanitizeInboxUrlParams(window.location.search);
    if (removed.length === 0) return;
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
    );
  }, []);

  const handleContactTypeChange = useCallback((value: string | null) => {
    setSelectedContactType(value);
    const params = new URLSearchParams(window.location.search);
    if (value && value !== 'all') {
      params.set('type', value);
    } else {
      params.delete('type');
    }
    window.history.replaceState(
      null,
      '',
      params.toString() ? `?${params}` : window.location.pathname + window.location.hash
    );
  }, []);

  // Convert URL filters to InboxFiltersState
  const filters = useMemo<InboxFiltersState>(
    () => ({
      status: urlFilters.status,
      tags: urlFilters.tags,
      agentId: urlFilters.agentId,
      dateRange: {
        from: urlFilters.dateFrom ? parseISO(urlFilters.dateFrom) : null,
        to: urlFilters.dateTo ? parseISO(urlFilters.dateTo) : null,
      },
    }),
    [urlFilters]
  );

  // Busca só em memória: telefone/nome digitado não pode ir para a URL.
  const [search, setSearch] = useState('');

  const setFilters = useCallback(
    (newFilters: InboxFiltersState) => {
      setUrlFilters({
        status: newFilters.status,
        tags: newFilters.tags,
        agentId: newFilters.agentId,
        dateFrom: localDayKey(newFilters.dateRange.from),
        dateTo: localDayKey(newFilters.dateRange.to),
      });
    },
    [setUrlFilters]
  );

  // Contexto dos filtros extras (busca, tipo, painel) — o MESMO objeto alimenta
  // a lista e o countByChip, para os dois nunca usarem regras diferentes.
  const extraFilterContext = useMemo(
    () => ({ search, selectedContactType, filters }),
    [search, selectedContactType, filters]
  );

  const filteredConversations = useMemo(() => {
    let result = conversations.filter(hasContact);

    // Adiamento (R2-INB-029): conversa adiada sai da listagem até o prazo vencer.
    // `snoozedIds` só traz os adiamentos ainda vigentes — no vencimento o hook de
    // origem a remove do conjunto e ela volta a aparecer sem recarregar a lista.
    result = result.filter((c) => !isSnoozed(c, snoozedIds));

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
        result = result.filter((c) => isInQueue(c, selectedQueueId));
      }
    } else if (mainTab === 'open') {
      // Ativas = open|waiting. O `messages.length > 0` abaixo não decide estado:
      // é o guarda de atividade que mantém fora da inbox o contato histórico que
      // nunca conversou (buildConversation sintetiza 1 mensagem quando há agregado).
      result = result.filter(isOpenActive);
      if (subTab === 'attending') {
        if (!showAll) {
          result = result.filter((c) => isAttending(c, profileId));
        }
      } else if (subTab === 'waiting') {
        result = result.filter(isWaiting);
      }
      if (selectedQueueId) {
        result = result.filter((c) => isInQueue(c, selectedQueueId));
      }
    } else if (mainTab === 'resolved') {
      result = result.filter(isResolved);
    }

    if (chipTab === 'unread') {
      result = result.filter(isUnread);
    }
    // 'all' não filtra por assigned_to (subTab já vem null) — mostra todas abertas
    // attending e waiting já são tratados pelo subTab derivado

    // Filtros por cima do chip — busca, painel Filtros (status/tags/atendente/
    // datas) e tipo de contato. A regra vive em passesExtraFilters, em
    // ./chipCounts: é a MESMA que o countByChip aplica, então o número do chip e
    // o length da lista não têm mais como divergir.
    result = result.filter((c) => passesExtraFilters(c, extraFilterContext));

    // Smart sorting
    result.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      const aTime = a.lastMessage
        ? new Date(a.lastMessage.created_at).getTime()
        : new Date(a.contact.updated_at).getTime();
      const bTime = b.lastMessage
        ? new Date(b.lastMessage.created_at).getTime()
        : new Date(b.contact.updated_at).getTime();
      return bTime - aTime;
    });

    return result;
  }, [
    conversations,
    extraFilterContext,
    mainTab,
    subTab,
    chipTab,
    showAll,
    selectedQueueId,
    profileId,
    snoozedIds,
  ]);

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
    [conversations, profileId, snoozedIds, showAll, selectedQueueId, extraFilterContext]
  );

  // Fallback de primeira carga: a aba restaurada pode estar vazia (o dado mudou
  // desde a última visita). Roda UMA vez, quando as conversas chegam — a escolha
  // manual posterior do usuário não é atropelada.
  const [fallbackChecked, setFallbackChecked] = useState(false);
  if (!fallbackChecked && conversations.length > 0) {
    setFallbackChecked(true);
    const fallbackChip = fallbackChipFor(chipTab, chipCounts);
    if (fallbackChip) setChipTab(fallbackChip);
  }

  return {
    chipTab,
    setChipTab,
    mainTab,
    setMainTab,
    subTab,
    setSubTab,
    showAll,
    setShowAll,
    selectedQueueId,
    setSelectedQueueId,
    selectedContactType,
    handleContactTypeChange,
    filters,
    setFilters,
    search,
    setSearch,
    filteredConversations,
    chipCounts,
    clearUrlFilters,
  };
}
