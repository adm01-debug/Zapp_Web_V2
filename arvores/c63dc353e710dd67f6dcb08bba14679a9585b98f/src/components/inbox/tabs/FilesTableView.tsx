import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Share2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { FilesSort } from '@/hooks/chat/useFilesViewState';
import { formatFileDate, formatSize, TYPE_LABEL } from './fileDisplay';
import { FileThumb } from './FileThumb';
import { FileActionsMenu } from './FileActionsMenu';

/**
 * Tabela da aba Arquivos (etapas 23-24). `SortableHeader` portado do `ContactsTable` com
 * `aria-sort`; so Arquivo, Tamanho e Data ordenam e mapeiam no MESMO `sort` do hook (sem
 * estado de ordenacao paralelo). `table-fixed` com prioridades por contêiner: < 720 px
 * esconde Remetente e Tamanho, < 560 px esconde Tipo — a preferencia "Tabela" nunca e
 * trocada por "Lista" sozinha.
 */

type SortableField = 'name' | 'size' | 'date';

/** Em que campo o `sort` atual incide (para marcar o cabecalho ativo). */
function activeField(sort: FilesSort): SortableField | null {
  if (sort === 'alpha') return 'name';
  if (sort === 'recent' || sort === 'old') return 'date';
  if (sort === 'biggest') return 'size';
  return null;
}

function direction(sort: FilesSort): 'ascending' | 'descending' {
  return sort === 'old' || sort === 'alpha' ? 'ascending' : 'descending';
}

/**
 * Proximo `sort` do hook ao clicar num cabecalho. O dominio tem 4 valores (sem "menores"):
 * Tamanho alterna com "recent" ao segundo clique; Data alterna recent<->old; Arquivo alterna
 * alpha<->recent.
 */
function nextSort(sort: FilesSort, field: SortableField): FilesSort {
  if (field === 'name') return sort === 'alpha' ? 'recent' : 'alpha';
  if (field === 'size') return sort === 'biggest' ? 'recent' : 'biggest';
  return sort === 'recent' ? 'old' : 'recent';
}

function SortableHeader({ label, field, sort, onSort, className }: {
  label: string; field: SortableField; sort: FilesSort;
  onSort: (sort: FilesSort) => void; className?: string;
}) {
  const isActive = activeField(sort) === field;
  const dir = direction(sort);
  return (
    <TableHead className={cn('group h-10 px-3', className)} aria-sort={isActive ? dir : 'none'}>
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, field))}
        className="flex w-full items-center gap-1 select-none text-xs font-semibold tracking-normal text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        {label}
        {isActive ? (
          dir === 'ascending'
            ? <ArrowUp className="w-3 h-3 text-primary" />
            : <ArrowDown className="w-3 h-3 text-primary" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
        )}
      </button>
    </TableHead>
  );
}

const ACTION_BUTTON = 'w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface FilesTableViewProps {
  items: ContactMediaItem[];
  contactName: string;
  selectionMode: boolean;
  selectedIds: Set<string>;
  /** Largura medida do contêiner da aba; `null` antes da primeira medida (assume larga). */
  containerWidth: number | null;
  sort: FilesSort;
  onSortChange: (sort: FilesSort) => void;
  onSelect: (item: ContactMediaItem) => void;
  onToggleSelection: (id: string) => void;
  onPreview: (item: ContactMediaItem) => void;
  onRequestDelete: (item: ContactMediaItem) => void;
}

export function FilesTableView({
  items,
  contactName,
  selectionMode,
  selectedIds,
  containerWidth,
  sort,
  onSortChange,
  onSelect,
  onToggleSelection,
  onPreview,
  onRequestDelete,
}: FilesTableViewProps) {
  const showSender = containerWidth === null || containerWidth >= 720;
  const showSize = containerWidth === null || containerWidth >= 720;
  const showType = containerWidth === null || containerWidth >= 560;

  return (
    <div data-testid="files-table" className="rounded-xl border border-border/70 overflow-hidden">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-10 w-10 px-3"><span className="sr-only">Seleção</span></TableHead>
            <SortableHeader label="Arquivo" field="name" sort={sort} onSort={onSortChange} />
            {showType && <TableHead className="h-10 w-24 px-3">Tipo</TableHead>}
            {showSize && <SortableHeader label="Tamanho" field="size" sort={sort} onSort={onSortChange} className="w-28" />}
            <SortableHeader label="Data" field="date" sort={sort} onSort={onSortChange} className="w-40" />
            {showSender && <TableHead className="h-10 w-40 px-3">Remetente</TableHead>}
            <TableHead className="h-10 w-28 px-3 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const checked = selectedIds.has(item.id);
            const primary = selectionMode ? () => onToggleSelection(item.id) : () => onSelect(item);

            return (
              <TableRow
                key={item.id}
                data-testid={`files-item-${item.id}`}
                className={cn('h-14', checked && 'bg-primary/5')}
              >
                <TableCell className="h-14 w-10 px-3">
                  {selectionMode && (
                    <Checkbox
                      checked={checked}
                      aria-label={`Selecionar ${item.displayName}`}
                      onCheckedChange={() => onToggleSelection(item.id)}
                    />
                  )}
                </TableCell>
                <TableCell className="h-14 px-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Visualizar ${item.displayName}`}
                      className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={selectionMode ? () => onToggleSelection(item.id) : () => onPreview(item)}
                    >
                      <FileThumb item={item} size="cell" />
                    </button>
                    <button
                      type="button"
                      title={item.filename}
                      onClick={primary}
                      className="min-w-0 truncate rounded text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.displayName}
                    </button>
                  </div>
                </TableCell>
                {showType && <TableCell className="h-14 px-3 text-xs text-muted-foreground">{TYPE_LABEL[item.type]}</TableCell>}
                {showSize && <TableCell className="h-14 px-3 text-xs tabular-nums text-muted-foreground">{formatSize(item.size) ?? '—'}</TableCell>}
                <TableCell className="h-14 px-3 text-xs text-muted-foreground">{formatFileDate(item.created_at)}</TableCell>
                {showSender && <TableCell className="h-14 max-w-40 truncate px-3 text-xs text-muted-foreground">{item.senderLabel ?? contactName}</TableCell>}
                <TableCell className="h-14 px-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" aria-label="Visualizar" className={ACTION_BUTTON} onClick={() => onPreview(item)}>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" aria-label="Encaminhar" title="Disponível em breve" disabled className={`${ACTION_BUTTON} text-muted-foreground/50 cursor-not-allowed`}>
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <FileActionsMenu item={item} onRequestDelete={onRequestDelete} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
