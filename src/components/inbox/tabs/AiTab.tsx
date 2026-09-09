import { useMemo, useState } from 'react';
import { format, isValid } from 'date-fns';
import {
  Sparkles, MessageSquare, FileText, ShieldQuestion, Zap, Package, Smile, Meh, Frown, ListPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/formatters';
import { useLatestAnalysis } from '@/hooks/chat/useLatestAnalysis';
import { useNextBestAction } from '@/hooks/chat/useNextBestAction';
import { useRecommendedProducts } from '@/hooks/chat/useRecommendedProducts';
import { useConversationTasks } from '@/hooks/chat/useConversationTasks';
import { useContactLeadScore } from '@/hooks/crm/useContactCrm360';
import { SectionCard } from './SectionCard';
import { AISuggestions } from '../AISuggestions';
import { ConversationSummary } from '../ConversationSummary';
import { ObjectionDetector } from '../ObjectionDetector';
import { EmptyState } from '@/components/ui/empty-state';
import type { Conversation, Message } from '@/types/chat';

const SENTIMENT_CONFIG: Record<string, { label: string; icon: typeof Smile; className: string }> = {
  positive: { label: 'Positivo', icon: Smile, className: 'text-success bg-success/10' },
  neutral: { label: 'Neutro', icon: Meh, className: 'text-muted-foreground bg-muted/30' },
  negative: { label: 'Negativo', icon: Frown, className: 'text-warning bg-warning/10' },
};

interface AiTabProps {
  conversation: Conversation;
  messages: Message[];
  onUseSuggestion: (text: string) => void;
}

/** Aba IA (2.7) — banner de status + grid 2x3 de cards, cada um reaproveitando o componente/hook de IA já existente. */
export function AiTab({ conversation, messages, onUseSuggestion }: AiTabProps) {
  const contactId = conversation.contact.id;
  const contactName = conversation.contact.name;
  const [showAllActions, setShowAllActions] = useState(false);

  const { data: latestAnalysis } = useLatestAnalysis(contactId);
  const { actions: nextActions, loading: nextActionsLoading } = useNextBestAction(contactId, contactName);
  const { data: leadScoreData } = useContactLeadScore(contactId);
  const { createTask, isCreating } = useConversationTasks(contactId);

  const interesses = useMemo(() => conversation.contact.tags ?? [], [conversation.contact.tags]);
  const { data: products = [], isLoading: productsLoading } = useRecommendedProducts(contactId, interesses);

  const summaryMessages = useMemo(
    () => messages
      .filter((m): m is Message & { sender: 'agent' | 'contact' } => m.sender === 'agent' || m.sender === 'contact')
      .map((m) => ({
        id: m.id,
        sender: m.sender,
        content: m.content,
        created_at: m.created_at ?? (isValid(m.timestamp) ? m.timestamp.toISOString() : ''),
      })),
    [messages]
  );
  const lastContactMessages = useMemo(
    () => messages.filter((m) => m.sender === 'contact').slice(-5).map((m) => m.content),
    [messages]
  );
  const allMessagesForObjections = useMemo(
    () => messages.map((m) => ({
      id: m.id,
      content: m.content,
      sender: m.sender,
      timestamp: isValid(m.timestamp) ? m.timestamp.toISOString() : (m.created_at ?? ''),
      created_at: m.created_at,
    })),
    [messages]
  );

  const sentimentKey = conversation.contact.ai_sentiment ?? undefined;
  const sentimentCfg = sentimentKey ? SENTIMENT_CONFIG[sentimentKey] : undefined;

  const analysisDate = latestAnalysis?.created_at ? new Date(latestAnalysis.created_at) : null;
  const analysisStatusLabel = analysisDate && isValid(analysisDate)
    ? `Análise atualizada às ${format(analysisDate, 'HH:mm')}`
    : latestAnalysis ? 'Análise disponível' : 'Sem análise ainda';

  const createActionTask = (title: string, description: string) => {
    void createTask({ title, description }).catch(() => undefined);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="ai-tab">
      <div className="rounded-xl border border-primary/25 bg-primary/10 p-4 flex flex-wrap items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">Assistente IA</p>
          <p className="text-[13px] text-muted-foreground truncate">Seu copiloto para conversas mais produtivas</p>
        </div>
        <span className="text-xs text-muted-foreground sm:ml-auto inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {analysisStatusLabel}
        </span>
      </div>

      <div
        data-testid="ai-card-grid"
        className="grid gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 24rem), 1fr))' }}
      >
        <SectionCard icon={MessageSquare} title="Sugestão de resposta" className="border-primary/20">
          <p className="text-xs text-muted-foreground -mt-1">Gere uma sugestão de resposta com base nas últimas mensagens.</p>
          <AISuggestions messages={messages} contactName={contactName} contactId={contactId} onSelectSuggestion={onUseSuggestion} />
        </SectionCard>

        <SectionCard icon={FileText} title="Resumo da conversa" className="border-border/80">
          <ConversationSummary messages={summaryMessages} contactName={contactName} contactId={contactId} />
        </SectionCard>

        <SectionCard icon={ShieldQuestion} title="Objeções detectadas" className="border-warning/20">
          <ObjectionDetector
            contactId={contactId}
            contactName={contactName}
            lastMessages={lastContactMessages}
            allMessages={allMessagesForObjections}
            onSelectSuggestion={onUseSuggestion}
          />
        </SectionCard>

        <SectionCard
          icon={Zap}
          title="Próxima melhor ação"
          className="border-primary/20"
          action={nextActions.length > 1 ? { label: showAllActions ? 'Ver menos' : 'Ver todas', onClick: () => setShowAllActions((v) => !v) } : undefined}
        >
          {nextActionsLoading ? (
            <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
          ) : nextActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem ações sugeridas</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary/10 border border-primary/25 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{nextActions[0].label}</p>
                  <p className="text-xs text-muted-foreground truncate">{nextActions[0].description}</p>
                </div>
                <button
                  type="button"
                  disabled={isCreating}
                  onClick={() => createActionTask(nextActions[0].label, nextActions[0].description)}
                  className="min-h-8 shrink-0 rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ListPlus className="mr-1 inline-block h-3.5 w-3.5" aria-hidden="true" />
                  Criar tarefa
                </button>
              </div>
              {showAllActions && nextActions.length > 1 && (
                <ul className="space-y-1.5">
                  {nextActions.slice(1).map((a, index) => (
                    <li key={`${a.type}-${index}`} className="flex min-h-8 items-center gap-2 text-xs text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{a.label}</span>
                      <button
                        type="button"
                        disabled={isCreating}
                        onClick={() => createActionTask(a.label, a.description)}
                        className="shrink-0 font-semibold text-primary hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        Criar tarefa
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard icon={Package} title="Produtos recomendados" className="border-success/20">
          {productsLoading ? (
            <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
          ) : products.length === 0 ? (
            <EmptyState icon={Package} title="Nenhum produto cadastrado" description="Produtos ativos do catálogo aparecerão aqui." size="sm" />
          ) : (
            <ul className="space-y-2">
              {products.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
                  <span className="w-10 h-10 rounded-lg bg-muted/40 shrink-0 overflow-hidden flex items-center justify-center">
                    {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-muted-foreground" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.category && <p className="text-xs text-muted-foreground truncate">{p.category}</p>}
                  </div>
                  {p.price != null && <span className="text-sm font-semibold text-success shrink-0">{formatBRL(p.price)}</span>}
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary hover:underline shrink-0"
                    onClick={() => onUseSuggestion(`${p.name}${p.price != null ? ` — ${formatBRL(p.price)}` : ''}`)}
                  >
                    Adicionar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          icon={sentimentCfg?.icon ?? Meh}
          title="Risco / sentimento"
          className={sentimentKey === 'negative' ? 'border-warning/25' : sentimentKey === 'positive' ? 'border-success/20' : 'border-border/80'}
        >
          {sentimentCfg ? (
            <div className="flex items-center gap-3">
              <span className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', sentimentCfg.className)}>
                <sentimentCfg.icon className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{sentimentCfg.label}</p>
                {leadScoreData?.risk_score != null && (
                  <p className="text-xs text-muted-foreground">Risk score {leadScoreData.risk_score}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem análise recente</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
