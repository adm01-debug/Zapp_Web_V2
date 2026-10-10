import { motion } from 'framer-motion';
import { ListChecks, ArrowRight, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type AnalysisData } from './analysisConfigs';

interface KeyPointsTabProps {
  analysis: AnalysisData;
  ttsButtonClass: string;
  isTtsLoading: boolean;
  isTtsPlaying: boolean;
  onPlayText: (text: string) => void;
}

export function KeyPointsTab({ analysis, ttsButtonClass, isTtsLoading, isTtsPlaying, onPlayText }: KeyPointsTabProps) {
  return (
    <div className="space-y-4">
      {analysis.keyPoints.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <ListChecks className="h-3 w-3" />
              Pontos-chave
            </h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={ttsButtonClass} onClick={() => onPlayText(analysis.keyPoints.join('. '))} disabled={isTtsLoading} aria-label="Ouvir pontos-chave">
                  {isTtsLoading ? <Loader2 className="h-3.5 w-3.5" /> : isTtsPlaying ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>{isTtsLoading ? 'Carregando...' : isTtsPlaying ? 'Parar' : 'Ouvir pontos-chave'}</p></TooltipContent>
            </Tooltip>
          </div>
          <ul className="space-y-2">
            {analysis.keyPoints.map((point, index) => (
              <motion.li key={index} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}
                className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/30 p-2.5 text-sm">
                <span className="mt-0.5 shrink-0 text-xs font-bold text-primary">{index + 1}.</span>
                <span className="leading-relaxed">{point}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      {analysis.nextSteps && analysis.nextSteps.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              Próximos Passos
            </h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={ttsButtonClass} onClick={() => onPlayText(analysis.nextSteps!.join('. '))} disabled={isTtsLoading} aria-label="Ouvir próximos passos">
                  {isTtsLoading ? <Loader2 className="h-3.5 w-3.5" /> : isTtsPlaying ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top"><p>{isTtsLoading ? 'Carregando...' : isTtsPlaying ? 'Parar' : 'Ouvir próximos passos'}</p></TooltipContent>
            </Tooltip>
          </div>
          <ul className="space-y-2">
            {analysis.nextSteps.map((step, index) => (
              <motion.li key={index} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}
                className="flex items-start gap-2 rounded-xl border border-primary/10 bg-primary/5 p-2.5 text-sm">
                <span className="mt-0.5 shrink-0 text-primary">→</span>
                <span className="leading-relaxed">{step}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
