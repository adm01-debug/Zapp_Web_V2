import type { RefObject } from 'react';
import { AlertTriangle, Paperclip, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { FilesSort, FilesTypeFilter, FilesViewMode } from '@/hooks/chat/useFilesViewState';
import { FileCard } from './FileCard';
import { FilesListView } from './FilesListView';
import { FilesTableView } from './FilesTableView';

/**
 * Renderer unico da aba Arquivos (etapa 25): recebe `items` ja filtrados/ordenados, a selecao,
 * as acoes e o `viewMode`, e escolhe Grid (FileCard) / Lista / Tabela. O skeleton e por modo
 * (6 cartoes / 6 linhas / 6 TableRow) e a formatacao de data e tamanho vem so de
 * `fileDisplay.ts`, entao os tres modos mostram exatamente os mesmos valores.
 *
 * Etapa 44: separa os cinco estados — carregando inicial (skeleton), vazio real, busca/filtro
 * sem resultado (com "Limpar"), erro de consulta (com "Tentar novamente", sem apagar a lista
 * anterior) e carregando mais (skeleton no fim). Etapa 41: o rodape "Carregar mais" e o
 * sentinela de carga automatica so aparecem quando ha proxima pagina.
 */

/** Etapa 16: mapa literal de colunas — o Tailwind precisa das strings completas. */
const COLS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  7: 'grid-cols-7',
  8: 'grid-cols-8',
};

export interface FilesActions {
  onPreview: (item: ContactMediaItem) => void;
  onOpenDetails: (item: ContactMediaItem) => void;
  onForward: (item: ContactMediaItem) => void;
  /** Etapa 35: pede a exclusao — quem abre o AlertDialog e chama o useFilesActions e o FilesTab. */
  onRequestDelete: (item: ContactMediaItem) => void;
}

export interface FilesContentSelection {
  mode: boolean;
  selectedIds: Set<string>;
  toggle: (id: string) => void;
}

interface FilesContentProps {
  items: ContactMediaItem[];
  viewMode: FilesViewMode;
  effectiveColumns: number;
  /** Largura medida do contêiner; `null` antes da primeira medida. */
  containerWidth: number | null;
  contactName: string;
  loading: boolean;
  selection: FilesContentSelection;
  actions: FilesActions;
  sort: FilesSort;
  onSortChange: (sort: FilesSort) => void;
  selectedId: string | null;
  /** Etapa 41: ha proxima pagina / pagina seguinte em voo / gatilho do "Carregar mais". */
  hasMore?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  sentinelRef?: RefObject<HTMLDivElement | null>;
  /** Etapa 44: contexto do recorte para distinguir vazio real de "sem resultado". */
  search?: string;
  typeFilter?: FilesTypeFilter;
  onClearSearch?: () => void;
  onClearFilter?: () => void;
  /** Etapa 44: erro de consulta (com lista anterior preservada). */
  isError?: boolean;
  onRetry?: () => void;
}

const SKELETON_ROWS = 6;

function GridSkeleton({ columns }: { columns: number }) {
  return (
    <div className={cn('grid gap-3', COLS[columns as keyof typeof COLS])}>
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="aspect-[4/5] rounded-xl bg-muted/30 animate-pulse" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <div key={i} className="h-16 rounded-xl border border-border/70 bg-muted/30 animate-pulse" />
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <Table className="table-fixed">
      <TableBody>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          <TableRow key={i} className="h-14">
            <TableCell className="h-14 px-3" colSpan={4}>
              <div className="h-8 rounded bg-muted/30 animate-pulse" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Etapa 44: erro de consulta — nunca apaga a lista ja carregada (fica como faixa acima dela). */
function QueryErrorBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2"
      data-testid="files-query-error"
      role="alert"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <p className="text-sm text-foreground">Não foi possível carregar</p>
      <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Tentar novamente
      </Button>
    </div>
  );
}

function QueryErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center" data-testid="files-query-error">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">Não foi possível carregar</p>
      <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Tentar novamente
      </Button>
    </div>
  );
}

/** Etapa 41: rodape com "Carregar mais" + sentinela; o skeleton aparece so ao carregar mais. */
function LoadMoreFooter({
  isFetchingNextPage,
  onLoadMore,
  sentinelRef,
}: {
  isFetchingNextPage: boolean;
  onLoadMore?: () => void;
  sentinelRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex flex-col items-center gap-2 pt-1" data-testid="files-load-more-footer">
      {isFetchingNextPage && (
        <div className="h-12 w-full rounded-xl bg-muted/30 animate-pulse" data-testid="files-loading-more" />
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        disabled={isFetchingNextPage}
        onClick={onLoadMore}
        data-testid="files-load-more"
      >
        {isFetchingNextPage ? 'Carregando...' : 'Carregar mais'}
      </Button>
      <div ref={sentinelRef} data-testid="files-load-more-sentinel" aria-hidden="true" className="h-px w-full" />
    </div>
  );
}

export function FilesContent({
  items,
  viewMode,
  effectiveColumns,
  containerWidth,
  contactName,
  loading,
  selection,
  actions,
  sort,
  onSortChange,
  selectedId,
  hasMore = false,
  isFetchingNextPage = false,
  onLoadMore,
  sentinelRef,
  search = '',
  typeFilter = 'all',
  onClearSearch,
  onClearFilter,
  isError = false,
  onRetry,
}: FilesContentProps) {
  // Etapa 44 — carregando inicial: skeleton do modo escolhido.
  if (loading) {
    if (viewMode === 'list') return <ListSkeleton />;
    if (viewMode === 'table') return <TableSkeleton />;
    return <GridSkeleton columns={effectiveColumns} />;
  }

  // Etapa 44 — erro sem nada carregado: so o estado de erro; com lista, a faixa preserva o conteudo.
  if (isError && items.length === 0) return <QueryErrorState onRetry={onRetry} />;

  // Etapa 44 — vazio real x "sem resultado": o recorte ativo muda a mensagem.
  if (items.length === 0) {
    const query = search.trim();
    if (query) {
      return (
        <EmptyState
          icon={Paperclip}
          title={`Nada corresponde a "${query}"`}
          description="Ajuste a busca ou veja todos os arquivos da conversa."
          actionLabel="Limpar busca"
          onAction={onClearSearch}
          size="sm"
        />
      );
    }
    if (typeFilter !== 'all') {
      return (
        <EmptyState
          icon={Paperclip}
          title="Nenhum arquivo deste tipo"
          description="Este filtro não tem arquivos nesta conversa."
          actionLabel="Ver todos"
          onAction={onClearFilter}
          size="sm"
        />
      );
    }
    return (
      <EmptyState
        icon={Paperclip}
        title="Nenhum arquivo nesta conversa"
        description="Arquivos, imagens e documentos desta conversa aparecerão aqui."
        size="sm"
      />
    );
  }

  const body = viewMode === 'list' ? (
    <FilesListView
      items={items}
      contactName={contactName}
      selectionMode={selection.mode}
      selectedIds={selection.selectedIds}
      containerWidth={containerWidth}
      onSelect={actions.onOpenDetails}
      onToggleSelection={selection.toggle}
      onPreview={actions.onPreview}
      onRequestDelete={actions.onRequestDelete}
    />
  ) : viewMode === 'table' ? (
    <FilesTableView
      items={items}
      contactName={contactName}
      selectionMode={selection.mode}
      selectedIds={selection.selectedIds}
      containerWidth={containerWidth}
      sort={sort}
      onSortChange={onSortChange}
      onSelect={actions.onOpenDetails}
      onToggleSelection={selection.toggle}
      onPreview={actions.onPreview}
      onRequestDelete={actions.onRequestDelete}
    />
  ) : (
    <div className={cn('grid gap-3', COLS[effectiveColumns as keyof typeof COLS])}>
      {items.map((item) => (
        <FileCard
          key={item.id}
          item={item}
          contactName={contactName}
          selected={selectedId === item.id}
          selectionMode={selection.mode}
          selectionChecked={selection.selectedIds.has(item.id)}
          effectiveColumns={effectiveColumns}
          onSelect={() => actions.onOpenDetails(item)}
          onToggleSelection={() => selection.toggle(item.id)}
          onPreview={() => actions.onPreview(item)}
          onForward={() => actions.onForward(item)}
          onRequestDelete={actions.onRequestDelete}
        />
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {isError && <QueryErrorBanner onRetry={onRetry} />}
      {body}
      {(hasMore || isFetchingNextPage) && (
        <LoadMoreFooter isFetchingNextPage={isFetchingNextPage} onLoadMore={onLoadMore} sentinelRef={sentinelRef} />
      )}
    </div>
  );
}
