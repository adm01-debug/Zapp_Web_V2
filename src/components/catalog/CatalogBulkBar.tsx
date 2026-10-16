/**
 * CatalogBulkBar — E47: barra de ações em massa.
 * Aparece (sticky no rodapé do grid) quando há produtos selecionados.
 * Comportamento de seleção gerenciado por quem renderiza: hoje
 * ExternalProductManagement (tela de catálogo) e ExternalProductCatalog
 * (dialog do chat, modo seleção).
 * CT-28 — além do envio, a barra exporta a seleção em CSV (CT-20),
 * favorita os selecionados e impõe o limite de `CATALOG_BULK_SEND_MAX` por envio.
 */
import React from 'react';
import { Send, X, CheckSquare, Square, Download, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * CT-28 — limite de produtos por envio em massa. Acima disso o envio é
 * bloqueado com aviso (o usuário envia em lotes); valor declarado no plano.
 */
export const CATALOG_BULK_SEND_MAX = 10;

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
  /** CT-28 — exporta a seleção em CSV (mesmos builders do CT-20). */
  onExport?: () => void;
  /** CT-28 — favorita os selecionados que ainda não são favoritos. */
  onFavorite?: () => void;
  /** CT-28 — limite de produtos por envio (default `CATALOG_BULK_SEND_MAX`). */
  maxSend?: number;
}

export function CatalogBulkBar({
  count,
  pageTotal,
  allPageSelected,
  onToggleSelectAll,
  onClear,
  onSend,
  onExport,
  onFavorite,
  maxSend = CATALOG_BULK_SEND_MAX,
}: CatalogBulkBarProps) {
  // CT-28 — "limite 10 por envio com mensagem clara": acima do limite o botão
  // de envio fica desabilitado e o motivo aparece na própria barra.
  const overLimit = count > maxSend;
  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50',
        'flex flex-wrap items-center justify-center gap-3 px-5 py-3 rounded-2xl shadow-2xl',
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

      {overLimit && (
        <span role="status" className="text-xs font-medium text-amber-600 dark:text-amber-500">
          Máximo de {maxSend} produtos por envio — envie em lotes.
        </span>
      )}

      {/* CT-28 — exportar a seleção (CSV do CT-20 com os ids escolhidos) */}
      {onExport && (
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onExport} disabled={count === 0}>
          <Download className="w-3.5 h-3.5" />
          Exportar seleção
        </Button>
      )}

      {/* CT-28 — favoritar N (só os que ainda não são favoritos) */}
      {onFavorite && (
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onFavorite} disabled={count === 0}>
          <Heart className="w-3.5 h-3.5" />
          Favoritar {count}
        </Button>
      )}

      {/* ações */}
      <Button size="sm" className="h-8 gap-1.5" onClick={onSend} disabled={count === 0 || overLimit}>
        <Send className="w-3.5 h-3.5" />
        Enviar {count > 1 ? `(${count})` : ''}
      </Button>

      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={onClear}>
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
