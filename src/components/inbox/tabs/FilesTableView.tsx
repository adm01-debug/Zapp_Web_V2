import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Share2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { ContactMediaItem } from '@/hooks/chat/useContactMedia';
import type { FilesSort } from '@/hooks/chat/useFilesViewState';
import { resolveSenderIdentity, type SenderProfileMap } from '@/lib/fileSenderIdentity';
import { formatFileDate, formatSize, TYPE_LABEL } from './fileDisplay';
import { FileThumb } from './FileThumb';
import { FileActionsMenu } from './FileActionsMenu';
import { AudioPlayButton } from './AudioPlayButton';
import { SenderAvatar } from './SenderAvatar';
import { FILE_ACTION_BUTTON, FILE_ACTION_BUTTON_DISABLED } from './fileActionButton';

/**
 * Tabela da aba Arquivos (etapas 23-24). `SortableHeader` portado do `ContactsTable` com
 * `aria-sort`; Arquivo, Tamanho e Data ordenam e mapeiam no MESMO `sort` do hook (sem
 * estado de ordenacao paralelo para esses tres). `table-fixed` com prioridades por
 * contêiner: < 720 px esconde o remetente e Tamanho, < 560 px esconde Tipo — a preferencia
 * "Tabela" nunca e trocada por "Lista" sozinha.
 *
 * R06 (S48): a coluna "Enviado por" mostra a foto + o nome de quem enviou, resolvidos do lote
 * de perfis que o `FilesTab` repassa por props (D04), e ordena pela PESSOA. Essa ordem NAO
 * cabe no `sort` do hook (que so conhece arquivo/tamanho/data): ela vive aqui e vale apenas
 * enquanto o `sort` do hook nao mudar — pedir outra ordem zera a ordenacao por remetente.
 */

type SortableField = 'name' | 'size' | 'date';

/** R06 (S48): direcao da ordenacao pela pessoa; `null` = ordem do hook. */
type SenderSort = 'asc' | 'desc';

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

/** Rotulo + seta de ordenacao: o mesmo desenho para as colunas do hook e para "Enviado por". */
function HeaderButton({ label, isActive, dir, onClick }: {
  label: string; isActive: boolean; dir: 'ascending' | 'descending'; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
  );
}

function SortableHeader({ label, field, sort, onSort, inactive = false, className }: {
  label: string; field: SortableField; sort: FilesSort;
  onSort: (sort: FilesSort) => void; inactive?: boolean; className?: string;
}) {
  const isActive = !inactive && activeField(sort) === field;
  return (
    <TableHead className={cn('group h-10 px-3', className)} aria-sort={isActive ? direction(sort) : 'none'}>
      <HeaderButton
        label={label}
        isActive={isActive}
        dir={direction(sort)}
        onClick={() => onSort(nextSort(sort, field))}
      />
    </TableHead>
  );
}

interface FilesTableViewProps {
  items: ContactMediaItem[];
  contactName: string;
  selectionMode: boolean;
  selectedIds: Set<string>;
  /** Largura medida do contêiner da aba; `null` antes da primeira medida (assume larga). */
  containerWidth: number | null;
  sort: FilesSort;
  /** R06/D04: perfis dos atendentes resolvidos em LOTE uma unica vez no `FilesTab`. */
  senderProfiles?: SenderProfileMap;
  /** R06/D01: `profiles.id` do usuário logado — decide o rotulo "Voce". */
  currentUserId?: string | null;
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
  senderProfiles,
  currentUserId = null,
  onSortChange,
  onSelect,
  onToggleSelection,
  onPreview,
  onRequestDelete,
}: FilesTableViewProps) {
  const showSender = containerWidth === null || containerWidth >= 720;
  const showSize = containerWidth === null || containerWidth >= 720;
  const showType = containerWidth === null || containerWidth >= 560;

  // R06 (S48): a ordenacao por remetente e lembrada junto com o `sort` do hook que a originou.
  // Ela so vale com a coluna visivel (>= 720 px) e enquanto o `sort` nao mudar: esconder a
  // coluna por largura ou pedir outra ordem (outro cabecalho, barra de ferramentas) devolve a
  // tabela a ordem do hook — sem efeito e sem estado de ordenacao paralelo para os outros campos.
  const [senderSort, setSenderSort] = useState<{ dir: SenderSort; sort: FilesSort } | null>(null);
  const senderDir = showSender && senderSort && senderSort.sort === sort ? senderSort.dir : null;

  const orderedItems = useMemo(() => {
    if (!senderDir) return items;
    const nome = (item: ContactMediaItem) =>
      resolveSenderIdentity({ item, currentUserId, contact: { name: contactName }, profiles: senderProfiles }).name;
    return [...items].sort((a, b) => {
      const comparacao = nome(a).localeCompare(nome(b), 'pt-BR');
      return senderDir === 'asc' ? comparacao : -comparacao;
    });
  }, [items, senderDir, contactName, currentUserId, senderProfiles]);

  return (
    <div data-testid="files-table" className="rounded-xl border border-border/70 overflow-hidden">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-10 w-10 px-3"><span className="sr-only">Seleção</span></TableHead>
            <SortableHeader label="Arquivo" field="name" sort={sort} onSort={onSortChange} inactive={senderDir !== null} />
            {showType && <TableHead className="h-10 w-24 px-3">Tipo</TableHead>}
            {showSize && <SortableHeader label="Tamanho" field="size" sort={sort} onSort={onSortChange} inactive={senderDir !== null} className="w-28" />}
            <SortableHeader label="Data" field="date" sort={sort} onSort={onSortChange} inactive={senderDir !== null} className="w-40" />
            {showSender && (
              <TableHead
                className="group h-10 w-40 px-3"
                aria-sort={senderDir === null ? 'none' : senderDir === 'asc' ? 'ascending' : 'descending'}
              >
                <HeaderButton
                  label="Enviado por"
                  isActive={senderDir !== null}
                  dir={senderDir === 'desc' ? 'descending' : 'ascending'}
                  onClick={() => setSenderSort({ dir: senderDir === 'asc' ? 'desc' : 'asc', sort })}
                />
              </TableHead>
            )}
            <TableHead className="h-10 w-28 px-3 text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orderedItems.map((item) => {
            const checked = selectedIds.has(item.id);
            const primary = selectionMode ? () => onToggleSelection(item.id) : () => onSelect(item);
            const remetente = resolveSenderIdentity({
              item,
              currentUserId,
              contact: { name: contactName },
              profiles: senderProfiles,
            });

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
                {showSender && (
                  <TableCell className="h-14 px-3">
                    {/* R06 (S48): foto + nome de quem enviou (mesma regra do cartao). */}
                    <SenderAvatar
                      name={remetente.name}
                      avatarUrl={remetente.avatarUrl}
                      colorKey={item.agentId ?? undefined}
                      showName
                    />
                  </TableCell>
                )}
                <TableCell className="h-14 px-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* A04: play/pause do áudio na tabela, só para itens de áudio. */}
                    {item.type === 'audio' && <AudioPlayButton item={item} />}
                    <button type="button" aria-label="Visualizar" className={FILE_ACTION_BUTTON} onClick={() => onPreview(item)}>
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" aria-label="Encaminhar" title="Disponível em breve" disabled className={FILE_ACTION_BUTTON_DISABLED}>
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
