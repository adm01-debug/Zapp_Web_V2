import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { log } from '@/lib/logger';
import { PeriodFilterSelector, usePeriodFilter, getPeriodDays } from './ai-tools/PeriodFilterSelector';
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  VolumeX,
  RefreshCcw,
  X,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useConversationAnalyses } from '@/hooks/chat/useConversationAnalyses';
import { useSentimentAlerts } from '@/hooks/inbox/useSentimentAlerts';
import { withRetry } from '@/lib/retry';
import { VisionIcon } from './ai-tools/VisionIcon';
import { useAnalysisTts } from './ai-tools/useAnalysisTts';
import { AnalysisTabs } from './ai-tools/AnalysisTabs';
import { type AnalysisData, type AnalysisMessage, sentimentConfig } from './ai-tools/analysisConfigs';

interface AIConversationAssistantProps {
  messages: AnalysisMessage[];
  contactId: string;
  contactName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AIConversationAssistant({ messages, contactId, contactName, isOpen }: AIConversationAssistantProps) {
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('resumo');

  const {
    analysisPeriod,
    setAnalysisPeriod,
    customDateFrom,
    customDateTo,
    setCustomDateFrom,
    setCustomDateTo,
    clearCustomDates,
    filteredMessages,
  } = usePeriodFilter(messages, '7d');

  const { analyses, refetch, getSentimentTrend, loading: historyLoading } = useConversationAnalyses(contactId);
  const { checkAndTriggerAlert } = useSentimentAlerts();
  const {
    isTtsPlaying,
    isTtsLoading,
    autoplayBlocked,
    stopTts,
    startTtsPlayback,
    handleRetryAutoplay,
    handleDismissAutoplayWarning,
  } = useAnalysisTts();

  const canAnalyze = filteredMessages.length >= 5;

  useEffect(() => {
    setAnalysis(null);
    setActiveTab('resumo');
    stopTts();
  }, [analysisPeriod, customDateFrom, customDateTo, contactId, stopTts]);

  const handlePlaySummary = useCallback(() => {
    if (!analysis?.summary) return;
    startTtsPlayback(analysis.summary);
  }, [analysis?.summary, startTtsPlayback]);

  const analyzeConversation = useCallback(async () => {
    if (!canAnalyze) {
      toast.error('Mínimo de 5 mensagens necessárias para análise.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await withRetry(
        async () => {
          const { data, error } = await supabase.functions.invoke('ai-conversation-analysis', {
            body: {
              messages: filteredMessages.map((message) => ({
                id: message.id,
                sender: message.sender,
                content: message.content,
                type: message.type || 'text',
                created_at: message.created_at,
              })),
              contactName,
              contactId,
              periodDays: getPeriodDays(analysisPeriod),
            },
          });

          if (error) throw error;
          return data as AnalysisData;
        },
        {
          maxRetries: 2,
          shouldRetry: (error) => {
            if (error instanceof Error) {
              const message = error.message.toLowerCase();
              return message.includes('fetch') || message.includes('network') || message.includes('timeout');
            }
            return false;
          },
        }
      );

      setAnalysis(result);
      setActiveTab('resumo');
      await refetch();

      const sentimentScore = result.sentimentScore || 50;
      if (result.analysisId) {
        const previousAnalysis = analyses[0];
        await checkAndTriggerAlert({
          contactId,
          contactName,
          sentimentScore,
          previousScore: previousAnalysis?.sentiment_score,
          analysisId: result.analysisId,
        });
      }

      toast.success('Análise completa!');
    } catch (error) {
      log.error('Error analyzing conversation:', error);
      toast.error('Erro ao analisar conversa. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  }, [analysisPeriod, analyses, canAnalyze, checkAndTriggerAlert, contactId, contactName, filteredMessages, refetch]);

  const sentimentTrend = getSentimentTrend();
  const currentSentiment = analysis?.sentiment || 'neutro';
  const SentimentIcon = sentimentConfig[currentSentiment]?.icon || Minus;
  const sentimentScore = analysis?.sentimentScore ?? 50;

  if (!isOpen) return null;

  return (
    <div className="space-y-4">
      <PeriodFilterSelector
        period={analysisPeriod}
        onPeriodChange={setAnalysisPeriod}
        customFrom={customDateFrom}
        customTo={customDateTo}
        onCustomFromChange={setCustomDateFrom}
        onCustomToChange={setCustomDateTo}
        onClearCustom={clearCustomDates}
        filteredCount={filteredMessages.length}
        totalCount={messages.length}
      />

      <div className="flex flex-col items-center gap-1.5">
        <Button
          size="sm"
          onClick={analyzeConversation}
          disabled={isLoading || !canAnalyze}
          className="gap-2 rounded-xl bg-primary px-6 text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isLoading ? 'Analisando...' : `Analisar (${filteredMessages.length} msgs)`}
        </Button>
        {canAnalyze && !isLoading && !analysis && (
          <p className="text-[9px] text-muted-foreground">Resumo · Sentimento · Pontos-chave · Histórico</p>
        )}
      </div>

      {autoplayBlocked && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3"
        >
          <VolumeX className="h-4 w-4 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-xs font-medium text-warning">Áudio bloqueado pelo navegador</p>
            <p className="text-[10px] text-warning/70">Clique abaixo para tentar novamente</p>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 rounded-lg border-warning/30 px-2 text-[10px] text-warning hover:bg-warning/20"
              onClick={handleRetryAutoplay}
            >
              <RefreshCcw className="h-3 w-3" />
              Tentar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 rounded-lg px-1.5 text-[10px] text-muted-foreground" onClick={handleDismissAutoplayWarning}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </motion.div>
      )}

      {!canAnalyze && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning/10 p-3"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
          <p className="text-xs text-warning">Mínimo de 5 mensagens necessárias ({filteredMessages.length}/5)</p>
        </motion.div>
      )}

      {isLoading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <span className="text-xs font-medium text-muted-foreground">Analisando {filteredMessages.length} mensagens...</span>
          </div>
          <div className="space-y-3 animate-pulse">
            <div className="h-24 rounded-xl bg-muted/40 border border-border/20" />
            <div className="flex gap-2">
              <div className="h-6 w-24 rounded-full bg-muted/40" />
              <div className="h-6 w-20 rounded-full bg-muted/40" />
              <div className="h-6 w-16 rounded-full bg-muted/40" />
            </div>
            <div className="h-20 rounded-xl bg-muted/40 border border-border/20" />
          </div>
        </div>
      )}

      {sentimentTrend && !isLoading && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-medium ${
            sentimentTrend === 'improving'
              ? 'border-success/20 bg-success/10 text-success'
              : sentimentTrend === 'declining'
                ? 'border-destructive/20 bg-destructive/10 text-destructive'
                : 'border-border bg-muted/50 text-muted-foreground'
          }`}
        >
          {sentimentTrend === 'improving' && <TrendingUp className="h-4 w-4" />}
          {sentimentTrend === 'declining' && <TrendingDown className="h-4 w-4" />}
          {sentimentTrend === 'stable' && <ArrowRight className="h-4 w-4" />}
          <span>
            Tendência: {sentimentTrend === 'improving' ? 'Melhorando ↑' : sentimentTrend === 'declining' ? 'Piorando ↓' : 'Estável →'}
          </span>
        </motion.div>
      )}

      {analysis && !isLoading && (
        <AnalysisTabs
          analysis={analysis}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          sentimentScore={sentimentScore}
          currentSentiment={currentSentiment}
          analyses={analyses}
          historyLoading={historyLoading}
          isTtsPlaying={isTtsPlaying}
          isTtsLoading={isTtsLoading}
          onPlaySummary={handlePlaySummary}
          onPlayText={startTtsPlayback}
          onLoadHistory={setAnalysis}
        />
      )}

      {!analysis && !isLoading && canAnalyze && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <VisionIcon className="h-8 w-8 text-primary/60" />
          </div>
          <p className="mb-1 text-sm font-medium text-foreground">Analise esta conversa</p>
          <p className="text-xs leading-relaxed text-muted-foreground">Resumo, sentimento, pontos-chave, desempenho e oportunidades</p>
        </motion.div>
      )}

      {analysis && !isLoading && (
        <div className="border-t border-border pt-3 mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={analyzeConversation}
            disabled={isLoading}
            className="w-full gap-2 rounded-xl text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Reanalisar conversa
          </Button>
        </div>
      )}
    </div>
  );
}
