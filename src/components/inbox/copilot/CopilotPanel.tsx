import { Brain, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopilotSession } from './useCopilotSession';
import { BrindeMeter } from './BrindeMeter';
import { StageIndicator } from './StageIndicator';
import { InsightCard } from './InsightCard';
import { MissingQuestions } from './MissingQuestions';
import { DecisionMakerBadge } from './DecisionMakerBadge';
import type { Conversation, Message } from '@/types/chat';

interface CopilotPanelProps {
  conversation: Conversation;
  messages: Message[];
  className?: string;
}

export function CopilotPanel({ conversation, messages, className }: CopilotPanelProps) {
  const { session, insights, isLoading, isTicking, tick } = useCopilotSession(conversation.id);

  const lastClientMessage = messages.findLast((m) => m.sender === 'contact')?.content;

  const handleTick = () => {
    tick({ contactId: conversation.contact.id, lastClientMessage });
  };

  const evidence = session
    ? {
        B: session.brinde_budget,
        R: session.brinde_responsible,
        I: session.brinde_intention,
        N: session.brinde_quantity != null ? String(session.brinde_quantity) : null,
        D: session.brinde_deadline,
        E: session.brinde_delivery,
      }
    : {};

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Copiloto B·R·I·N·D·E</span>
        </div>
        <button
          type="button"
          onClick={handleTick}
          disabled={isTicking}
          className={cn(
            'inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-colors',
            'bg-primary/10 text-primary hover:bg-primary/20',
            isTicking && 'opacity-60 cursor-not-allowed',
          )}
        >
          <RefreshCw className={cn('w-3 h-3', isTicking && 'animate-spin')} />
          {isTicking ? 'Analisando…' : 'Analisar'}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-10 rounded-lg bg-muted/30 animate-pulse" />
          <div className="h-6 rounded-lg bg-muted/30 animate-pulse w-3/4" />
        </div>
      ) : (
        <>
          <BrindeMeter
            meter={session?.brinde_meter ?? 0}
            evidence={evidence as Record<string, string | null>}
          />

          {session && (
            <StageIndicator stage={session.sale_stage} temperature={session.temperature} />
          )}

          {(session?.decision_role || (session?.stakeholders?.length ?? 0) > 0) && (
            <DecisionMakerBadge
              role={session?.decision_role ?? null}
              stakeholders={session?.stakeholders ?? []}
            />
          )}

          {insights.length > 0 && (
            <div className="space-y-1.5">
              <InsightCard insight={insights[0]} isLatest />
              {insights.slice(1, 3).map((ins) => (
                <InsightCard key={ins.id} insight={ins} />
              ))}
            </div>
          )}

          {session && <MissingQuestions session={session} />}

          {!session && insights.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Clique em <strong>Analisar</strong> para iniciar o copiloto nesta conversa.
            </p>
          )}
        </>
      )}
    </div>
  );
}
