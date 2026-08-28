import { useState, useEffect, useCallback } from 'react';
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

  useEffect(() => { setSummary(null); setHasGenerated(false); }, [contactId]);
  useEffect(() => { if (hasGenerated) { setSummary(null); setHasGenerated(false); } }, [analysisPeriod, customDateFrom, customDateTo]);
  useEffect(() => { if (initialSummary) { setSummary(initialSummary as unknown as SummaryData); setHasGenerated(true); } }, [initialSummary]);

  const buildFullNarrationText = useCallback(() => {
    if (!summary) return '';
    const parts: string[] = [];
    if (summary.summary) parts.push(summary.summary);
    if (summary.keyPoints?.length) parts.push('Pontos-chave: ' + summary.keyPoints.join('. '));
    if (summary.nextSteps?.length) parts.push('Próximos passos: ' + summary.nextSteps.join('. '));
    return parts.join('. ');
  }, [summary]);

  const generateSummary = async () => {
    if (!canGenerateSummary) { toast.error('O período selecionado precisa ter pelo menos 10 mensagens.'); return; }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-conversation-summary', {
        body: { messages: filteredMessages.map(m => ({ sender: m.sender, content: m.content, created_at: m.created_at })), contactName, contactId },
      });
      if (error) throw error;
      setSummary(data); setHasGenerated(true); toast.success('Resumo gerado com sucesso!');
    } catch (error) { log.error('Error generating summary:', error); toast.error('Erro ao gerar resumo. Tente novamente.'); }
    finally { setIsLoading(false); }
  };

  const StatusIcon = summary ? statusConfig[summary.status]?.icon || Clock : Clock;
  const SentimentIcon = summary ? sentimentConfig[summary.sentiment]?.icon || Minus : Minus;

  return (
    <div className="space-y-4">
      {summary && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] ${statusConfig[summary.status]?.className || ''}`}>
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
          <div className="flex items-center gap-2 px-1"><Loader2 className="w-3.5 h-3.5 text-primary animate-spin" /><span className="text-[11px] font-medium text-muted-foreground">Gerando resumo de {filteredMessages.length} mensagens...</span></div>
          <div className="h-16 rounded-xl bg-muted/40 border border-border/20" />
          <div className="space-y-1.5"><div className="h-3 bg-muted/30 rounded w-full" /><div className="h-3 bg-muted/30 rounded w-4/5" /><div className="h-3 bg-muted/30 rounded w-3/5" /></div>
        </motion.div>
      )}

      {tts.autoplayBlocked && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/30 text-warning text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /><span className="flex-1">Áudio bloqueado pelo navegador</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={tts.handleRetryAutoplay}><RefreshCcw className="h-3 w-3" /> Tentar</Button>
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
