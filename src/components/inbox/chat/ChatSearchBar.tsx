import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatSearch } from '@/hooks/chat/useChatSearch';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { ChatSearchFilters } from './ChatSearchFilters';
import { ChatSearchResultsList } from './ChatSearchResultsList';

interface ChatSearchBarProps {
  messages: Message[];
  isOpen: boolean;
  onClose: () => void;
  onNavigateToMessage: (messageId: string) => void;
  onHighlightChange: (messageIds: Set<string>, activeId: string | null) => void;
  onSearchQueryChange?: (query: string) => void;
}

export function ChatSearchBar({ messages, isOpen, onClose, onNavigateToMessage, onHighlightChange, onSearchQueryChange }: ChatSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewListRef = useRef<HTMLDivElement>(null);

  const {
    query, setQuery, filter, setFilter, activeIndex, setActiveIndex, debouncedQuery, results, filterCounts,
    navigateUp, navigateDown, datePreset, setDatePreset, customDateFrom, setCustomDateFrom, customDateTo, setCustomDateTo, hasDateFilter,
  } = useChatSearch({ messages, isOpen, onHighlightChange, onNavigateToMessage, onSearchQueryChange });

  useEffect(() => { if (isOpen) { const t = setTimeout(() => inputRef.current?.focus(), 100); return () => clearTimeout(t); } }, [isOpen]);

  useEffect(() => {
    if (!previewListRef.current || results.length === 0) return;
    const idx = Math.min(activeIndex, Math.min(results.length, 5) - 1);
    if (idx < 0) return;
    (previewListRef.current.children[idx] as HTMLElement)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex, results.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) { e.preventDefault(); navigateUp(); }
    if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); navigateDown(); }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-b border-border/50 bg-background shrink-0">
          <div className="px-3 md:px-4 py-3 space-y-2.5" role="search">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0 flex items-center gap-2.5 bg-muted rounded-xl px-3.5 h-10 border border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-200">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <Input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleKeyDown} placeholder="Buscar na conversa..."
                  className="h-full text-sm border-none bg-transparent shadow-none focus-visible:ring-0 px-0 min-w-0" />
                {query && <button aria-label="Limpar busca" onClick={() => setQuery('')} className="p-1 rounded-full hover:bg-background shrink-0"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>}
                {(debouncedQuery.trim() || filter !== 'all' || hasDateFilter) && (
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0 tabular-nums font-medium" aria-live="polite">
                    {results.length > 0 ? `${activeIndex + 1}/${results.length}` : '0'}
                  </span>
                )}
              </div>
              <div className="flex items-center shrink-0 bg-muted rounded-xl border border-border">
                <Button aria-label="Resultado anterior" variant="ghost" size="icon" className="w-8 h-10 rounded-l-xl rounded-r-none hover:bg-accent" onClick={navigateUp} disabled={results.length === 0}><ChevronUp className="w-4 h-4" /></Button>
                <div className="w-px h-5 bg-border" />
                <Button aria-label="Próximo resultado" variant="ghost" size="icon" className="w-8 h-10 rounded-r-xl rounded-l-none hover:bg-accent" onClick={navigateDown} disabled={results.length === 0}><ChevronDown className="w-4 h-4" /></Button>
              </div>
              <Button aria-label="Fechar busca" variant="ghost" size="icon" className="w-8 h-10 rounded-xl shrink-0 hover:bg-destructive/10 hover:text-destructive" onClick={onClose}><X className="w-4 h-4" /></Button>
            </div>

            <ChatSearchFilters filter={filter} setFilter={setFilter} filterCounts={filterCounts} debouncedQuery={debouncedQuery} hasDateFilter={hasDateFilter}
              datePreset={datePreset} setDatePreset={setDatePreset} customDateFrom={customDateFrom} setCustomDateFrom={setCustomDateFrom} customDateTo={customDateTo} setCustomDateTo={setCustomDateTo} />

            {(debouncedQuery.trim() || filter !== 'all' || hasDateFilter) && results.length === 0 && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5 px-3 py-2 text-muted-foreground bg-muted/50 rounded-lg">
                <Search className="w-4 h-4 opacity-40" />
                <span className="text-xs">{debouncedQuery.trim() ? `Nenhum resultado para "${debouncedQuery.trim().slice(0, 30)}"` : 'Nenhuma mensagem encontrada'}</span>
              </motion.div>
            )}

            {(debouncedQuery.trim() || hasDateFilter) && results.length > 0 && (
              <ChatSearchResultsList ref={previewListRef} results={results} activeIndex={activeIndex} debouncedQuery={debouncedQuery}
                onSelect={(idx, id) => { setActiveIndex(idx); onNavigateToMessage(id); }} />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
