import React from 'react';
import { format } from 'date-fns';
import { BarChart3, Users, Star, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { type AnalysisData, sentimentConfig, churnConfig, performanceLabels } from './analysisConfigs';

interface SentimentTabProps {
  analysis: AnalysisData;
  sentimentScore: number;
  currentSentiment: string;
  analyses: Array<{
    id: string;
    sentiment: string;
    sentiment_score: number;
    created_at: string;
  }>;
}

export function SentimentTab({ analysis, sentimentScore, currentSentiment, analyses }: SentimentTabProps) {
  const SentimentIcon = sentimentConfig[currentSentiment]?.icon || BarChart3;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-xl border-border/50">
        <CardContent className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SentimentIcon className={`h-5 w-5 ${sentimentConfig[currentSentiment]?.color}`} />
              <span className="text-sm font-semibold">{sentimentConfig[currentSentiment]?.label}</span>
            </div>
            <span className={`text-3xl font-black tabular-nums ${sentimentConfig[currentSentiment]?.color}`}>{sentimentScore}%</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-3xs text-muted-foreground">
              <span>Negativo</span><span>Positivo</span>
            </div>
            <Progress value={sentimentScore} className="h-2.5 rounded-full" />
          </div>
          {analysis.customerSatisfaction !== undefined && (
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">CSAT Estimado</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={`h-3.5 w-3.5 ${star <= (analysis.customerSatisfaction || 0) ? 'fill-warning text-warning' : 'text-muted'}`} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {analysis.agentPerformance && (
        <Card className="rounded-xl border-border/50">
          <CardContent className="pt-4">
            <h4 className="mb-3 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Users className="h-3 w-3" />
              Desempenho do Atendente
            </h4>
            <div className="space-y-3">
              {(Object.entries(analysis.agentPerformance) as [string, number][]).map(([key, value]) => {
                const config = performanceLabels[key];
                if (!config) return null;
                const Icon = config.icon;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3 w-3" />{config.label}</span>
                      <span className="font-bold tabular-nums">{value}/10</span>
                    </div>
                    <Progress value={value * 10} className="h-1.5 rounded-full" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {analysis.churnRisk && (
        <div className={`flex items-center gap-3 rounded-xl border p-3 ${
          analysis.churnRisk === 'high' ? 'border-destructive/20 bg-destructive/10'
            : analysis.churnRisk === 'medium' ? 'border-warning/20 bg-warning/10'
              : 'border-success/20 bg-success/10'
        }`}>
          {React.createElement(churnConfig[analysis.churnRisk]?.icon || CheckCircle2, {
            className: `h-5 w-5 ${churnConfig[analysis.churnRisk]?.color}`,
          })}
          <div>
            <p className="text-xs font-semibold">Risco de Churn</p>
            <p className={`text-sm font-bold ${churnConfig[analysis.churnRisk]?.color}`}>
              {churnConfig[analysis.churnRisk]?.label || analysis.churnRisk}
            </p>
          </div>
        </div>
      )}

      {analyses.length > 1 && (
        <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
          <h4 className="mb-3 text-xs font-semibold text-muted-foreground">Evolução</h4>
          <div className="flex h-16 items-end justify-between gap-1">
            {analyses.slice(0, 10).reverse().map((item) => (
              <TooltipProvider key={item.id} delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="flex-1 cursor-pointer rounded-t-sm transition-all hover:opacity-80"
                      style={{
                        height: `${Math.max(item.sentiment_score, 5)}%`,
                        backgroundColor:
                          item.sentiment === 'positivo' ? 'rgb(34 197 94 / 0.6)'
                            : item.sentiment === 'negativo' || item.sentiment === 'critico' ? 'rgb(239 68 68 / 0.6)'
                              : 'rgb(156 163 175 / 0.4)',
                      }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <p>{format(new Date(item.created_at), 'dd/MM HH:mm')}: {item.sentiment_score}%</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-3xs text-muted-foreground">
            <span>Antiga</span><span>Recente</span>
          </div>
        </div>
      )}
    </div>
  );
}
