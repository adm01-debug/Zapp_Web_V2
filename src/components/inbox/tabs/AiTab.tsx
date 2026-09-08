import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Sparkles, MessageSquare, FileText, ShieldQuestion, Zap, Package, Smile, Meh, Frown, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/formatters';
import { useLatestAnalysis } from '@/hooks/chat/useLatestAnalysis';
import { useNextBestAction } from '@/hooks/chat/useNextBestAction';
import { useRecommendedProducts } from '@/hooks/chat/useRecommendedProducts';
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

  const interesses = useMemo(() => conversation.contact.tags ?? [], [conversation.contact.tags]);
  const { data: products = [], isLoading: productsLoading } = useRecommendedProducts(contactId, interesses);

  const summaryMessages = useMemo(
    () => messages
      .filter((m): m is Message & { sender: 'agent' | 'contact' } => m.sender === 'agent' || m.sender === 'contact')
      .map((m) => ({ id: m.id, sender: m.sender, content: m.content, created_at: m.created_at ?? m.timestamp.toISOString() })),
    [messages]
  );
  const lastContactMessages = useMemo(
    () => messages.filter((m) => m.sender === 'contact').slice(-5).map((m) => m.content),
    [messages]
  );
  const allMessagesForObjections = useMemo(
    () => messages.map((m) => ({ id: m.id, content: m.content, sender: m.sender, timestamp: m.timestamp.toISOString(), created_at: m.created_at })),
    [messages]
  );

  const sentimentKey = conversation.contact.ai_sentiment ?? undefined;
  const sentimentCfg = sentimentKey ? SENTIMENT_CONFIG[sentimentKey] : undefined;

  const analysisStatusLabel = latestAnalysis
    ? `Análise atualizada às ${format(new Date(latestAnalysis.created_at), 'HH:mm')}`
    : 'Sem análise ainda';

  return (
    <div className="flex flex-col gap-4" data-testid="ai-tab">
      <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">Assistente IA</p>
          <p className="text-[13px] text-muted-foreground truncate">Seu copiloto para conversas mais produtivas</p>
        </div>
        <span className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          {analysisStatusLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <SectionCard icon={MessageSquare} title="Sugestão de resposta">
          <p className="text-xs text-muted-foreground -mt-1">Gere uma sugestão de resposta com base nas últimas mensagens.</p>
          <AISuggestions messages={messages} contactName={contactName} contactId={contactId} onSelectSuggestion={onUseSuggestion} />
        </SectionCard>

        <SectionCard icon={FileText} title="Resumo da conversa">
          <ConversationSummary messages={summaryMessages} contactName={contactName} contactId={contactId} />
        </SectionCard>

        <SectionCard icon={ShieldQuestion} title="Objeções detectadas">
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
          action={nextActions.length > 1 ? { label: showAllActions ? 'Ver menos' : 'Ver todas', onClick: () => setShowAllActions((v) => !v) } : undefined}
        >
          {nextActionsLoading ? (
            <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
          ) : nextActions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem ações sugeridas</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 border border-primary/30 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{nextActions[0].label}</p>
                  <p className="text-xs text-muted-foreground truncate">{nextActions[0].description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-primary shrink-0" />
              </div>
              {showAllActions && nextActions.length > 1 && (
                <ul className="space-y-1.5">
                  {nextActions.slice(1).map((a) => (
                    <li key={a.type} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                      {a.label}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </SectionCard>

        <SectionCard icon={Package} title="Produtos recomendados">
          {productsLoading ? (
            <div className="h-16 rounded-lg bg-muted/30 animate-pulse" />
          ) : products.length === 0 ? (
            <EmptyState icon={Package} title="Nenhum produto cadastrado" description="Produtos ativos do catálogo aparecerão aqui." size="sm" />
          ) : (
            <ul className="space-y-2">
              {products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-2.5">
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

        <SectionCard icon={sentimentCfg?.icon ?? Meh} title="Risco / sentimento">
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
