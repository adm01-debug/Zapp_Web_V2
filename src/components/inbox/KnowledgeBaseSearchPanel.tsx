/**
 * KnowledgeBaseSearchPanel — busca na base de conhecimento durante o atendimento.
 *
 * Restaurado (2026-11-12) do painel que saiu como órfão na #1886; o hook
 * `useKnowledgeBaseSearch` (RPC `search_knowledge_base`) tinha ficado na main
 * sem tela. Vive na aba IA, dentro de um `SectionCard`, e o artigo vai direto
 * para a caixa de resposta ("Usar na resposta"). O botão antigo de copiar para
 * a área de transferência não voltou: a regra do dono é não abrir caminho novo
 * de informação saindo do sistema.
 */
import { useId, useState } from 'react';
import { AlertCircle, ChevronDown, CornerDownLeft, Loader2, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useKnowledgeBaseSearch } from '@/hooks/integrations/useKnowledgeBaseSearch';
import { cn } from '@/lib/utils';

interface KnowledgeBaseSearchPanelProps {
  onInsertText: (text: string) => void;
  className?: string;
}

export function KnowledgeBaseSearchPanel({ onInsertText, className }: KnowledgeBaseSearchPanelProps) {
  const { query, handleSearch, clear, articles, isSearching, isDebouncing, isFetching, isError, hasResults } = useKnowledgeBaseSearch();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const baseId = useId();
  const searching = isSearching;
  // Enquanto o termo digitado não passou pelo debounce (ou a RPC está em voo),
  // o resultado na tela é de outro termo: mostra "Pesquisando..." e não o vazio.
  const pending = searching && (isDebouncing || isFetching);

  return (
    <div className={cn('space-y-2', className)} data-testid="kb-search">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar na base de conhecimento..."
          aria-label="Buscar na base de conhecimento"
          className="pl-8 pr-8 h-8 text-xs"
        />
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0.5 top-0.5 w-7 h-7"
            onClick={clear}
            aria-label="Limpar busca"
          >
            <X className="w-3 h-3" aria-hidden="true" />
          </Button>
        )}
      </div>

      {!searching && (
        <p className="text-xs text-muted-foreground">Digite ao menos 2 letras para pesquisar artigos.</p>
      )}

      {pending && (
        <div role="status" className="flex items-center justify-center py-3 text-muted-foreground" data-testid="kb-loading">
          <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden="true" />
          <span className="text-xs">Pesquisando...</span>
        </div>
      )}

      {searching && !pending && isError && (
        <p role="alert" data-testid="kb-error" className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          Não foi possível pesquisar a base de conhecimento.
        </p>
      )}

      {searching && !pending && !isError && !hasResults && (
        <p data-testid="kb-empty" className="text-xs text-muted-foreground text-center py-3">Nenhum artigo encontrado</p>
      )}

      {searching && !pending && !isError && hasResults && (
        <ul className="space-y-1.5 max-h-[300px] overflow-y-auto scrollbar-thin" aria-label="Artigos encontrados">
          {articles.map((article) => {
            const expanded = expandedId === article.id;
            const contentId = `${baseId}-${article.id}`;
            return (
              <li
                key={article.id}
                className={cn(
                  'p-2 rounded-lg border border-border/40 transition-colors',
                  expanded ? 'border-primary/40 bg-primary/5' : 'hover:border-primary/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    onClick={() => setExpandedId(expanded ? null : article.id)}
                  >
                    <span className="flex items-center gap-1 text-xs font-medium text-foreground">
                      <span className="truncate">{article.title}</span>
                      <ChevronDown className={cn('w-3 h-3 shrink-0 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
                    </span>
                    <span className="flex flex-wrap items-center gap-1 mt-0.5">
                      {article.category && (
                        <Badge variant="outline" className="text-3xs px-1 py-0">{article.category}</Badge>
                      )}
                      {/* Assunto do artigo (não é a função de tags de contato removida em 12/10). */}
                      {article.tags?.slice(0, 2).map((topic) => (
                        <Badge key={topic} variant="secondary" className="text-3xs px-1 py-0">{topic}</Badge>
                      ))}
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-3xs text-primary shrink-0"
                    onClick={() => onInsertText(article.content)}
                    aria-label={`Usar "${article.title}" na resposta`}
                  >
                    <CornerDownLeft className="w-3 h-3 mr-1" aria-hidden="true" />
                    Usar
                  </Button>
                </div>
                {expanded && (
                  <p id={contentId} className="mt-2 pt-2 border-t border-border/20 text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                    {article.content}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
