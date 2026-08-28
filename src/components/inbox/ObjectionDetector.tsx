import { memo, forwardRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldQuestion, Lightbulb, Loader2, RefreshCw, AlertTriangle, Copy, Check, Send, ChevronUp, ChevronDown, Sparkles, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ToneSelector } from './ai-tools/ToneSelector';
import { PeriodFilterSelector } from './ai-tools/PeriodFilterSelector';
import { useObjectionDetector } from '@/hooks/inbox/useObjectionDetector';

interface Objection {
  objection: string;
  counterArgument: string;
  confidence: number;
}

interface ChatMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  created_at?: string;
}

interface ObjectionDetectorProps {
  contactId: string;
  contactName?: string;
  lastMessages: string[];
  allMessages?: ChatMessage[];
  onSelectSuggestion?: (text: string) => void;
}

/* ─── Confidence Badge ─── */
const ConfidenceBadge = memo(function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">
      <Zap className="w-2.5 h-2.5" />{pct}%
    </span>
  );
});

/* ─── Action Bar ─── */
const ActionBar = memo(function ActionBar({ text, idx, copiedIdx, isRewriting, rewritingAny, onCopy, onRewrite, onSelect }: {
  text: string; idx: number; copiedIdx: number | null; isRewriting: boolean; rewritingAny: boolean;
  onCopy: (text: string, idx: number) => void; onRewrite: (idx: number) => void; onSelect: (text: string) => void;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <div className="flex items-center gap-0.5">
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/30" onClick={() => onCopy(text, idx)} disabled={rewritingAny}>
            {copiedIdx === idx ? <Check className="w-4 h-4 text-primary" /> : <Copy className="w-4 h-4" />}
          </Button>
        </TooltipTrigger><TooltipContent side="bottom" className="text-[10px]">{copiedIdx === idx ? 'Copiado!' : 'Copiar'}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/30" onClick={() => onRewrite(idx)} disabled={rewritingAny}>
            <RefreshCw className={cn('w-4 h-4', isRewriting && 'animate-spin')} />
          </Button>
        </TooltipTrigger><TooltipContent side="bottom" className="text-[10px]">Reescrever</TooltipContent></Tooltip>
      </div>
      <Button size="sm" className="h-9 px-5 text-[12px] font-bold gap-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25" onClick={() => onSelect(text)} disabled={rewritingAny}>
        <Send className="w-3.5 h-3.5" />Usar resposta
      </Button>
    </div>
  );
});

/* ─── Objection Card ─── */
const ObjectionCard = memo(forwardRef<HTMLDivElement, {
  obj: Objection; idx: number; isRewriting: boolean; rewritingAny: boolean; copiedIdx: number | null;
  onSelect: (text: string) => void; onCopy: (text: string, idx: number) => void; onRewrite: (idx: number) => void;
}>(function ObjectionCard({ obj, idx, isRewriting, rewritingAny, copiedIdx, onSelect, onCopy, onRewrite }, ref) {
  const [expanded, setExpanded] = useState(true);
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ delay: idx * 0.06, type: 'spring', stiffness: 400, damping: 30 }} className="rounded-2xl bg-muted/8 border border-border/30 overflow-hidden">
      <button type="button" onClick={() => setExpanded(prev => !prev)} className="flex items-start gap-3 w-full text-left p-4" aria-expanded={expanded}>
        <div className="shrink-0 mt-0.5 w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center"><ShieldQuestion className="w-4 h-4 text-primary" /></div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[13px] text-foreground font-medium leading-snug pr-4">{obj.objection}</p>
          <ConfidenceBadge confidence={obj.confidence} />
        </div>
        <div className="shrink-0 mt-1 text-muted-foreground/60">{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }} className="overflow-hidden">
            <div className="px-4 pb-4">
              <div className="p-4 rounded-xl bg-muted/15 border border-border/20">
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 mt-0.5 w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center"><Lightbulb className="w-3 h-3 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    {isRewriting ? (
                      <div className="flex items-center gap-2 py-2"><Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /><span className="text-xs text-muted-foreground">Reescrevendo...</span></div>
                    ) : (
                      <p className="text-[12.5px] text-foreground/90 leading-relaxed">{obj.counterArgument}</p>
                    )}
                  </div>
                </div>
              </div>
              <ActionBar text={obj.counterArgument} idx={idx} copiedIdx={copiedIdx} isRewriting={isRewriting} rewritingAny={rewritingAny} onCopy={onCopy} onRewrite={onRewrite} onSelect={onSelect} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}));

/* ─── Shimmer ─── */
function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg bg-muted/20 overflow-hidden relative', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-muted/30 to-transparent" />
    </div>
  );
}

/* ─── Main Component ─── */
export function ObjectionDetector({ contactId, contactName, lastMessages, allMessages = [], onSelectSuggestion }: ObjectionDetectorProps) {
  const detector = useObjectionDetector(contactId, contactName, lastMessages, allMessages);

  const handleSelect = useCallback((text: string) => {
    detector.handleSelect(text, onSelectSuggestion);
  }, [detector.handleSelect, onSelectSuggestion]);

  /* ── Pre-analysis state ── */
  if (!detector.analyzed) {
    return (
      <div className="space-y-3">
        {detector.hasPeriodMessages && (
          <PeriodFilterSelector
            period={detector.periodFilter.analysisPeriod}
            onPeriodChange={detector.periodFilter.setAnalysisPeriod}
            customFrom={detector.periodFilter.customDateFrom}
            customTo={detector.periodFilter.customDateTo}
            onCustomFromChange={detector.periodFilter.setCustomDateFrom}
            onCustomToChange={detector.periodFilter.setCustomDateTo}
            onClearCustom={detector.periodFilter.clearCustomDates}
            filteredCount={detector.periodFilter.filteredMessages.length}
            totalCount={allMessages.length}
          />
        )}
        <ToneSelector selected={detector.selectedTone} onChange={detector.setSelectedTone} />
        <Button className="w-full h-11 text-[13px] font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-2xl shadow-lg shadow-primary/25 transition-all active:scale-[0.98]" onClick={() => detector.analyze()} disabled={detector.loading || detector.clientMessages.length === 0}>
          {detector.loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisando...</>) : (<><Sparkles className="w-4 h-4 mr-2" />Detectar objeções{detector.clientMessages.length > 0 && <span className="ml-2 px-2 py-0.5 rounded-full bg-primary-foreground/20 text-[10px] font-bold tabular-nums">{detector.clientMessages.length}</span>}</>)}
        </Button>
        {detector.clientMessages.length === 0 && <p className="text-[10px] text-muted-foreground text-center italic">Nenhuma mensagem do cliente no período</p>}
      </div>
    );
  }

  /* ── Loading ── */
  if (detector.loading && detector.objections.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 px-1">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <div><p className="text-xs font-semibold text-foreground">Analisando mensagens...</p><p className="text-[10px] text-muted-foreground">{detector.clientMessages.length} mensagens em análise</p></div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-2xl border border-border/20 p-4 space-y-3">
              <div className="flex items-start gap-3"><ShimmerBlock className="h-8 w-8 rounded-xl shrink-0" /><div className="flex-1 space-y-2"><ShimmerBlock className="h-3.5 w-4/5" /><ShimmerBlock className="h-5 w-16 rounded-full" /></div></div>
              <ShimmerBlock className="h-16 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Empty ── */
  if (detector.objections.length === 0) {
    return (
      <div className="space-y-4">
        {detector.error ? (
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-destructive/8 border border-destructive/15">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div className="min-w-0"><p className="text-xs text-destructive font-semibold mb-1">Erro na análise</p><p className="text-[11px] text-destructive/80 leading-relaxed">{detector.error}</p></div>
          </div>
        ) : (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center py-8 gap-3">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }} className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/15">
              <Check className="w-7 h-7 text-primary" />
            </motion.div>
            <div className="text-center space-y-1"><p className="text-sm font-semibold text-foreground">Nenhuma objeção!</p><p className="text-[11px] text-muted-foreground max-w-[260px]">O cliente não apresentou resistências. Conversa fluindo bem 🎉</p></div>
          </motion.div>
        )}
        <Button variant="outline" className="w-full h-10 text-xs font-medium rounded-2xl border-border/30" onClick={detector.resetAnalysis}>
          <RefreshCw className="w-3.5 h-3.5 mr-2" />Nova análise
        </Button>
      </div>
    );
  }

  /* ── Results ── */
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 border border-primary/15"><span className="text-sm font-bold text-primary">{detector.objections.length}</span></div>
          <div><p className="text-[13px] font-bold text-foreground leading-none">{detector.objections.length === 1 ? 'Objeção detectada' : 'Objeções detectadas'}</p><p className="text-[11px] text-muted-foreground mt-0.5">Contra-argumentos prontos</p></div>
        </div>
        <Tooltip><TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-muted/30" onClick={() => detector.analyze()} disabled={detector.loading}>
            <motion.div animate={detector.loading ? { rotate: 360 } : {}} transition={{ duration: 1, repeat: detector.loading ? Infinity : 0, ease: 'linear' }}><RefreshCw className="w-4 h-4" /></motion.div>
          </Button>
        </TooltipTrigger><TooltipContent side="left" className="text-[10px]">Reanalisar</TooltipContent></Tooltip>
      </div>

      <ToneSelector selected={detector.selectedTone} onChange={(tone) => { detector.setSelectedTone(tone); detector.analyze(tone); }} disabled={detector.loading} />

      <div className="relative">
        {detector.loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm rounded-2xl">
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-muted/80 border border-border/50 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-xs font-medium text-foreground">Ajustando tom...</span></div>
          </motion.div>
        )}
        <ScrollArea className="h-72 [&>[data-radix-scroll-area-viewport]]:max-h-72">
          <div className="space-y-3 pr-3">
            <AnimatePresence mode="popLayout">
              {detector.objections.map((obj, idx) => (
                <ObjectionCard key={`${idx}-${obj.objection.slice(0, 20)}`} obj={obj} idx={idx} isRewriting={detector.rewritingIdx === idx} rewritingAny={detector.rewritingIdx !== null} copiedIdx={detector.copiedIdx} onSelect={handleSelect} onCopy={detector.handleCopy} onRewrite={detector.rewriteSingle} />
              ))}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
