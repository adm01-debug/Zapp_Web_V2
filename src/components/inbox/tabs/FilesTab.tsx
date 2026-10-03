import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/auth/useAuth';
import { useContactMedia, type ContactMediaItem } from '@/hooks/chat/useContactMedia';
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
import { FilesToolbar } from './FilesToolbar';
import { FilesContent } from './FilesContent';
import { FilesSelectionBar } from './FilesSelectionBar';
import { FileDetailContent, FileDetailPanel } from './FileDetailPanel';
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

const CHIPS: { id: FilesTypeFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'image', label: 'Imagens' },
  { id: 'video', label: 'Vídeos' },
  { id: 'audio', label: 'Áudios' },
  { id: 'document', label: 'Docs' },
];

interface FilesTabProps {
  contactId: string;
  contactName: string;
}

export function FilesTab({ contactId, contactName }: FilesTabProps) {
  const { user } = useAuth();
  const view = useFilesViewState(user?.id, contactId);
  const containerRef = useRef<HTMLDivElement>(null);
  const { effective: containerEffective, width: containerWidth, available: containerOptions } =
    useFilesContainerColumns(containerRef, view.columns);
  const { data, isLoading } = useContactMedia(contactId);

  const [selected, setSelected] = useState<ContactMediaItem | null>(null);
  const [previewItem, setPreviewItem] = useState<ContactMediaItem | null>(null);
  // Etapa 38: o diálogo de encaminhar recebe um ou N itens da seleção.
  const [forwardItems, setForwardItems] = useState<ContactMediaItem[]>([]);
  const forwardStateRef = useRef<ForwardRunState | null>(null);
  // Etapa 35: item cuja exclusao aguarda confirmacao no AlertDialog (no lugar do window.confirm).
  const [deleteTarget, setDeleteTarget] = useState<ContactMediaItem | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = data?.counts ?? { all: 0, image: 0, video: 0, audio: 0, document: 0 };
  const hasMore = data?.hasMore ?? false;

  const filtered = useMemo(() => {
    let list = view.typeFilter === 'all' ? items : items.filter((i) => i.type === view.typeFilter);
    if (view.search.trim()) {
      const q = view.search.trim().toLowerCase();
      list = list.filter((i) => i.filename.toLowerCase().includes(q) || (i.caption ?? '').toLowerCase().includes(q));
    }
    const sorted = [...list];
    if (view.sort === 'recent') sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    else if (view.sort === 'old') sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else if (view.sort === 'biggest') sorted.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    else sorted.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
    return sorted;
  }, [items, view.typeFilter, view.search, view.sort]);

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

  // Etapa 38: os itens selecionados (dentro do recorte atual) alimentam o diálogo.
  const selectedItems = useMemo(
    () => filtered.filter((item) => selection.selectedIds.has(item.id)),
    [filtered, selection.selectedIds],
  );

  const forwardMediaItems = useMemo<ForwardMediaItem[]>(
    () => forwardItems.map((item) => ({
      id: item.id, url: item.url, type: item.type, filename: item.filename, caption: item.caption,
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

  const detailProps = selected
    ? { item: selected, contactName, onClose: () => setSelected(null), onRequestDelete: setDeleteTarget }
    : null;

  return (
    <div className="flex flex-col gap-3" data-testid="files-tab">
      {/* Etapa 14: título e chips na mesma linha, contagem honesta, sem subtítulo. */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-base font-semibold text-foreground">Arquivos</h2>
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
                {counts[chip.id]}
              </span>
            </button>
          ))}
        </div>
        <p className="ml-auto text-xs text-muted-foreground tabular-nums">
          {hasMore
            ? `${items.length} carregados · há mais antigos`
            : `${counts.all} ${counts.all === 1 ? 'arquivo' : 'arquivos'}`}
        </p>
      </header>

      <FilesToolbar
        search={view.search}
        onSearchChange={view.setSearch}
        sort={view.sort}
        onSortChange={view.setSort}
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
          <FilesContent
            items={filtered}
            viewMode={view.viewMode}
            effectiveColumns={effective}
            containerWidth={gridWidth}
            contactName={contactName}
            loading={isLoading}
            selection={{ mode: selection.selectionMode, selectedIds: selection.selectedIds, toggle: selection.toggle }}
            actions={{ onPreview: setPreviewItem, onOpenDetails: setSelected, onForward: (item) => openForward([item]), onRequestDelete: setDeleteTarget }}
            sort={view.sort}
            onSortChange={view.setSort}
            selectedId={selected?.id ?? null}
          />
        </div>

        {/* Etapa 31: lado a lado so com >= 1100 px — e nunca no lugar do painel do contato. */}
        {sideBySide && detailProps && <FileDetailPanel {...detailProps} />}
      </div>

      {/* Etapa 31: abaixo de 1100 px (ou sem medida), o MESMO conteudo vai num Sheet a direita. */}
      {!sideBySide && detailProps && (
        <Sheet open onOpenChange={(open) => { if (!open) detailProps.onClose(); }}>
          <SheetContent side="right" className="w-[340px] sm:max-w-[340px]" data-testid="file-detail-sheet">
            <SheetTitle className="sr-only">Detalhes do arquivo</SheetTitle>
            <FileDetailContent {...detailProps} />
          </SheetContent>
        </Sheet>
      )}

      {/* Etapa 35: exclusão com AlertDialog e efeito fiel (só no ZAPP; nada vai ao WhatsApp do cliente). */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem é marcada como apagada (is_deleted = true) e o conteúdo vira
              &quot;[Mensagem apagada]&quot;. Ela some da galeria só aqui no ZAPP — não apaga o
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
