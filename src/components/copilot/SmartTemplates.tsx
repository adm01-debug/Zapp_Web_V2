/**
 * CV-068, CV-069 — SmartTemplates
 *
 * CV-068: lista de respostas rápidas ranqueadas pelo RADAR conforme o momento.
 * CV-069: cada template já vem com variáveis preenchidas; as pendentes ficam
 *   em destaque ([[variável]]) para o vendedor completar.
 *
 * Não substitui a lista existente de respostas rápidas — é uma camada de
 * ranking e preenchimento exibida no painel RADAR.
 */
import { Sparkles, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import type { RankedTemplate } from '@/hooks/copilot/useSmartTemplates';

/** Destaca pendências [[chave]] em laranja. */
function HighlightedContent({ content }: { content: string }) {
  const parts = content.split(/(\[\[[^\]]+\]\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const isPending = part.startsWith('[[') && part.endsWith(']]');
        return isPending ? (
          <mark
            key={i}
            className="bg-warning/20 text-warning-foreground rounded px-0.5 not-italic font-medium"
            title="Preencha este campo antes de enviar"
          >
            {part.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

export interface SmartTemplatesProps {
  /** Templates ranqueados e preenchidos pelo hook useSmartTemplates. */
  rankedTemplates: RankedTemplate[];
  /** Chamado quando o vendedor escolhe um template. Recebe o conteúdo preenchido. */
  onSelect: (filledContent: string) => void;
  /** Texto do input atual (para highlight de correspondências). */
  inputValue?: string;
  className?: string;
  isLoading?: boolean;
}

export function SmartTemplates({
  rankedTemplates,
  onSelect,
  className,
  isLoading = false,
}: SmartTemplatesProps) {
  if (isLoading) {
    return (
      <div className={cn('space-y-2 p-2', className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (rankedTemplates.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 p-3 text-sm text-muted-foreground', className)}>
        <Sparkles className="w-4 h-4 shrink-0" />
        <span>Nenhum template disponível para este momento.</span>
      </div>
    );
  }

  return (
    <ScrollArea className={cn('max-h-64', className)}>
      <AnimatePresence mode="popLayout">
        <div className="space-y-1.5 p-2">
          {rankedTemplates.map(({ template, filledContent, pendingVars, score }) => (
            <motion.button
              key={template.id}
              type="button"
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              onClick={() => onSelect(filledContent)}
              className={cn(
                'w-full text-left rounded-xl border border-border/50 bg-card',
                'px-3 py-2 hover:border-primary/30 hover:bg-primary/5',
                'transition-all group focus:outline-none focus:ring-2 focus:ring-ring',
              )}
              aria-label={`Usar template: ${template.title}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-foreground line-clamp-1 flex-1">
                  {template.title}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {pendingVars.length > 0 && (
                    <span
                      className="flex items-center gap-0.5 text-3xs text-warning"
                      title={`Preencher: ${pendingVars.join(', ')}`}
                    >
                      <AlertCircle className="w-3 h-3" />
                      {pendingVars.length}
                    </span>
                  )}
                  {score > 0.5 && (
                    <Badge variant="outline" className="h-4 px-1 text-3xs border-primary/40 text-primary">
                      IA
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                <HighlightedContent content={filledContent} />
              </p>
            </motion.button>
          ))}
        </div>
      </AnimatePresence>
    </ScrollArea>
  );
}
