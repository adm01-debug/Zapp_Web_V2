import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
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
export function RowActionsMenu({ actions, label = 'Ações' }: { actions: RowAction[]; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button" aria-label={label}
          className="talkx-glow-ring inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border/60 bg-input/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
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
// E17 — TalkXTable genérico
// ════════════════════════════════════════════════════════════════════════════
export interface TalkXColumn<T> {
  key: string; header: string; width?: string | number; align?: 'left' | 'center' | 'right';
  render: (row: T, idx: number) => ReactNode;
}
export function TalkXTable<T extends object>({
  columns, rows, getId, selectable = false, selected, onSelectionChange, stickyHeader = false, emptyState, className,
}: {
  columns: TalkXColumn<T>[]; rows: T[]; getId: (row: T) => string;
  selectable?: boolean; selected?: Set<string>; onSelectionChange?: (s: Set<string>) => void;
  stickyHeader?: boolean; emptyState?: ReactNode; className?: string;
}) {
  const allSelected = rows.length > 0 && selected && rows.every(r => selected.has(getId(r)));
  const someSelected = selected && rows.some(r => selected.has(getId(r))) && !allSelected;

  const toggleAll = () => {
    if (!onSelectionChange || !selected) return;
    const n = new Set(selected);
    if (allSelected) { rows.forEach(r => n.delete(getId(r))); } else { rows.forEach(r => n.add(getId(r))); }
    onSelectionChange(n);
  };
  const toggleRow = (id: string) => {
    if (!onSelectionChange || !selected) return;
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    onSelectionChange(n);
  };

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="talkx-table">
        <thead className={stickyHeader ? 'sticky top-0 bg-card z-10' : ''}>
          <tr>
            {selectable && (
              <th style={{ width: 44 }} className="pl-3">
                <input type="checkbox" checked={!!allSelected} ref={el => { if (el) el.indeterminate = !!someSelected; }}
                  onChange={toggleAll} className="w-3.5 h-3.5 accent-primary cursor-pointer" aria-label="Selecionar tudo" />
              </th>
            )}
            {columns.map(col => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}
                className={cn(col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left')}
              >{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="h-32 text-center text-muted-foreground text-sm">{emptyState ?? 'Nenhum resultado.'}</td></tr>
          ) : rows.map((row, idx) => {
            const id = getId(row);
            const isSelected = selected?.has(id);
            return (
              <tr key={id} className={isSelected ? 'bg-primary/5' : ''}>
                {selectable && (
                  <td className="pl-3">
                    <input type="checkbox" checked={!!isSelected} onChange={() => toggleRow(id)}
                      className="w-3.5 h-3.5 accent-primary cursor-pointer" aria-label={`Selecionar ${id}`} />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key} className={cn(col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '')}>
                    {col.render(row, idx)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
