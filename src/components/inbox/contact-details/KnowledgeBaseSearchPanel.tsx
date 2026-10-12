/**
 * "Base de Conhecimento" nos detalhes do contato (paridade com a V3).
 *
 * Consulta os artigos PUBLICADOS pela RPC `search_knowledge_base` (o filtro
 * `is_published` está na migration 20260318134952), com espera de 300 ms e mínimo
 * de 2 letras — os dois já moram em `useKnowledgeBaseSearch`, que este painel
 * apenas veste. O trecho do artigo vai para o rascunho do compositor pela ponte
 * `composerInsert` (não envia nada).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type Variants } from 'framer-motion';
import { BookOpen, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { HighlightedText } from '@/components/inbox/chat/HighlightedText';
import { ShimmerSkeleton, StaggerItem, StaggerList } from '@/components/inbox/chat/motion';
import { useKnowledgeBaseSearch, type KBArticle } from '@/hooks/integrations/useKnowledgeBaseSearch';
import { zappPanelVariants, zappTransition } from '@/lib/motion';
import { SidebarSection } from './sidebar/SidebarSection';
import { SidebarEmpty } from './sidebar/SidebarEmpty';
import { KB_SECTION_VALUE, articleInsertText, articleSnippet } from './knowledgeBaseText';

export interface KnowledgeBaseSearchPanelProps {
  /**
   * Recebe o trecho a colocar no rascunho. Devolve `false` quando não há
   * compositor escutando — o painel avisa em vez de fingir que inseriu.
   */
  onInsertText?: (text: string) => boolean | void;
}

export function KnowledgeBaseSearchPanel({ onInsertText }: KnowledgeBaseSearchPanelProps) {
  const { query, handleSearch, clear, articles, isLoading } = useKnowledgeBaseSearch();
  const [lendo, setLendo] = useState<KBArticle | null>(null);
  const leituraRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion() ?? false;
  const termo = query.trim();

  // Foco no painel de leitura ao abrir: Esc fecha no próprio elemento (sem
  // listener global de teclado).
  useEffect(() => {
    if (lendo) leituraRef.current?.focus();
  }, [lendo]);

  const inserir = (article: KBArticle) => {
    const resultado = onInsertText?.(articleInsertText(article));
    if (resultado === false) {
      toast.warning('Não foi possível inserir o trecho no rascunho agora.');
      return;
    }
    toast.success('Trecho inserido no rascunho.');
    setLendo(null);
  };

  // Leitura entra deslizando (variante do sistema); com movimento reduzido a
  // variante troca para opacidade pura — nada se desloca.
  const painelVariants: Variants = useMemo(
    () =>
      reduceMotion
        ? {
            hidden: { opacity: 0 },
            visible: { opacity: 1, transition: zappTransition.fast },
            exit: { opacity: 0, transition: zappTransition.fast },
          }
        : zappPanelVariants,
    [reduceMotion],
  );

  return (
    <SidebarSection
      index={3}
      value={KB_SECTION_VALUE}
      tone="yellow"
      icon={<BookOpen />}
      title="Base de Conhecimento"
      subtitle="Consulte artigos publicados e use no rascunho"
    >
      <div data-testid="kb-painel" className="space-y-2">
        <AnimatePresence mode="wait" initial={false}>
          {lendo ? (
            <motion.div
              key="kb-leitura"
              ref={leituraRef}
              data-testid="kb-leitura"
              role="dialog"
              aria-label={`Leitura do artigo: ${lendo.title}`}
              tabIndex={-1}
              onKeyDown={(evento) => {
                if (evento.key === 'Escape') {
                  evento.stopPropagation();
                  setLendo(null);
                }
              }}
              variants={painelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-snug text-foreground">{lendo.title}</p>
                  {lendo.category ? (
                    <Badge variant="subtle" className="mt-1 text-[10px]">{lendo.category}</Badge>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setLendo(null)}
                  aria-label="Fechar leitura"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                {lendo.content}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-10 flex-1 text-xs"
                  onClick={() => inserir(lendo)}
                  aria-label={`Inserir no texto: ${lendo.title}`}
                >
                  Inserir no texto
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 px-3 text-xs"
                  onClick={() => setLendo(null)}
                >
                  Voltar
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="kb-busca"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={zappTransition.fast}
              className="space-y-2"
            >
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  value={query}
                  onChange={(evento) => handleSearch(evento.target.value)}
                  onKeyDown={(evento) => {
                    if (evento.key === 'Escape' && query.length > 0) {
                      evento.stopPropagation();
                      clear();
                    }
                  }}
                  placeholder="Buscar artigo…"
                  aria-label="Buscar na base de conhecimento"
                  aria-describedby="kb-busca-dica"
                  className="h-10 pl-9 pr-11"
                />
                {query.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={clear}
                    aria-label="Limpar busca"
                    className="absolute right-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {termo.length < 2 && (
                <p id="kb-busca-dica" data-testid="kb-dica" className="px-1 text-xs text-muted-foreground">
                  {termo.length === 0
                    ? 'Busque por título, conteúdo ou tag — só artigos publicados aparecem aqui.'
                    : 'Digite ao menos 2 letras para buscar.'}
                </p>
              )}

              {termo.length >= 2 && isLoading && (
                <div data-testid="kb-carregando" className="space-y-2" aria-live="polite">
                  <span className="sr-only">Buscando artigos…</span>
                  <ShimmerSkeleton className="h-16 w-full" />
                  <ShimmerSkeleton className="h-16 w-full" />
                </div>
              )}

              {termo.length >= 2 && !isLoading && articles.length === 0 && (
                <SidebarEmpty
                  cause="kb-sem-resultado"
                  message={`Nenhum artigo publicado para “${termo}”. Tente outra palavra.`}
                />
              )}

              {termo.length >= 2 && !isLoading && articles.length > 0 && (
                <StaggerList className="space-y-2">
                  {articles.map((article) => (
                    <StaggerItem key={article.id}>
                      <div
                        data-testid="kb-resultado"
                        className="rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-primary/40 focus-within:border-primary/40"
                      >
                        <p className="text-xs font-semibold leading-snug text-foreground">
                          <HighlightedText text={article.title} query={termo} />
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                          <HighlightedText text={articleSnippet(article)} query={termo} />
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-10 flex-1 justify-start px-2 text-xs"
                            onClick={() => setLendo(article)}
                            aria-label={`Ler o artigo: ${article.title}`}
                          >
                            <BookOpen className="mr-1.5 h-4 w-4" />
                            Ler
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="h-10 flex-1 px-2 text-xs"
                            onClick={() => inserir(article)}
                            aria-label={`Inserir no texto: ${article.title}`}
                          >
                            Inserir no texto
                          </Button>
                        </div>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerList>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SidebarSection>
  );
}
