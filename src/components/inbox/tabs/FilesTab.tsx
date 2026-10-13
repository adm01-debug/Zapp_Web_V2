import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
import { useContactMedia, type ContactMediaItem } from '@/hooks/chat/useContactMedia';
import { useContactMediaCounts, type ContactMediaCounts } from '@/hooks/chat/useContactMediaCounts';
import { useMediaSenderProfiles } from '@/hooks/chat/useMediaSenderProfiles';
import { useDownloadPermission } from '@/hooks/system/useDownloadPermission';
import { useFilesInfiniteScroll } from '@/hooks/chat/useFilesInfiniteScroll';
import {
  columnsCapacity,
  effectiveColumns,
  useFilesContainerColumns,
  type ColumnOption,
} from '@/hooks/chat/useFilesContainerColumns';
import { FILES_COLUMNS, useFilesViewState, type FilesTypeFilter } from '@/hooks/chat/useFilesViewState';
import { useFilesSelection } from '@/hooks/chat/useFilesSelection';
import { useFilesActions } from '@/hooks/chat/useFilesActions';
import {
  createForwardRunState,
  forwardMediaMessages,
  type ForwardMediaItem,
  type ForwardRunState,
} from '@/hooks/chat/useForwardMedia';
import type { ForwardCallback } from '@/hooks/chat/useForwardMessage';
import { forwardLimitError } from '@/lib/forward-limits';
import { FilesToolbar, type SenderFilterOption } from './FilesToolbar';
import { FilesContent } from './FilesContent';
import { FilesSelectionBar } from './FilesSelectionBar';
import { FileDetailContent, FileDetailPanel, type FileDetailContentProps } from './FileDetailPanel';
import { filterMediaItems, sortMediaItems } from './filesSort';
import { buildPeriodRange, filterByPeriod, type PeriodRange } from '@/lib/filesPeriod';
import {
  CONTACT_SENDER_FALLBACK,
  SELF_SENDER_NAME,
  TEAM_SENDER_NAME,
  resolveSenderIdentity,
  senderProfileName,
  type SenderIdentity,
  type SenderProfileMap,
} from '@/lib/fileSenderIdentity';
import { EmptyState } from '@/components/ui/empty-state';
import { CalendarX2, Users } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

const MediaPreviewDialog = lazy(() =>
  import('../media-gallery/MediaPreviewDialog').then((m) => ({ default: m.MediaPreviewDialog })));
const ForwardMessageDialog = lazy(() =>
  import('../ForwardMessageDialog').then((m) => ({ default: m.ForwardMessageDialog })));

/**
 * Etapa 31: o painel de detalhes fica LADO A LADO (260 px) so quando o contêiner de arquivos
 * tem >= 1100 px (sidebar colapsada). Abaixo disso, `Sheet` sobreposto a direita com o mesmo
 * conteudo. A medida e a do contêiner da area de arquivos — nunca `window.innerWidth` — e a
 * largura que sobra para o grid desconta os 260 px + o `gap-4` (16 px) do painel.
 */
const SIDE_BY_SIDE_MIN_WIDTH = 1100;
const DETAIL_PANEL_WIDTH = 260;
const DETAIL_PANEL_GAP = 16;

/**
 * Teto de seguranca do "Carregar tudo" — e da varredura automatica do periodo (F05): 500 paginas
 * de 60 = 30 mil itens numa conversa. Exportado para o teste poder provar que a varredura termina
 * quando o teto e atingido sem nenhum item que case (refazer 1).
 */
export const MAX_PAGES_TO_LOAD_ALL = 500;

/**
 * A varredura do periodo pode parar quando o item MAIS ANTIGO carregado ja cruzou o limite que
 * interessa: a lista e `created_at desc`, entao tudo abaixo dele esta do outro lado.
 * - com "De" (`from`), tudo que vem abaixo de `from` esta fora do recorte;
 * - sem "De" — periodo personalizado so com "Ate" (`from === null` e `to` definido) — o recorte e
 *   `[.., to]`: parar ANTES de cruzar `to` esconderia os arquivos antigos que casam (refazer 1).
 */
function periodScanReachedBoundary(range: PeriodRange | null, oldestLoadedTime: number | null): boolean {
  if (!range || oldestLoadedTime === null || !Number.isFinite(oldestLoadedTime)) return false;
  if (range.from !== null) return oldestLoadedTime < range.from;
  return range.to !== null && oldestLoadedTime <= range.to;
}

const CHIPS: { id: FilesTypeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'image', label: 'Imagens' },
  { id: 'sticker', label: 'Figurinhas' },
  { id: 'video', label: 'Vídeos' },
  { id: 'audio', label: 'Áudios' },
  { id: 'document', label: 'Docs' },
];

/**
 * R08/S56: chave do remetente no funil — `self`, `contact`, `team` ou `agent:<id>`.
 * Sai do `kind` da MESMA resolucao do cartao (D01): nada de reimplementar aqui quem e "Voce" ou
 * "Equipe". O id do atendente e o que separa dois atendentes diferentes, por isso ele entra na
 * chave.
 */
function senderFilterKey(item: ContactMediaItem, identity: SenderIdentity): string {
  return identity.kind === 'agent' ? `agent:${item.agentId}` : identity.kind;
}

/**
 * Rotulo de uma chave que NAO esta no recorte contado (remetente marcado e depois escondido pelo
 * periodo). Usa os mesmos nomes do cartao (D01) para o painel nunca mostrar duas palavras para a
 * mesma pessoa.
 */
function senderFilterLabel(key: string, contactName: string, profiles: SenderProfileMap): string {
  if (key === 'self') return SELF_SENDER_NAME;
  if (key === 'contact') return contactName.trim() || CONTACT_SENDER_FALLBACK;
  if (key === 'team') return TEAM_SENDER_NAME;
  const agentId = key.startsWith('agent:') ? key.slice('agent:'.length) : '';
  return senderProfileName(agentId ? profiles[agentId] : undefined);
}

interface FilesTabProps {
  contactId: string;
  contactName: string;
  /**
   * "Ver na conversa": entrega o `messageId` do arquivo (cada arquivo É uma linha de
   * `messages`, então `item.id` é o id da mensagem) ao `ConversationTabContent`, que troca
   * para a aba Chat e rola até a mensagem. Sem esta prop a ação não é oferecida.
   */
  onOpenInChat?: (messageId: string) => void;
}

export function FilesTab({ contactId, contactName, onOpenInChat }: FilesTabProps) {
  const { user, profile } = useAuth();
  const view = useFilesViewState(user?.id, contactId);
  const containerRef = useRef<HTMLDivElement>(null);
  const { effective: containerEffective, width: containerWidth, available: containerOptions } =
    useFilesContainerColumns(containerRef, view.columns);

  // Etapa 41: paginacao real por keyset. A aba recebe a lista ja concatenada das paginas.
  const {
    items,
    hasMore,
    isLoading,
    isFetchingNextPage,
    isError,
    fetchNextPage,
    refetch,
  } = useContactMedia(contactId);
  // Etapa 42: chips contam no banco (contagem exata por tipo), nao nos itens carregados.
  // #144/OTH-002: erro na contagem nao pode virar "0" confirmado — vira "indisponivel" (—).
  const { counts, isError: countsError } = useContactMediaCounts(contactId);

  // R04 / D04: quem enviou cada arquivo. Os perfis dos atendentes sao resolvidos em UMA
  // consulta em lote para a tela toda (o cartao nunca consulta por conta propria) e a
  // identidade de cada item sai de `resolveSenderIdentity` no cartao. D06: a permissao de
  // download tambem e resolvida uma vez aqui e decide "baixar" x "cadeado" no cartao.
  const { profiles: senderProfiles } = useMediaSenderProfiles(items.map((item) => item.agentId));
  const { canDownload } = useDownloadPermission();

  // R08/S56: quem enviou cada arquivo, pela MESMA funcao que o cartao usa (D01) — aqui ela serve
  // ao funil (rotulo, chave e contagem), la ao "Enviado por". `contact` recebe o nome da conversa
  // porque a identidade do contato e derivada dele (nao ha consulta nova).
  const currentUserId = profile?.id ?? null;
  const resolveIdentity = useCallback(
    (item: ContactMediaItem) =>
      resolveSenderIdentity({
        item,
        currentUserId,
        contact: { name: contactName },
        profiles: senderProfiles,
      }),
    [currentUserId, contactName, senderProfiles],
  );

  // F05 (F01): o período escolhido vira o intervalo [de, até] no fuso do navegador. `null` =
  // "Qualquer data" — nada muda em relação ao comportamento anterior ao filtro.
  const periodRange = useMemo(
    () => buildPeriodRange(view.period, view.customFrom, view.customTo),
    [view.period, view.customFrom, view.customTo],
  );

  const [selected, setSelected] = useState<ContactMediaItem | null>(null);
  const [previewItem, setPreviewItem] = useState<ContactMediaItem | null>(null);
  // Etapa 38: o diálogo de encaminhar recebe um ou N itens da seleção.
  const [forwardItems, setForwardItems] = useState<ContactMediaItem[]>([]);
  const forwardStateRef = useRef<ForwardRunState | null>(null);
  // Etapa 35: item cuja exclusao aguarda confirmacao no AlertDialog (no lugar do window.confirm).
  const [deleteTarget, setDeleteTarget] = useState<ContactMediaItem | null>(null);

  // Etapa 41: sentinela do fim da lista carrega a proxima pagina ao entrar na area visivel.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMore = useCallback(() => { void fetchNextPage(); }, [fetchNextPage]);
  useFilesInfiniteScroll(sentinelRef, { hasMore, isFetching: isFetchingNextPage, onLoadMore: loadMore });

  // Etapa 43: "Carregar tudo" pagina ate o fim (com teto de seguranca contra loop).
  const loadAll = useCallback(async () => {
    let guard = 0;
    let result = await fetchNextPage();
    while (result?.hasNextPage && guard < MAX_PAGES_TO_LOAD_ALL) {
      result = await fetchNextPage();
      guard += 1;
    }
  }, [fetchNextPage]);

  // F05: com periodo ativo a lista (keyset `created_at desc`) pode terminar antes do inicio do
  // periodo — ou, no periodo personalizado so com "Ate", comecar DEPOIS do fim dele — e esconder
  // arquivos que estao nele. Enquanto o item mais antigo carregado nao cruzar o limite que
  // interessa, busca as paginas antigas — com o MESMO teto do "Carregar tudo" — ate cruzar,
  // acabarem as paginas ou bater o teto.
  const periodLoadRef = useRef<{ key: string; pages: number; lastId: string | null }>({
    key: '',
    pages: 0,
    lastId: null,
  });
  // Refazer 1: espelho do ref acima para o RENDER. O contador da varredura vive no ref (leitura
  // sincrona dentro do efeito) e o efeito nao pode chamar `setState` direto, entao o espelho e
  // atualizado quando cada pagina CHEGA (`then`), que e quando o teto passa a valer de verdade.
  const [scannedPages, setScannedPages] = useState<{ key: string; pages: number }>({ key: '', pages: 0 });
  const periodLoadKey = `${contactId}|${periodRange?.from ?? ''}|${periodRange?.to ?? ''}`;
  const oldestLoadedTime = items.length === 0 ? null : new Date(items[items.length - 1].created_at).getTime();
  const periodScannedPages = scannedPages.key === periodLoadKey ? scannedPages.pages : 0;

  const registrarPaginaVarrida = useCallback((key: string) => {
    setScannedPages((current) => ({ key, pages: (current.key === key ? current.pages : 0) + 1 }));
  }, []);

  useEffect(() => {
    if (!periodRange) return;
    if (!hasMore || isFetchingNextPage) return;
    const oldest = items[items.length - 1];
    if (!oldest) return;
    const oldestTime = new Date(oldest.created_at).getTime();
    if (!Number.isFinite(oldestTime)) return;
    // Nao cruzou o limite ainda: pode haver arquivo do periodo em pagina mais antiga. Com so
    // "Ate" isso e a REGRA (as primeiras paginas podem ser todas posteriores ao `to`), nao excecao.
    if (periodScanReachedBoundary(periodRange, oldestTime)) return;

    if (periodLoadRef.current.key !== periodLoadKey) {
      periodLoadRef.current = { key: periodLoadKey, pages: 0, lastId: null };
    }
    const load = periodLoadRef.current;
    if (load.lastId === oldest.id) return; // a pagina anterior nao avancou: para de pedir
    if (load.pages >= MAX_PAGES_TO_LOAD_ALL) return;
    load.lastId = oldest.id;
    load.pages += 1;
    const pageKey = periodLoadKey;
    void fetchNextPage().then(
      () => registrarPaginaVarrida(pageKey),
      () => registrarPaginaVarrida(pageKey),
    );
  }, [periodRange, periodLoadKey, hasMore, isFetchingNextPage, items, fetchNextPage, registrarPaginaVarrida]);

  // A varredura terminou quando: nao ha mais paginas; o item mais antigo carregado ja cruzou o
  // limite do periodo; ou o teto de paginas foi atingido. So entao da para afirmar "nenhum arquivo
  // neste periodo" — sem o teto aqui a tela ficaria em skeleton para sempre (refazer 1).
  const periodFullyLoaded = periodRange === null
    || !hasMore
    || periodScanReachedBoundary(periodRange, oldestLoadedTime)
    || periodScannedPages >= MAX_PAGES_TO_LOAD_ALL;
  const periodScanning = periodRange !== null && !periodFullyLoaded;

  // F05: com período ativo o cabeçalho "N arquivos" e os chips saem do recorte CARREGADO (a RPC
  // conta a conversa inteira, até o que está fora do período). Só o período entra nessas contas:
  // tipo e busca continuam fora dos contadores, como sempre estiveram.
  const periodItems = useMemo(
    () => (periodRange ? filterByPeriod(items, periodRange) : null),
    [items, periodRange],
  );
  const periodCounts = useMemo<ContactMediaCounts | null>(() => {
    if (!periodItems) return null;
    return {
      all: periodItems.length,
      image: periodItems.filter((item) => item.type === 'image').length,
      video: periodItems.filter((item) => item.type === 'video').length,
      audio: periodItems.filter((item) => item.type === 'audio').length,
      document: periodItems.filter((item) => item.type === 'document').length,
      sticker: periodItems.filter((item) => item.type === 'sticker').length,
    };
  }, [periodItems]);
  const displayCounts = periodCounts ?? counts;
  // Com período ativo a contagem é derivada dos itens carregados: erro de RPC não a atinge.
  const displayCountsError = periodCounts ? false : countsError;

  // R08/S56: opcoes do funil de remetente. A contagem usa o MESMO recorte dos chips — com
  // periodo ativo, o recorte do periodo; tipo e busca continuam fora (a RPC conta por TIPO, nao
  // por remetente, entao dos itens carregados e a unica contagem honesta). Uma chave MARCADA
  // nunca some do painel: se o periodo em vigor nao tem mais nenhum arquivo dela, ela continua
  // listada com 0, que e o que permite ao operador desmarcar.
  const senderCountBase = periodItems ?? items;
  const senderOptions = useMemo<SenderFilterOption[]>(() => {
    const porChave = new Map<string, SenderFilterOption>();
    for (const item of senderCountBase) {
      const identity = resolveIdentity(item);
      const key = senderFilterKey(item, identity);
      const atual = porChave.get(key);
      if (atual) atual.count += 1;
      else porChave.set(key, { key, label: identity.name, count: 1 });
    }
    for (const key of view.senders) {
      if (porChave.has(key)) continue;
      porChave.set(key, { key, label: senderFilterLabel(key, contactName, senderProfiles), count: 0 });
    }
    // Ordem do cartao: Voce, contato, atendentes (por nome) e Equipe no fim.
    const peso = (key: string) => (key === 'self' ? 0 : key === 'contact' ? 1 : key === 'team' ? 3 : 2);
    return [...porChave.values()].sort(
      (a, b) => peso(a.key) - peso(b.key) || a.label.localeCompare(b.label, 'pt-BR'),
    );
  }, [senderCountBase, view.senders, resolveIdentity, contactName, senderProfiles]);

  // Etapa 43: filtro/ordenacao num modulo proprio (testavel) — "Maiores" põe tamanho
  // desconhecido no fim e desempata por data e id.
  // R08/S56: o recorte por REMETENTE entra junto de tipo/busca/periodo — os quatro valem ao
  // mesmo tempo sobre os mesmos itens.
  const senderFiltered = useMemo(
    () => (view.senders.length === 0
      ? items
      : items.filter((item) => view.senders.includes(senderFilterKey(item, resolveIdentity(item))))),
    [items, view.senders, resolveIdentity],
  );
  const filtered = useMemo(
    () => sortMediaItems(filterMediaItems(senderFiltered, view.typeFilter, view.search, periodRange), view.sort),
    [senderFiltered, view.typeFilter, view.search, periodRange, view.sort],
  );

  // Enquanto a varredura do período não acabou e nada casou ainda, o recorte pode estar só nas
  // primeiras páginas: mostra o carregamento do modo em vez de um vazio que ainda pode mudar.
  const showSkeleton = isLoading || (periodScanning && filtered.length === 0);
  const periodEmpty = !isLoading && !showSkeleton && !isError
    && periodItems !== null && periodItems.length === 0;

  // R08/S56: o remetente e o UNICO filtro que o `FilesContent` nao conhece — sem isto, um funil
  // que nao casa nada cairia no "Nenhum arquivo nesta conversa" (mentira: os arquivos existem, o
  // recorte e que esta estreito). So entra quando busca e tipo estao no "todos", porque esses
  // dois tem mensagem propria no `FilesContent` e limpam so o seu proprio recorte.
  const senderEmpty = !periodEmpty && !showSkeleton && !isError
    && view.senders.length > 0
    && view.search.trim() === ''
    && view.typeFilter === 'all'
    && filtered.length === 0;

  const visibleIds = useMemo(() => filtered.map((item) => item.id), [filtered]);
  const selection = useFilesSelection(visibleIds, contactId);

  // Etapa 31: com 959 px abrir detalhes nao muda o `effective` do grid (o Sheet nao tira
  // espaco); com 1474 px o lado a lado entra e o grid cai. A decisao usa a largura do
  // CONTÊINER (estavel), e o grid so desconta o painel quando ele esta lado a lado.
  const sideBySide = selected !== null && containerWidth !== null && containerWidth >= SIDE_BY_SIDE_MIN_WIDTH;
  const gridWidth = containerWidth === null
    ? null
    : sideBySide
      ? containerWidth - DETAIL_PANEL_WIDTH - DETAIL_PANEL_GAP
      : containerWidth;

  // A capacidade/effective saem do `gridWidth` (nao do contêiner) para o grid refletir o
  // espaco real. Sem medida ainda, o hook do contêiner devolve a preferencia do operador.
  const capacity = gridWidth === null ? null : columnsCapacity(gridWidth);
  const effective = containerWidth === null
    ? containerEffective
    : capacity === null
      ? view.columns
      : effectiveColumns(capacity, view.columns);
  const columnOptions: ColumnOption[] = containerWidth === null
    ? containerOptions
    : FILES_COLUMNS.map((n) => ({ n, fits: (capacity ?? 0) >= n }));

  // Etapa 33: "Selecionar todos" opera sobre o recorte atual (`filtered`), nao sobre a colecao.
  const selectedVisibleCount = useMemo(
    () => filtered.reduce((total, item) => total + (selection.selectedIds.has(item.id) ? 1 : 0), 0),
    [filtered, selection.selectedIds],
  );
  const allVisibleSelected = filtered.length > 0 && selectedVisibleCount === filtered.length;
  const someVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < filtered.length;

  // Etapa 35: no sucesso, sai da selecao; o `useFilesActions` decide (nunca no erro).
  const removeSelection = selection.remove;
  const handleRemoved = useCallback((id: string) => {
    removeSelection(id);
    setSelected((current) => (current?.id === id ? null : current));
  }, [removeSelection]);

  const filesActions = useFilesActions({ contactId, onRemoved: handleRemoved });

  // Etapa 15: Esc dentro da aba sai do modo seleção (sem efeito destrutivo).
  useEffect(() => {
    if (!selection.selectionMode) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') selection.exit(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection]);

  // Etapa 38 / OTH-001 (#51): os itens encaminhados vêm do estado canônico da seleção
  // (`selection.selectedIds`) resolvido sobre a COLEÇÃO COMPLETA (`items`), nunca sobre o
  // recorte filtrado (`filtered`). Trocar o filtro/busca depois de selecionar não pode
  // omitir do encaminhamento os arquivos que continuam selecionados. A ordenação segue a
  // preferência atual (`view.sort`) para o payload bater com o que o operador vê.
  const selectedItems = useMemo(
    () => sortMediaItems(items.filter((item) => selection.selectedIds.has(item.id)), view.sort),
    [items, selection.selectedIds, view.sort],
  );

  const forwardMediaItems = useMemo<ForwardMediaItem[]>(
    () => forwardItems.map((item) => ({
      // Figurinha sai pelo transporte de imagem (como antes de existir o tipo próprio): o
      // encaminhamento de mídia só conhece imagem/vídeo/áudio/documento.
      id: item.id, url: item.url, type: item.type === 'sticker' ? 'image' : item.type,
      filename: item.filename, caption: item.caption,
    })),
    [forwardItems],
  );

  // Etapa 36/38: abre o diálogo com seleção nova e um estado de execução limpo. O retry
  // dentro do diálogo reusa o MESMO estado, que guarda os pares (item, destino) concluídos.
  const openForward = useCallback((targets: ContactMediaItem[]) => {
    if (targets.length === 0) return;
    forwardStateRef.current = createForwardRunState();
    setForwardItems(targets);
  }, []);

  const handleForwardToTargets = useCallback<ForwardCallback>(async (targetIds, targetType, onProgress) => {
    const state = forwardStateRef.current ?? createForwardRunState();
    forwardStateRef.current = state;
    return forwardMediaMessages(
      forwardMediaItems,
      targetIds.map((id) => ({ id, type: targetType })),
      { state, onProgress },
    );
  }, [forwardMediaItems]);

  // R07/S52: o painel encaminha pelo MESMO caminho do cartão (`openForward`). A função é
  // estável (mesma identidade em todo render) e só é chamada no clique — nada de trabalho
  // no render. Ela entra no ponto de render, fora do objeto de props: o handler fecha sobre
  // o ref de execução (`forwardStateRef`) e o lint de refs-durante-render recusa o espalhamento
  // desse objeto (`react-hooks/refs`, baseline zero).
  const handleDetailForward = useCallback(
    (item: ContactMediaItem) => openForward([item]),
    [openForward],
  );

  // R07 (S49–S53): o painel de detalhes mostra a MESMA identidade de quem enviou que o
  // cartão (D01/D04 — os perfis vêm do lote resolvido aqui, o painel nunca consulta) e o
  // download pela política já resolvida (D06).
  const detailProps: Omit<FileDetailContentProps, 'onForward'> | null = selected
    ? {
        item: selected,
        contactName,
        senderProfiles,
        currentUserId: profile?.id ?? null,
        downloadAllowed: canDownload,
        onOpenInChat: onOpenInChat ? () => onOpenInChat(selected.id) : undefined,
        onClose: () => setSelected(null),
        onRequestDelete: setDeleteTarget,
      }
    : null;

  return (
    <div className="flex flex-col gap-3" data-testid="files-tab">
      {/* Etapa 14: título e chips na mesma linha, contagem honesta. R08/S55: título do mockup
          ("Arquivos compartilhados") com o subtítulo logo abaixo, no mesmo bloco. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0">
          {/* Medidas do mockup (docs/design/PLANO_INBOX_360_CONVERSA.md §2.6, aba Arquivos):
              titulo 18/700 e subtitulo 13 muted. */}
          <h2 className="text-lg font-bold text-foreground">Arquivos compartilhados</h2>
          <p className="text-[13px] text-muted-foreground" data-testid="files-subtitle">
            Todos os arquivos, mídias e documentos desta conversa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => view.setTypeFilter(chip.id)}
              aria-pressed={view.typeFilter === chip.id}
              className={cn(
                'h-8 px-3 rounded-lg text-[13px] font-medium border inline-flex items-center gap-1.5',
                view.typeFilter === chip.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground'
              )}
            >
              {chip.label}
              <span className={cn('tabular-nums h-4 min-w-4 px-1 rounded text-3xs font-bold flex items-center justify-center', view.typeFilter === chip.id ? 'bg-white/15' : 'bg-muted')}>
                {displayCountsError ? '—' : displayCounts[chip.id]}
              </span>
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-muted-foreground tabular-nums" title={displayCountsError ? 'Contagem indisponível' : undefined} data-testid="files-total-count">
          {displayCountsError ? '—' : `${displayCounts.all} ${displayCounts.all === 1 ? 'arquivo' : 'arquivos'}`}
        </p>
      </header>

      {/* Etapa 43: enquanto ha paginas nao carregadas, a busca/ordenacao so vale para o recorte
          carregado — o aviso diz quantos sao e oferece "Carregar tudo". */}
      {hasMore && (
        <p className="text-xs text-muted-foreground" data-testid="files-pagination-notice">
          Buscando entre os {items.length} carregados ·{' '}
          <button
            type="button"
            onClick={() => { void loadAll(); }}
            disabled={isFetchingNextPage}
            className="font-medium text-foreground underline underline-offset-2 hover:text-primary disabled:opacity-50"
          >
            Carregar tudo
          </button>
        </p>
      )}

      <FilesToolbar
        search={view.search}
        onSearchChange={view.setSearch}
        sort={view.sort}
        onSortChange={view.setSort}
        period={view.period}
        onPeriodChange={view.setPeriod}
        customFrom={view.customFrom}
        customTo={view.customTo}
        onCustomFromChange={(date) => view.setCustomFrom(date ?? null)}
        onCustomToChange={(date) => view.setCustomTo(date ?? null)}
        onClearCustom={view.clearCustomDates}
        filteredCount={filtered.length}
        totalCount={items.length}
        senderOptions={senderOptions}
        selectedSenders={view.senders}
        onToggleSender={view.toggleSender}
        viewMode={view.viewMode}
        onViewModeChange={view.setViewMode}
        columns={view.columns}
        columnOptions={columnOptions}
        onColumnsChange={view.setColumns}
        selectionMode={selection.selectionMode}
        selectedCount={selection.selectedCount}
        onToggleSelectionMode={() => (selection.selectionMode ? selection.exit() : selection.enter())}
      />

      {/* Etapa 32: barra contextual no topo da area de arquivos, so no modo seleção. */}
      {selection.selectionMode && (
        <FilesSelectionBar
          selectedCount={selection.selectedCount}
          visibleCount={filtered.length}
          outsideFilterCount={selection.selectedOutsideFilter.length}
          allVisibleSelected={allVisibleSelected}
          someVisibleSelected={someVisibleSelected}
          onSelectAllVisible={selection.selectAllVisible}
          onClear={selection.clear}
          onCancel={selection.exit}
          onForward={() => openForward(selectedItems)}
          forwardLimitReason={forwardLimitError(selection.selectedCount, 1)}
        />
      )}

      <div ref={containerRef} className="flex gap-4 items-start" data-testid="files-area">
        <div className="flex-1 min-w-0">
          {periodEmpty ? (
            /* F05: nada dentro do período escolhido — nem vazio real nem "sem resultado" da
               busca, que continuam com as mensagens do FilesContent. */
            <EmptyState
              icon={CalendarX2}
              title="Nenhum arquivo neste período"
              description="Ajuste o período ou veja todos os arquivos da conversa."
              actionLabel="Limpar período"
              onAction={view.clearPeriod}
              size="sm"
            />
          ) : senderEmpty ? (
            /* R08/S56: nada casa com o funil de remetente — diz o que aconteceu e desfaz o
               recorte (o `FilesContent` contaria "nenhum arquivo nesta conversa"). */
            <EmptyState
              icon={Users}
              title="Nenhum arquivo deste remetente"
              description="Ajuste o funil ou veja todos os arquivos da conversa."
              actionLabel="Ver todos os remetentes"
              onAction={view.clearSenders}
              size="sm"
            />
          ) : (
            <FilesContent
              items={filtered}
              viewMode={view.viewMode}
              effectiveColumns={effective}
              containerWidth={gridWidth}
              contactName={contactName}
              senderProfiles={senderProfiles}
              currentUserId={profile?.id ?? null}
              downloadAllowed={canDownload}
              loading={showSkeleton}
              selection={{ mode: selection.selectionMode, selectedIds: selection.selectedIds, toggle: selection.toggle }}
              actions={{ onPreview: setPreviewItem, onOpenDetails: setSelected, onForward: (item) => openForward([item]), onRequestDelete: setDeleteTarget, onOpenInChat: onOpenInChat ? (item) => onOpenInChat(item.id) : undefined }}
              sort={view.sort}
              onSortChange={view.setSort}
              selectedId={selected?.id ?? null}
              hasMore={hasMore}
              isFetchingNextPage={isFetchingNextPage}
              onLoadMore={loadMore}
              sentinelRef={sentinelRef}
              search={view.search}
              typeFilter={view.typeFilter}
              onClearSearch={() => view.setSearch('')}
              onClearFilter={() => view.setTypeFilter('all')}
              isError={isError}
              onRetry={refetch}
            />
          )}
        </div>

        {/* Etapa 31: lado a lado so com >= 1100 px — e nunca no lugar do painel do contato. */}
        {sideBySide && detailProps && <FileDetailPanel {...detailProps} onForward={handleDetailForward} />}
      </div>

      {/* Etapa 31: abaixo de 1100 px (ou sem medida), o MESMO conteudo vai num Sheet a direita. */}
      {!sideBySide && detailProps && (
        <Sheet open onOpenChange={(open) => { if (!open) detailProps.onClose(); }}>
          <SheetContent side="right" className="w-[340px] sm:max-w-[340px]" data-testid="file-detail-sheet">
            <SheetTitle className="sr-only">Detalhes do arquivo</SheetTitle>
            <FileDetailContent {...detailProps} onForward={handleDetailForward} />
          </SheetContent>
        </Sheet>
      )}

      {/* Etapa 35: exclusão com AlertDialog e efeito fiel (só no ZAPP; nada vai ao WhatsApp do cliente). */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem é marcada como apagada (is_deleted = true) e passa a aparecer como
              &quot;[Mensagem apagada]&quot; — o texto original continua guardado, sem ser
              sobrescrito. Ela some da galeria só aqui no ZAPP — não apaga o
              arquivo no WhatsApp do cliente, que continua vendo o que recebeu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={filesActions.isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={filesActions.isDeleting}
              onClick={() => { if (deleteTarget) void filesActions.deleteMessage(deleteTarget); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Apagar mensagem
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewItem && (
        <Suspense fallback={null}>
          <MediaPreviewDialog
            item={previewItem}
            open={!!previewItem}
            onOpenChange={(open) => !open && setPreviewItem(null)}
            items={filtered}
            onNavigate={(next) => {
              const found = filtered.find((candidate) => candidate.id === next.id);
              if (found) setPreviewItem(found);
            }}
          />
        </Suspense>
      )}

      {forwardItems.length > 0 && (
        <Suspense fallback={null}>
          <ForwardMessageDialog
            open={forwardItems.length > 0}
            onOpenChange={(open) => { if (!open) setForwardItems([]); }}
            items={forwardMediaItems}
            targets="contacts"
            onForward={handleForwardToTargets}
          />
        </Suspense>
      )}
    </div>
  );
}
