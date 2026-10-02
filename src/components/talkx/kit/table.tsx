import { useEffect, useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown, Loader2, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fmtInt } from './format';

/** Paginação estilo mockup: "Mostrando 1 a 8 de 24" + botões + tamanho da página. */
export function TalkXPagination({ page, pageSize, total, onPage, onPageSize, noun }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const visible = Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
      <p className="text-xs text-foreground-secondary">Mostrando {from} a {to} de {fmtInt(total)} {noun}</p>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior" className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center disabled:opacity-40 hover:bg-muted/50"><ChevronLeft className="w-4 h-4" /></button>
        {visible.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            {i > 0 && visible[i - 1] !== p - 1 && <span className="text-muted-foreground text-xs px-1">…</span>}
            <button type="button" onClick={() => onPage(p)} className={cn('h-8 min-w-8 px-2 rounded-lg text-xs font-semibold border transition-colors', p === page ? 'bg-primary border-primary text-white' : 'border-border/70 bg-input/40 text-foreground-secondary hover:bg-muted/50')}>{p}</button>
          </span>
        ))}
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Próxima página" className="h-8 w-8 rounded-lg border border-border/70 bg-input/40 flex items-center justify-center disabled:opacity-40 hover:bg-muted/50"><ChevronRight className="w-4 h-4" /></button>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 rounded-lg bg-input/40 border-border/70 text-xs w-auto gap-1.5 ml-2"><SelectValue /></SelectTrigger>
          <SelectContent>{[8, 10, 20, 50].map((n) => <SelectItem key={n} value={String(n)}>{n} por página</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════════════
// E15 — RowActionsMenu, SegmentedToggle, PrimaryButtonGlow
// ════════════════════════════════════════════════════════════════════════════
export interface RowAction { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean; }
/**
 * Menu de ações de linha (⋮ vertical). `label` vira o aria-label do gatilho —
 * o chamador passa o NOME da linha. `busy` desabilita o gatilho e troca o
 * ícone por um spinner, para ações por linha que ainda estão carregando.
 */
export function RowActionsMenu({ actions, label = 'Ações', busy = false }: { actions: RowAction[]; label?: string; busy?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button" aria-label={label} aria-busy={busy || undefined} disabled={busy}
          className={cn('talkx-glow-ring inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 bg-input/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors', busy && 'opacity-60 cursor-wait')}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {actions.map((a, i) => (
          <DropdownMenuItem key={i} onClick={a.disabled ? undefined : a.onSelect} disabled={a.disabled}
            className={cn(a.danger && !a.disabled && 'text-destructive focus:text-destructive focus:bg-destructive/10')}
          >
            {a.icon && <a.icon className="w-3.5 h-3.5 mr-2 opacity-70" />} {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
// ════════════════════════════════════════════════════════════════════════════
// X043 — barra de seleção em massa
// ════════════════════════════════════════════════════════════════════════════
/** "N selecionadas" + ações do chamador + "Limpar seleção". */
export function TalkXBulkBar({ count, onClear, actions, className }: { count: number; onClear: () => void; actions?: ReactNode; className?: string }) {
  if (count <= 0) return null;
  return (
    <div role="status" className={cn('flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/8 px-3.5 py-2.5', className)}>
      <span className="text-xs font-semibold text-foreground">{count} selecionada{count === 1 ? '' : 's'}</span>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
      <button type="button" onClick={onClear} className="ml-auto text-2xs font-semibold text-primary underline underline-offset-2 hover:text-primary/80">Limpar seleção</button>
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════════════
// E17 — TalkXTable genérico (+ X043: ordenação, massa, ações e loading)
// ════════════════════════════════════════════════════════════════════════════
export type TalkXSortDir = 'asc' | 'desc';
export interface TalkXSort { key: string; dir: TalkXSortDir }
export interface TalkXColumn<T> {
  key: string; header: string; width?: string | number; align?: 'left' | 'center' | 'right';
  /** Quando presente, o cabeçalho vira botão ordenável (cliente ou servidor). */
  sortKey?: string;
  render: (row: T, idx: number) => ReactNode;
}
const alignCls = (a?: 'left' | 'center' | 'right') => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
export function TalkXTable<T extends object>({
  columns, rows, getId, selectable = false, selected, onSelectionChange, selectionResetKey,
  sort = null, onSortChange, rowActions, rowLabel, rowBusy, loading = false, loadingRows = 5,
  stickyHeader = false, emptyState, className,
}: {
  columns: TalkXColumn<T>[]; rows: T[]; getId: (row: T) => string;
  selectable?: boolean; selected?: Set<string>; onSelectionChange?: (s: Set<string>) => void;
  /** Muda de valor → a seleção é zerada (troca de página/filtro). */
  selectionResetKey?: string | number;
  sort?: TalkXSort | null; onSortChange?: (s: TalkXSort | null) => void;
  rowActions?: (row: T) => RowAction[]; rowLabel?: (row: T) => string; rowBusy?: (row: T) => boolean;
  loading?: boolean; loadingRows?: number;
  stickyHeader?: boolean; emptyState?: ReactNode; className?: string;
}) {
  const allSelected = rows.length > 0 && !!selected && rows.every((r) => selected.has(getId(r)));
  const someSelected = !!selected && !allSelected && rows.some((r) => selected.has(getId(r)));
  const colCount = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);

  const headRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (headRef.current) headRef.current.indeterminate = someSelected; }, [someSelected]);

  // selectionResetKey: zera a seleção controlada quando a chave muda (não no mount).
  const prevResetKey = useRef(selectionResetKey);
  useEffect(() => {
    if (prevResetKey.current === selectionResetKey) return;
    prevResetKey.current = selectionResetKey;
    if (onSelectionChange && selected && selected.size > 0) onSelectionChange(new Set());
  }, [selectionResetKey, onSelectionChange, selected]);

  const toggleAll = () => {
    if (!onSelectionChange || !selected) return;
    const n = new Set(selected);
    if (allSelected) rows.forEach((r) => n.delete(getId(r))); else rows.forEach((r) => n.add(getId(r)));
    onSelectionChange(n);
  };
  const toggleRow = (id: string) => {
    if (!onSelectionChange || !selected) return;
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    onSelectionChange(n);
  };
  const cycleSort = (key: string) => {
    if (!onSortChange) return;
    const next: TalkXSort | null = !sort || sort.key !== key ? { key, dir: 'asc' }
      : sort.dir === 'asc' ? { key, dir: 'desc' } : null;
    onSortChange(next);
  };
  const skeletonN = Math.max(rows.length, loadingRows);

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="talkx-table" aria-busy={loading || undefined}>
        <thead className={stickyHeader ? 'sticky top-0 bg-card z-10' : ''}>
          <tr>
            {selectable && (
              <th scope="col" style={{ width: 44 }} className="pl-3">
                <input type="checkbox" checked={allSelected} ref={headRef} onChange={toggleAll}
                  className="w-3.5 h-3.5 accent-primary cursor-pointer" aria-label="Selecionar tudo" />
              </th>
            )}
            {columns.map((col) => {
              const active = !!col.sortKey && sort?.key === col.sortKey;
              const ariaSort = col.sortKey ? (active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined;
              return (
                <th key={col.key} scope="col" aria-sort={ariaSort} style={col.width ? { width: col.width } : undefined} className={alignCls(col.align)}>
                  {col.sortKey && onSortChange ? (
                    <button type="button" onClick={() => cycleSort(col.sortKey as string)}
                      className="inline-flex items-center gap-1.5 font-semibold text-inherit hover:text-foreground transition-colors"
                    >
                      {col.header}
                      {active ? (sort?.dir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)
                        : <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />}
                    </button>
                  ) : col.header}
                </th>
              );
            })}
            {rowActions && <th scope="col" style={{ width: 52 }} className="pr-3 text-right"><span className="sr-only">Ações</span></th>}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonN }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {selectable && <td className="pl-3"><div className="h-3.5 w-3.5 rounded bg-muted/60 animate-pulse" /></td>}
                {columns.map((col) => (
                  <td key={col.key} className={alignCls(col.align)}><div className="h-3.5 w-full max-w-[120px] rounded bg-muted/60 animate-pulse" /></td>
                ))}
                {rowActions && <td className="pr-3"><div className="ml-auto h-6 w-6 rounded bg-muted/60 animate-pulse" /></td>}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={colCount} className="h-32 text-center text-muted-foreground text-sm">{emptyState ?? 'Nenhum resultado.'}</td></tr>
          ) : rows.map((row, idx) => {
            const id = getId(row);
            const isSelected = !!selected?.has(id);
            return (
              <tr key={id} className={isSelected ? 'bg-primary/5' : ''}>
                {selectable && (
                  <td className="pl-3">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleRow(id)}
                      className="w-3.5 h-3.5 accent-primary cursor-pointer" aria-label={rowLabel ? `Selecionar ${rowLabel(row)}` : `Selecionar ${id}`} />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={cn(col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '')}>
                    {col.render(row, idx)}
                  </td>
                ))}
                {rowActions && (
                  <td className="pr-3">
                    <div className="flex justify-end">
                      <RowActionsMenu actions={rowActions(row)} busy={rowBusy?.(row)}
                        label={rowLabel ? `Ações de ${rowLabel(row)}` : 'Ações'} />
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
