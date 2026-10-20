import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, BookOpen, Loader2, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKnowledgeBaseSearch } from '@/hooks/integrations/useKnowledgeBaseSearch';
import { toast } from 'sonner';

interface KnowledgeBaseSearchPanelProps {
  onInsertText?: (text: string) => void;
  className?: string;
}

export function KnowledgeBaseSearchPanel({ onInsertText, className }: KnowledgeBaseSearchPanelProps) {
  const { query, handleSearch, clear, articles, isLoading, hasResults } = useKnowledgeBaseSearch();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado para a área de transferência');
  };

  return (
    <Card className={cn('border-border/30', className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" />
          Base de Conhecimento
        </CardTitle>
        <CardDescription className="text-xs">Pesquise artigos para ajudar no atendimento</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar na base de conhecimento..."
            className="pl-8 pr-8 h-8 text-xs"
          />
          {query && (
            <Button variant="ghost" size="icon" className="absolute right-0.5 top-0.5 w-7 h-7" onClick={clear}>
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span className="text-xs">Pesquisando...</span>
          </div>
        )}

        {query.length >= 2 && !isLoading && !hasResults && (
          <p className="text-xs text-muted-foreground text-center py-3">Nenhum artigo encontrado</p>
        )}

        {hasResults && (
          <ScrollArea className="max-h-[250px]">
            <div className="space-y-1.5">
              {articles.map((article) => (
                <div
                  key={article.id}
                  className={cn(
                    'p-2 rounded-lg border border-border/20 hover:border-primary/30 cursor-pointer transition-colors',
                    expandedId === article.id && 'border-primary/40 bg-primary/5'
                  )}
                  onClick={() => setExpandedId(expandedId === article.id ? null : article.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{article.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {article.category && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{article.category}</Badge>
                        )}
                        {article.tags?.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[9px] px-1 py-0">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="w-6 h-6"
                        onClick={(e) => { e.stopPropagation(); handleCopy(article.content); }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      {onInsertText && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 text-primary"
                          onClick={(e) => { e.stopPropagation(); onInsertText(article.content); }}
                        >
                          <BookOpen className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {expandedId === article.id && (
                    <div className="mt-2 pt-2 border-t border-border/20">
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">{article.content}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
