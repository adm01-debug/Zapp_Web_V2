import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle, Sparkles, Zap } from 'lucide-react';
import { SLAInfo, AIConversationTag } from '@/hooks/crm/useContactEnrichedData';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SLAAndAITagsSectionProps {
  slaInfo: SLAInfo | null | undefined;
  aiTags: AIConversationTag[];
}

const confidenceColor = (c: number) => {
  if (c >= 0.8) return 'bg-success/15 text-success border-success/30';
  if (c >= 0.5) return 'bg-warning/15 text-warning border-warning/30';
  return 'bg-muted/20 text-muted-foreground border-border/30';
};

export function SLAAndAITagsSection({ slaInfo, aiTags }: SLAAndAITagsSectionProps) {
  const hasSLA = slaInfo && slaInfo.first_response_breached !== null;
  const hasAITags = aiTags.length > 0;

  if (!hasSLA && !hasAITags) return null;

  return (
    <div className="space-y-4">
      {/* SLA Indicator */}
      {hasSLA && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs bg-muted/20 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground">1ª Resposta</span>
            </div>
            {slaInfo.first_response_breached ? (
              <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30 animate-pulse">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Violado
              </Badge>
            ) : slaInfo.first_response_at ? (
              <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30">
                <CheckCircle className="w-3 h-3 mr-1" />
                OK
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30">
                Pendente
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Gradient separator */}
      {hasSLA && hasAITags && (
        <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
      )}

      {/* AI Tags — color-coded by confidence */}
      {hasAITags && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
            <Zap className="w-3 h-3" />
            <span>Tags geradas por IA</span>
          </div>
          <TooltipProvider>
            <div className="flex flex-wrap gap-1.5">
              {aiTags.map((tag, i) => (
                <Tooltip key={tag.id}>
                  <TooltipTrigger asChild>
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] cursor-default transition-all hover:scale-105',
                          tag.confidence ? confidenceColor(tag.confidence) : 'bg-primary/10 border-primary/20 text-foreground'
                        )}
                      >
                        <Sparkles className="w-2.5 h-2.5 mr-0.5" />
                        {tag.tag_name}
                      </Badge>
                    </motion.div>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {tag.confidence ? `Confiança: ${Math.round(tag.confidence * 100)}%` : 'Tag IA'}
                    {tag.source && ` • Fonte: ${tag.source}`}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
