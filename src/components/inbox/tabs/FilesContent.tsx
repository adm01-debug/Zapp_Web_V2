import { Paperclip } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { FilesSort, FilesViewMode } from '@/hooks/chat/useFilesViewState';
import { FileCard } from './FileCard';
import { FilesListView } from './FilesListView';
import { FilesTableView } from './FilesTableView';

/**
 * Renderer unico da aba Arquivos (etapa 25): recebe `items` ja filtrados/ordenados, a selecao,
 * as acoes e o `viewMode`, e escolhe Grid (FileCard) / Lista / Tabela. O skeleton e por modo
 * (6 cartoes / 6 linhas / 6 TableRow) e a formatacao de data e tamanho vem so de
 * `fileDisplay.ts`, entao os tres modos mostram exatamente os mesmos valores.
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
  /** Disparado depois de uma exclusao concluida (o "Excluir mensagem" vive no renderer). */
  onDeleted: () => void;
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
}: FilesContentProps) {
  if (loading) {
    if (viewMode === 'list') return <ListSkeleton />;
    if (viewMode === 'table') return <TableSkeleton />;
    return <GridSkeleton columns={effectiveColumns} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Paperclip}
        title="Nenhum arquivo encontrado"
        description="Arquivos, imagens e documentos desta conversa aparecerão aqui."
        size="sm"
      />
    );
  }

  if (viewMode === 'list') {
    return (
      <FilesListView
        items={items}
        contactName={contactName}
        selectionMode={selection.mode}
        selectedIds={selection.selectedIds}
        containerWidth={containerWidth}
        onSelect={actions.onOpenDetails}
        onToggleSelection={selection.toggle}
        onPreview={actions.onPreview}
        onDeleted={actions.onDeleted}
      />
    );
  }

  if (viewMode === 'table') {
    return (
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
        onDeleted={actions.onDeleted}
      />
    );
  }

  return (
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
          onDeleted={actions.onDeleted}
        />
      ))}
    </div>
  );
}
