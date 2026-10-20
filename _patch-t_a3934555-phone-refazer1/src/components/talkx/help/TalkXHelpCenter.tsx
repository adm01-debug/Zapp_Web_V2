import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, HelpCircle, Rocket, Search } from 'lucide-react';

import { cn } from '@/lib/utils';

import { IconTile } from '../kit/primitives';
import { TalkXHelpArticle, TalkXHelpRow } from './TalkXHelpArticle';
import {
  HELP_ALL_TOPICS,
  HELP_EXAMPLE_QUERIES,
  HELP_GUIDES_SLUG,
  findHelpDoc,
  groupHelpTopics,
  helpArticles,
  helpGuides,
  helpNeighbours,
  loadTalkXHelpDocs,
  type TalkXHelpDoc,
} from './talkxHelpIndex';
import type { TalkXHelpRoute } from './talkxHelpRoute';
import { highlightHelpText, useTalkXHelpSearch } from './useTalkXHelpSearch';

export interface TalkXHelpCenterProps {
  route: TalkXHelpRoute;
  onRouteChange: (next: TalkXHelpRoute) => void;
  onClose: () => void;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightHelpText(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-primary/25 px-0.5 text-foreground">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

/** Carrega o índice (frontmatter + corpo) só quando a Ajuda é aberta. */
function useTalkXHelpDocs() {
  const [docs, setDocs] = useState<TalkXHelpDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadTalkXHelpDocs()
      .then((loaded) => {
        if (active) setDocs(loaded);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a Ajuda.');
      });
    return () => {
      active = false;
    };
  }, []);

  return { docs, error };
}

/**
 * X189 — tela da Ajuda do Talk X: índice com busca, grade de tópicos, guias
 * recomendados e o leitor de artigo, tudo com endereço próprio (`screen=help`).
 */
export function TalkXHelpCenter({ route, onRouteChange, onClose }: TalkXHelpCenterProps) {
  const { docs, error } = useTalkXHelpDocs();
  const list = useMemo(() => docs ?? [], [docs]);
  const search = useTalkXHelpSearch(list);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const topics = useMemo(() => groupHelpTopics(list), [list]);
  const guides = useMemo(() => helpGuides(list), [list]);
  const articles = useMemo(() => helpArticles(list), [list]);

  const activeArticle = useMemo(() => findHelpDoc(list, route.article), [list, route.article]);
  const neighbours = useMemo(
    () => (activeArticle ? helpNeighbours(list, activeArticle) : { previous: null, next: null }),
    [activeArticle, list],
  );

  const openArticle = useCallback(
    (doc: TalkXHelpDoc) => {
      onRouteChange({ topic: route.topic, article: doc.id });
    },
    [onRouteChange, route.topic],
  );

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  // T16-007: com a Ajuda aberta, ⌘K/Ctrl+K foca a busca da Ajuda em vez de
  // abrir a paleta global. O listener é de captura e para a propagação, então o
  // atalho global (que escuta na fase de borbulha) não chega a disparar; fora
  // da Ajuda este efeito não existe e o atalho segue intacto.
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) return;
      event.preventDefault();
      event.stopPropagation();
      if (route.article) {
        onRouteChange({ topic: route.topic });
        return;
      }
      focusSearch();
    };
    window.addEventListener('keydown', handleShortcut, true);
    return () => window.removeEventListener('keydown', handleShortcut, true);
  }, [focusSearch, onRouteChange, route.article, route.topic]);

  // O campo é o primeiro alvo da tela: ao voltar do artigo, o foco volta para ele.
  useEffect(() => {
    if (!route.article) focusSearch();
  }, [focusSearch, route.article]);

  const handleSearchKeys = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        search.moveActive(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        search.moveActive(-1);
        return;
      }
      if (event.key === 'Enter') {
        if (!search.active) return;
        event.preventDefault();
        openArticle(search.active.doc);
        return;
      }
      if (event.key === 'Escape' && search.query) {
        event.preventDefault();
        search.setQuery('');
      }
    },
    [openArticle, search],
  );

  const topicList = route.topic;
  const topicLabel = topicList === HELP_ALL_TOPICS
    ? 'Todos os artigos'
    : topicList === HELP_GUIDES_SLUG
      ? 'Todos os guias'
      : topics.find((topic) => topic.slug === topicList)?.label ?? 'Ajuda';
  const topicDocs = topicList === HELP_GUIDES_SLUG
    ? guides
    : topicList === HELP_ALL_TOPICS
      ? articles
      : articles.filter((doc) => doc.topicSlug === topicList);

  return (
    <div className="min-h-full w-full min-w-0 space-y-5 bg-background">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar ao módulo
        </button>
      </div>

      <header className="flex items-center gap-3.5">
        <IconTile icon={Rocket} color="blue" size={56} className="rounded-2xl" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-display text-foreground tracking-[-0.02em]">Ajuda do Talk X</h1>
          <p className="text-xs text-foreground-secondary">
            Aprenda a criar campanhas melhores com velocidade e segurança.
          </p>
        </div>
      </header>

      {error && (
        <p role="status" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {!docs && !error && (
        <p role="status" aria-busy="true" className="text-xs text-muted-foreground">
          Carregando a Ajuda…
        </p>
      )}

      {docs && activeArticle && (
        <TalkXHelpArticle
          doc={activeArticle}
          previous={neighbours.previous}
          next={neighbours.next}
          onBack={() => onRouteChange({ topic: route.topic })}
          onOpen={openArticle}
        />
      )}

      {docs && !activeArticle && (
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="talkx-help-search" className="sr-only">
              Buscar na Ajuda do Talk X
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                id="talkx-help-search"
                ref={searchRef}
                type="text"
                role="combobox"
                aria-expanded={search.isSearching}
                aria-controls="talkx-help-search-results"
                aria-autocomplete="list"
                autoComplete="off"
                value={search.query}
                onChange={(event) => search.setQuery(event.target.value)}
                onKeyDown={handleSearchKeys}
                placeholder="O que você precisa de ajuda hoje?"
                className="h-11 w-full rounded-lg border border-border/60 bg-input/40 pl-9 pr-40 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-muted-foreground">
                Pressione ⌘ K para buscar
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xs text-muted-foreground">Exemplos:</span>
              {HELP_EXAMPLE_QUERIES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    search.setQuery(example);
                    focusSearch();
                  }}
                  className="rounded-full border border-border/60 bg-input/40 px-2.5 py-1 text-2xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {search.isSearching && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Resultados</h2>
              {search.hasNoResults ? (
                <p role="status" className="rounded-lg border border-border/60 bg-input/40 px-3 py-2 text-xs text-muted-foreground">
                  Nenhum artigo encontrado para “{search.query}”. Tente outra palavra ou fale com o suporte.
                </p>
              ) : (
                <ul
                  id="talkx-help-search-results"
                  role="listbox"
                  aria-label="Resultados da busca da Ajuda"
                  className="space-y-2"
                >
                  {search.results.map((hit, index) => (
                    <li
                      key={hit.doc.id}
                      role="option"
                      aria-selected={index === search.activeIndex}
                      className="list-none"
                    >
                      <button
                        type="button"
                        onClick={() => openArticle(hit.doc)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                          index === search.activeIndex
                            ? 'border-primary/40 bg-primary/10'
                            : 'border-border/60 bg-input/40 hover:border-border hover:bg-muted/40',
                        )}
                      >
                        <HelpCircle className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            <Highlighted text={hit.doc.title} query={search.query} />
                          </span>
                          <span className="mt-0.5 block text-2xs text-muted-foreground">
                            <Highlighted text={hit.excerpt} query={search.query} />
                          </span>
                        </span>
                        <span className="shrink-0 text-2xs text-muted-foreground">{hit.doc.minutes} min</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!search.isSearching && topicList && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{topicLabel}</h2>
                <button
                  type="button"
                  onClick={() => onRouteChange({})}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Voltar
                </button>
              </div>
              {topicDocs.length === 0 ? (
                <p role="status" className="text-xs text-muted-foreground">
                  Nada aqui ainda.
                </p>
              ) : (
                <ul className="space-y-2">
                  {topicDocs.map((doc) => (
                    <li key={doc.id} className="list-none">
                      <TalkXHelpRow doc={doc} onOpen={openArticle} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!search.isSearching && !topicList && (
            <>
              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Tópicos</h2>
                    <p className="text-2xs text-muted-foreground">Encontre rapidamente o que você precisa.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRouteChange({ topic: HELP_ALL_TOPICS })}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver todos os artigos →
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {topics.map((topic) => (
                    <button
                      key={topic.slug}
                      type="button"
                      onClick={() => onRouteChange({ topic: topic.slug })}
                      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-input/40 px-3 py-3 text-left transition-colors hover:border-border hover:bg-muted/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12">
                        <BookOpen className="h-4 w-4 text-primary" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{topic.label}</span>
                        <span className="text-2xs text-muted-foreground">
                          {topic.articles.length} {topic.articles.length === 1 ? 'artigo' : 'artigos'}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Guias recomendados</h2>
                    <p className="text-2xs text-muted-foreground">Passo a passo para você evoluir com o Talk X.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRouteChange({ topic: HELP_GUIDES_SLUG })}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Ver todos os guias →
                  </button>
                </div>
                <ul className="space-y-2">
                  {guides.slice(0, 3).map((guide, index) => (
                    <li key={guide.id} className="list-none">
                      <TalkXHelpRow doc={guide} index={index + 1} onOpen={openArticle} />
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
