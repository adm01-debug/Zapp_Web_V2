import { useState } from 'react';
import { Sparkles, Loader2, Send, AlertTriangle, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAssistantGateway } from '@/hooks/assistant/useAssistantGateway';
import { SOURCE_LABELS } from '@/lib/assistant/askGateway';
import { SectionCard } from './SectionCard';

interface AssistantAskCardProps {
  contactId: string;
  contactName: string;
}

/**
 * Fase 3 do assistente pessoal — PORTA ÚNICA na tela.
 *
 * O vendedor escreve o que quer saber ("como estou com o João?") e o assistente
 * responde cruzando perfil, agenda, conversa e negócio. Cada pedaço vem com a
 * origem; fonte que falhou aparece como aviso, não como silêncio.
 */
export function AssistantAskCard({ contactId, contactName }: AssistantAskCardProps) {
  const [query, setQuery] = useState('');
  const { ask, answer, error, isAsking, reset } = useAssistantGateway(contactId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || isAsking) return;
    ask(query);
  }

  function suggestion(text: string) {
    setQuery(text);
    reset();
    ask(text);
  }

  return (
    <SectionCard
      icon={Sparkles}
      title="Pergunte ao assistente"
      subtitle="Uma pergunta, todas as fontes"
      tone="purple"
    >
      <form onSubmit={submit} className="flex items-center gap-2" data-testid="assistant-ask-form">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Ex.: como estou com ${contactName}?`}
          aria-label="Pergunta para o assistente"
          data-testid="assistant-ask-input"
          disabled={isAsking}
        />
        <Button type="submit" size="icon" disabled={isAsking || !query.trim()} aria-label="Perguntar" data-testid="assistant-ask-submit">
          {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>

      {!answer && !error && !isAsking && (
        <div className="mt-3 flex flex-wrap gap-2" data-testid="assistant-ask-suggestions">
          {[`Como estou com ${contactName}?`, 'Resuma a conversa', 'O que eu respondo agora?'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => suggestion(s)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted/50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 flex items-start gap-2 text-sm text-destructive" data-testid="assistant-ask-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {answer && (
        <div className="mt-3 space-y-2" data-testid="assistant-ask-answer">
          <p className="text-sm whitespace-pre-line">{answer.answer}</p>

          {answer.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-testid="assistant-ask-sources">
              <Database className="h-3 w-3" />
              {answer.sources.map((s) => (
                <span
                  key={s.origin}
                  className="rounded border border-border px-1.5 py-0.5"
                  title={s.error ?? `${s.rows} registro(s)`}
                  data-testid={`assistant-source-${s.kind}`}
                >
                  {SOURCE_LABELS[s.kind] ?? s.kind}
                  {s.error ? ' ⚠' : s.rows > 0 ? ` · ${s.rows}` : ' · vazio'}
                </span>
              ))}
            </div>
          )}

          {answer.errors.length > 0 && (
            <p className="text-xs text-warning" data-testid="assistant-ask-partial">
              Parcial: {answer.errors.join('; ')}
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}