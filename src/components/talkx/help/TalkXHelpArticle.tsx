import { ArrowLeft, ArrowRight, BookOpen, ChevronRight, Clock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { TalkXHelpDoc, TalkXHelpLevel } from './talkxHelpIndex';
import { HelpMarkdown } from './talkxHelpMarkdown';

/** Selo de nível do guia: Iniciante verde, Intermediário azul, Avançado violeta. */
const LEVEL_TONE: Record<TalkXHelpLevel, string> = {
  Iniciante: 'border-success/30 bg-success/12 text-success',
  'Intermediário': 'border-info/30 bg-info/12 text-info',
  Avançado: 'border-violet-500/30 bg-violet-500/12 text-violet-400',
};

export interface TalkXHelpArticleProps {
  doc: TalkXHelpDoc;
  previous: TalkXHelpDoc | null;
  next: TalkXHelpDoc | null;
  onBack: () => void;
  onOpen: (doc: TalkXHelpDoc) => void;
}

/** Leitor do artigo/guia: título, metadados, corpo em markdown e navegação. */
export function TalkXHelpArticle({ doc, previous, next, onBack, onOpen }: TalkXHelpArticleProps) {
  return (
    <article className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Voltar à Ajuda
      </button>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold font-display text-foreground tracking-[-0.02em]">{doc.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            {doc.topic}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {doc.minutes} min de leitura
          </span>
          {doc.level && (
            <Badge variant="outline" className={cn('font-normal', LEVEL_TONE[doc.level])}>
              {doc.level}
            </Badge>
          )}
        </div>
      </header>

      <div className="space-y-3 border-t border-border/60 pt-4">
        <HelpMarkdown source={doc.body} />
      </div>

      {(previous || next) && (
        <nav
          aria-label="Outros artigos da Ajuda"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4"
        >
          {previous ? (
            <button
              type="button"
              onClick={() => onOpen(previous)}
              className="inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{previous.title}</span>
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button
              type="button"
              onClick={() => onOpen(next)}
              className="ml-auto inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-foreground-secondary hover:text-foreground transition-colors"
            >
              <span className="truncate">{next.title}</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </article>
  );
}

/** Item de lista (artigo de um tópico ou guia recomendado). */
export function TalkXHelpRow({
  doc,
  index,
  onOpen,
}: {
  doc: TalkXHelpDoc;
  index?: number;
  onOpen: (doc: TalkXHelpDoc) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(doc)}
      className="group flex w-full items-center gap-3 rounded-lg border border-border/60 bg-input/40 px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/40"
    >
      {typeof index === 'number' && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/12 text-2xs font-semibold text-primary">
          {index}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{doc.title}</span>
        {doc.resume && (
          <span className="mt-0.5 block truncate text-2xs text-muted-foreground">{doc.resume}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {doc.minutes} min
        </span>
        {doc.level && (
          <Badge variant="outline" className={cn('font-normal', LEVEL_TONE[doc.level])}>
            {doc.level}
          </Badge>
        )}
      </span>
      <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
