import React from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Users, ShieldAlert, Star, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { VisionIcon } from './VisionIcon';
import { type AnalysisData, statusConfig, urgencyConfig, departmentConfig, churnConfig } from './analysisConfigs';

interface SummaryTabProps {
  analysis: AnalysisData;
  ttsButtonClass: string;
  isTtsLoading: boolean;
  isTtsPlaying: boolean;
  onPlaySummary: () => void;
}

export function SummaryTab({ analysis, ttsButtonClass, isTtsLoading, isTtsPlaying, onPlaySummary }: SummaryTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {analysis.department && departmentConfig[analysis.department] && (
          <Badge variant="outline" className={`${departmentConfig[analysis.department].color} text-3xs font-semibold`}>
            <span className="mr-1">{departmentConfig[analysis.department].emoji}</span>
            {departmentConfig[analysis.department].label}
          </Badge>
        )}
        {statusConfig[analysis.status] && (
          <Badge variant="outline" className={`${statusConfig[analysis.status].className} text-3xs`}>
            {React.createElement(statusConfig[analysis.status].icon, { className: 'mr-1 h-3 w-3' })}
            {statusConfig[analysis.status].label}
          </Badge>
        )}
        {analysis.urgency && urgencyConfig[analysis.urgency] && (
          <Badge variant="outline" className={`${urgencyConfig[analysis.urgency].className} text-3xs`}>
            {urgencyConfig[analysis.urgency].label}
          </Badge>
        )}
        {analysis.churnRisk && analysis.churnRisk !== 'low' && (
          <Badge variant="outline" className={`${churnConfig[analysis.churnRisk]?.color || ''} border-current/30 text-3xs`}>
            <ShieldAlert className="mr-1 h-3 w-3" />
            Churn: {churnConfig[analysis.churnRisk]?.label}
          </Badge>
        )}
      </div>

      {analysis.relationshipType && (
        <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/20 px-3 py-1.5">
          <Users className="h-3 w-3 text-muted-foreground" />
          <span className="text-2xs text-muted-foreground">{analysis.relationshipType}</span>
        </div>
      )}

      <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <VisionIcon className="h-3 w-3" />
            Resumo
          </h4>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={ttsButtonClass} onClick={onPlaySummary} disabled={isTtsLoading} aria-label={isTtsPlaying ? 'Parar áudio' : 'Ouvir resumo'}>
                {isTtsLoading ? <Loader2 className="h-3.5 w-3.5" /> : isTtsPlaying ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>{isTtsLoading ? 'Carregando áudio...' : isTtsPlaying ? 'Parar áudio' : 'Ouvir resumo'}</p></TooltipContent>
          </Tooltip>
        </div>
        <p className="text-sm leading-relaxed">{analysis.summary}</p>
      </div>

      {analysis.customerSatisfaction !== undefined && (
        <div className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/20 p-3">
          <span className="text-xs font-medium text-muted-foreground">Satisfação</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} className={`h-4 w-4 ${star <= (analysis.customerSatisfaction || 0) ? 'fill-warning text-warning' : 'text-muted'}`} />
            ))}
            <span className="ml-1.5 text-xs font-bold text-foreground">{analysis.customerSatisfaction}/5</span>
          </div>
        </div>
      )}

      {analysis.salesOpportunity && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-xl border border-primary/20 bg-primary/10 p-3">
          <h4 className="mb-1 flex items-center gap-1 text-xs font-semibold text-primary">
            <DollarSign className="h-3 w-3" />
            Oportunidade de Venda
          </h4>
          <p className="text-xs leading-relaxed">{analysis.salesOpportunity}</p>
        </motion.div>
      )}

      {analysis.topics && analysis.topics.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Tópicos</h4>
          <div className="flex flex-wrap gap-1.5">
            {analysis.topics.map((topic, index) => (
              <Badge key={index} variant="secondary" className="rounded-lg text-3xs">{topic}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
