import { useRef, useEffect, useCallback } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, AlertTriangle, MessageSquare, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ToneSelector } from './ai-tools/ToneSelector';
import { AIResponseCard } from './ai-tools/AIResponseCard';
import { PeriodFilterSelector } from './ai-tools/PeriodFilterSelector';
import { useUniversityHelp } from '@/hooks/ui/useUniversityHelp';

interface ChatMessage {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  created_at?: string;
}

interface UniversityHelpProps {
  contactId: string;
  contactName?: string;
  messages: ChatMessage[];
  onSelectSuggestion?: (text: string) => void;
}

type FilterMode = 'all' | 'client' | 'agent';

export function UniversityHelp({ contactId, contactName, messages, onSelectSuggestion }: UniversityHelpProps) {
  const {
    selectedIds, loading, response, selectedTone, setSelectedTone, error,
    filterMode, setFilterMode, filteredMessages, periodFilter,
    toggleMessage, selectAll, generateResponse, handleRegenerate, lastCallRef,
  } = useUniversityHelp(contactId, contactName, messages);

  const responseRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (response && responseRef.current) {
      responseRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [response]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && selectedIds.size > 0 && !loading) {
        e.preventDefault();
        generateResponse();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [generateResponse, selectedIds.size, loading]);

  const filterButtons: { mode: FilterMode; label: string }[] = [
    { mode: 'all', label: 'Todos' },
    { mode: 'client', label: 'Só cliente' },
    { mode: 'agent', label: 'Só atendente' },
  ];

  return (
    <div className="space-y-3">
      <PeriodFilterSelector
        period={periodFilter.analysisPeriod}
        onPeriodChange={periodFilter.setAnalysisPeriod}
        customFrom={periodFilter.customDateFrom}
        customTo={periodFilter.customDateTo}
        onCustomFromChange={periodFilter.setCustomDateFrom}
        onCustomToChange={periodFilter.setCustomDateTo}
        onClearCustom={periodFilter.clearCustomDates}
        filteredCount={periodFilter.filteredMessages.length}
        totalCount={messages.length}
      />

      <ToneSelector selected={selectedTone} onChange={(tone) => { setSelectedTone(tone); if (response && selectedIds.size > 0) { lastCallRef.current = 0; generateResponse(tone); } }} disabled={loading} />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 bg-muted/30 rounded-full p-0.5 border border-border/30">
          {filterButtons.map(f => (
            <button key={f.mode} type="button"
              onClick={() => { setFilterMode(f.mode); }}
              className={`px-2.5 py-1 rounded-full text-3xs font-medium transition-all ${
                filterMode === f.mode ? 'bg-primary/15 text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >{f.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={selectAll} className="text-3xs text-primary hover:underline font-medium">
            {selectedIds.size === filteredMessages.length && filteredMessages.length > 0 ? 'Limpar' : 'Todos'}
          </button>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-semibold tabular-nums">
            {selectedIds.size}/{filteredMessages.length}
          </Badge>
        </div>
      </div>

      <ScrollArea className="h-48 [&>[data-radix-scroll-area-viewport]]:max-h-48 rounded-xl border border-border/30 bg-muted/5">
        <div className="p-1.5 space-y-0.5">
          {filteredMessages.map(m => {
            const isSelected = selectedIds.has(m.id);
            const isAgent = m.sender === 'agent';
            return (
              <label key={m.id} className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/20'}`}>
                <Checkbox checked={isSelected} onCheckedChange={() => toggleMessage(m.id)} className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 mb-0.5 ${isAgent ? 'text-primary border-primary/30 bg-primary/5' : 'text-warning border-warning/30 bg-warning/5'}`}>
                    {isAgent ? '🧑‍💼 Atendente' : '👤 Cliente'}
                  </Badge>
                  <p className="text-2xs text-foreground line-clamp-2 leading-snug">{m.content}</p>
                </div>
              </label>
            );
          })}
          {filteredMessages.length === 0 && (
            <div className="flex flex-col items-center py-8 gap-2">
              <MessageSquare className="w-5 h-5 text-muted-foreground/40" />
              <p className="text-2xs text-muted-foreground">Nenhuma mensagem disponível</p>
            </div>
          )}
        </div>
      </ScrollArea>

      <Button variant="default" size="sm" className="w-full h-9 text-xs font-medium"
        onClick={() => generateResponse()} disabled={loading || selectedIds.size === 0} title="Ctrl+Enter para gerar">
        {loading ? (<><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Gerando resposta...</>) :
          (<><Sparkles className="w-3.5 h-3.5 mr-1.5" />Gerar resposta ({selectedIds.size} {selectedIds.size === 1 ? 'msg' : 'msgs'})</>)}
      </Button>
      {selectedIds.size > 0 && !loading && !response && (
        <p className="text-[9px] text-muted-foreground text-center">⌘/Ctrl + Enter para gerar rapidamente</p>
      )}

      {error && !response && (
        <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-destructive font-semibold mb-0.5">Erro ao gerar resposta</p>
            <p className="text-2xs text-destructive/80 mb-2">{error}</p>
            <Button variant="outline" size="sm" className="h-6 text-3xs px-2.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => generateResponse()} disabled={loading}>
              <RefreshCw className="w-3 h-3 mr-1" />Tentar novamente
            </Button>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {response && (
          <div ref={responseRef}>
            <AIResponseCard response={response} onUse={onSelectSuggestion} onRegenerate={handleRegenerate} isRegenerating={loading} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
