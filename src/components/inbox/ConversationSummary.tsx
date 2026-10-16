import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { log } from '@/lib/logger';
import { PeriodFilterSelector, usePeriodFilter } from './ai-tools/PeriodFilterSelector';
import { FileText, Loader2, CheckCircle2, Clock, AlertCircle, ThumbsUp, ThumbsDown, Minus, X, Sparkles, AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSummaryTts } from './summary/useSummaryTts';
import { SummaryResult } from './summary/SummaryResult';
import { buildPeriodKey, useAiRequestGeneration } from '@/lib/aiRequest/context';

interface Message { id: string; sender: 'agent' | 'contact'; content: string; created_at: string; }
interface SummaryData { summary: string; status: 'resolvido' | 'pendente' | 'aguardando_cliente' | 'aguardando_atendente'; keyPoints: string[]; nextSteps?: string[]; sentiment: 'positivo' | 'neutro' | 'negativo'; }

interface ConversationSummaryProps { messages: Message[]; contactName: string; contactId?: string; initialSummary?: Record<string, unknown> | null; onClose?: () => void; }

const statusConfig = {
  resolvido: { label: 'Resolvido', icon: CheckCircle2, className: 'text-success border-success/30 bg-success/10' },
  pendente: { label: 'Pendente', icon: Clock, className: 'text-warning border-warning/30 bg-warning/10' },
  aguardando_cliente: { label: 'Aguardando Cliente', icon: Clock, className: 'text-info border-info/30 bg-info/10' },
  aguardando_atendente: { label: 'Aguardando Atendente', icon: AlertCircle, className: 'text-warning border-warning/30 bg-warning/10' },
};
const sentimentConfig = {
  positivo: { icon: ThumbsUp, className: 'text-success' },
  neutro: { icon: Minus, className: 'text-muted-foreground' },
  negativo: { icon: ThumbsDown, className: 'text-destructive' },
};

export function ConversationSummary({ messages, contactName, contactId, initialSummary }: ConversationSummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>((initialSummary as unknown as SummaryData) ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(!!initialSummary);

  const tts = useSummaryTts(contactId);
  const { analysisPeriod, setAnalysisPeriod, customDateFrom, customDateTo, setCustomDateFrom, setCustomDateTo, clearCustomDates, filteredMessages } = usePeriodFilter(messages, '7d');
  const canGenerateSummary = filteredMessages.length >= 10;

  // IA-048 — identidade da requisição: contato + período ESCOLHIDO. As mensagens
  // vivas ficam de fora: uma mensagem que chega não pode descartar o resumo em voo.
  const {
    begin: beginRequest,
    isCurrent: isRequestCurrent,
    invalidate: invalidateRequests,
  } = useAiRequestGeneration({
    contactId: contactId ?? '',
    periodKey: buildPeriodKey(analysisPeriod, customDateFrom, customDateTo),
  });

  useEffect(() => {
    // Troca de contato: descarta resposta em voo e zera o resultado visível.
    invalidateRequests();
    setIsLoading(false);
    setSummary(null);
    setHasGenerated(false);
  }, [contactId, invalidateRequests]);

  useEffect(() => {
    // Troca de período: invalida a resposta em voo (mesmo antes de gerar) e zera
    // o resumo exibido, que pertence ao recorte antigo.
    invalidateRequests();
    setIsLoading(false);
    setSummary(null);
    setHasGenerated(false);
  }, [analysisPeriod, customDateFrom, customDateTo, invalidateRequests]);

  useEffect(() => { if (initialSummary) { setSummary(initialSummary as unknown as SummaryData); setHasGenerated(true); } }, [initialSummary]);

  const buildFullNarrationText = useCallback(() => {
    if (!summary) return '';
    const parts: string[] = [];
    if (summary.summary) parts.push(summary.summary);
    if (summary.keyPoints?.length) parts.push('Pontos-chave: ' + summary.keyPoints.join('. '));
    if (summary.nextSteps?.length) parts.push('Próximos passos: ' + summary.nextSteps.join('. '));
    return parts.join('. ');
  }, [summary]);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const generateSummary = async () => {
    if (!canGenerateSummary) { toast.error('O período selecionado precisa ter pelo menos 10 mensagens.'); return; }
    const request = beginRequest();
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-conversation-summary', {
        body: { messages: filteredMessages.map(m => ({ sender: m.sender, content: m.content, created_at: m.created_at })), contactName, contactId, requestId: request.requestId },
      });

      // IA-048 — a resposta só vale se contato/período ainda forem os do clique.
      // A checagem vem DEPOIS do await, que é onde a resposta chega.
      if (!isMountedRef.current || !isRequestCurrent(request)) return;

      if (error) {
        // O envelope de erro (IA-025) chega no corpo de `error.context` (Response);
        // lê-lo para mostrar `payload.error` ao usuário em vez de silêncio.
        const context = (error as { context?: Response } | null)?.context;
        let envelopeError: unknown;
        if (context && typeof context.clone === 'function') {
          try { envelopeError = ((await context.clone().json()) as { error?: unknown } | null)?.error; } catch { /* corpo sem JSON (timeout/proxy) */ }
        }
        toast.error(typeof envelopeError === 'string' && envelopeError ? envelopeError : 'Erro ao gerar resumo. Tente novamente.');
        log.error('Error generating summary:', error);
        return;
      }

      // A resposta é um envelope de execução: o resumo vem em `payload.data`.
      const payload = data as { status?: string; error?: unknown; data?: SummaryData } | null;
      if (payload?.status === 'error') {
        const message = typeof payload.error === 'string' && payload.error.trim() ? payload.error : 'Erro ao gerar resumo. Tente novamente.';
        toast.error(message);
        return;
      }
      const summaryData = payload?.data;
      if (!summaryData) {
        toast.error('A IA não devolveu um resumo válido.');
        return;
      }

      if (isMountedRef.current) { setSummary(summaryData); setHasGenerated(true); }
      toast.success('Resumo gerado com sucesso!');
    } catch (error) {
      if (!isMountedRef.current || !isRequestCurrent(request)) return;
      log.error('Error generating summary:', error); toast.error('Erro ao gerar resumo. Tente novamente.');
    }
    finally { if (isMountedRef.current && isRequestCurrent(request)) setIsLoading(false); }
  };

  const StatusIcon = summary ? statusConfig[summary.status]?.icon || Clock : Clock;
  const SentimentIcon = summary ? sentimentConfig[summary.sentiment]?.icon || Minus : Minus;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-3xs ${statusConfig[summary.status]?.className || ''}`}>
            <StatusIcon className="h-3 w-3 mr-1" />{statusConfig[summary.status]?.label || summary.status}
          </Badge>
          <span className={sentimentConfig[summary.sentiment]?.className || ''}><SentimentIcon className="h-4 w-4" /></span>
        </div>
      )}

      <PeriodFilterSelector period={analysisPeriod} onPeriodChange={setAnalysisPeriod} customFrom={customDateFrom} customTo={customDateTo}
        onCustomFromChange={setCustomDateFrom} onCustomToChange={setCustomDateTo} onClearCustom={clearCustomDates}
        filteredCount={filteredMessages.length} totalCount={messages.length} />

      <Button onClick={generateSummary} disabled={isLoading || !canGenerateSummary} className="w-full gap-2 text-xs" variant={hasGenerated ? 'ghost' : 'default'} size="sm">
        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : hasGenerated ? <FileText className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
        {!canGenerateSummary ? `Mín. 10 mensagens (${filteredMessages.length} no período)` : hasGenerated ? 'Regenerar resumo' : `Gerar resumo (${filteredMessages.length} msgs)`}
      </Button>

      {isLoading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3 animate-pulse">
          <div className="flex items-center gap-2 px-1"><Loader2 className="w-3.5 h-3.5 text-primary animate-spin" /><span className="text-2xs font-medium text-muted-foreground">Gerando resumo de {filteredMessages.length} mensagens...</span></div>
          <div className="h-16 rounded-xl bg-muted/40 border border-border/20" />
          <div className="space-y-1.5"><div className="h-3 bg-muted/30 rounded w-full" /><div className="h-3 bg-muted/30 rounded w-4/5" /><div className="h-3 bg-muted/30 rounded w-3/5" /></div>
        </motion.div>
      )}

      {tts.autoplayBlocked && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span className="flex-1">Áudio bloqueado pelo navegador</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-3xs gap-1" onClick={tts.handleRetryAutoplay}><RefreshCcw className="h-3 w-3" /> Tentar</Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={tts.handleDismissAutoplayWarning}><X className="h-3 w-3" /></Button>
        </motion.div>
      )}

      {hasGenerated && summary && (
        <SummaryResult summary={summary} isTtsPlaying={tts.isTtsPlaying} isTtsLoading={tts.isTtsLoading} lastTtsText={tts.lastTtsText}
          onPlayTts={tts.startTtsPlayback} buildFullNarrationText={buildFullNarrationText} />
      )}
    </div>
  );
}
