/**
 * CatalogBulkBar — E47: barra de ações em massa.
 * Aparece (sticky no rodapé do grid) quando há produtos selecionados.
 * Comportamento de seleção gerenciado em ExternalProductManagement.
 */
import React from 'react';
import { Send, X, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface CatalogBulkBarProps {
  /** número de produtos selecionados */
  count: number;
  /** total de produtos na página atual */
  pageTotal: number;
  /** true se todos os produtos da página estão selecionados */
  allPageSelected: boolean;
  onToggleSelectAll: () => void;
  onClear: () => void;
  onSend: () => void;
}

export function CatalogBulkBar({
  count,
  pageTotal,
  allPageSelected,
  onToggleSelectAll,
  onClear,
  onSend,
}: CatalogBulkBarProps) {
  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl',
        'bg-popover border border-border/60 backdrop-blur-md',
        'animate-in slide-in-from-bottom-4 duration-200'
      )}
    >
      {/* toggle selecionar tudo na página */}
      <button
        type="button"
        onClick={onToggleSelectAll}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {allPageSelected
          ? <CheckSquare className="w-4 h-4 text-primary" />
          : <Square className="w-4 h-4" />}
        <span className="hidden sm:inline">{allPageSelected ? 'Desselecionar página' : 'Selecionar página'}</span>
      </button>

      <div className="w-px h-5 bg-border/60" />

      {/* contador */}
      <span className="text-sm font-semibold tabular-nums">
        {count}
        <span className="text-muted-foreground font-normal ml-1">
          {count === 1 ? 'produto' : 'produtos'} selecionado{count === 1 ? '' : 's'}
        </span>
      </span>

      {/* ações */}
      <Button size="sm" className="h-8 gap-1.5" onClick={onSend} disabled={count === 0}>
        <Send className="w-3.5 h-3.5" />
        Enviar {count > 1 ? `(${count})` : ''}
      </Button>

      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onClear}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
