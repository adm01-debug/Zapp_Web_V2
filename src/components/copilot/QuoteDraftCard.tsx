/**
 * CV-086 — QuoteDraftCard
 *
 * Exibe o rascunho de proposta gerado pelo copilot.
 */
import { FileText, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { QuoteDraft } from '@/hooks/copilot/useQuoteDraft';

interface QuoteDraftCardProps {
  draft: QuoteDraft;
  onUseText?: (text: string) => void;
  className?: string;
}

export function QuoteDraftCard({ draft, onUseText, className }: QuoteDraftCardProps) {
  const [copied, setCopied] = useState(false);

  if (!draft.ready) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(draft.textSummary).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('rounded-lg border border-blue-500/30 bg-blue-50/50 dark:bg-blue-900/10 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
            Rascunho de proposta — R$ {draft.totalValue.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="text-muted-foreground hover:text-foreground p-0.5"
            title="Copiar texto"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="mt-2 space-y-0.5">
        {draft.items.map((item, i) => (
          <div key={i} className="flex justify-between text-xs text-muted-foreground">
            <span>{item.description} × {item.quantity}</span>
            <span>R$ {(item.quantity * item.unitPrice).toFixed(2)}</span>
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground border-t border-border/30 pt-1.5">
        <span>Entrega: {draft.deliveryDate} · Validade: {draft.validity}</span>
        <span className="font-medium text-foreground">R$ {draft.totalValue.toFixed(2)}</span>
      </div>

      {onUseText && (
        <button
          type="button"
          className="mt-1.5 text-xs text-primary hover:underline"
          onClick={() => onUseText(draft.textSummary)}
        >
          Inserir texto completo
        </button>
      )}
    </div>
  );
}
