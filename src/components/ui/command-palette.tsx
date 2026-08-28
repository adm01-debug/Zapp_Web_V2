import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, ArrowRight, Clock, Star, X, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent } from './dialog';
import { Badge } from './badge';
import { ScrollArea } from './scroll-area';
import { useDebounce } from '@/hooks/system/useDebounce';
import { log } from '@/lib/logger';
import {
  CommandItem, CommandGroup, CommandCategory,
  defaultNavigationCommands, defaultActionCommands,
  fuzzyMatch, highlightMatch,
} from './command-palette-data';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (view: string) => void;
  onSearch?: (query: string) => Promise<CommandItem[]>;
  placeholder?: string;
  recentSearches?: string[];
  onRecentSearchSelect?: (query: string) => void;
  onClearRecent?: () => void;
  customCommands?: CommandItem[];
}

export function CommandPalette({
  open, onOpenChange, onNavigate, onSearch,
  placeholder = 'Buscar ou digitar comando...',
  recentSearches = [], onRecentSearchSelect, onClearRecent,
  customCommands = [],
}: CommandPaletteProps) {
  const [query, setQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [searchResults, setSearchResults] = React.useState<CommandItem[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const allCommands = React.useMemo(() => [...defaultNavigationCommands, ...defaultActionCommands, ...customCommands], [customCommands]);

  const filteredCommands = React.useMemo(() => {
    if (!query) return [];
    return allCommands.filter((cmd) => {
      const searchText = `${cmd.title} ${cmd.description || ''} ${cmd.keywords?.join(' ') || ''}`;
      return fuzzyMatch(searchText, query);
    }).slice(0, 10);
  }, [query, allCommands]);

  const groupedCommands = React.useMemo((): CommandGroup[] => {
    const groups: Record<string, CommandItem[]> = {};
    const items = query ? [...filteredCommands, ...searchResults] : [];
    items.forEach((item) => { if (!groups[item.category]) groups[item.category] = []; groups[item.category].push(item); });
    const result: CommandGroup[] = [];
    if (groups.action?.length) result.push({ title: 'Ações', items: groups.action });
    if (groups.navigation?.length) result.push({ title: 'Navegação', items: groups.navigation });
    if (groups.search?.length) result.push({ title: 'Resultados', items: groups.search });
    return result;
  }, [query, filteredCommands, searchResults]);

  const allItems = React.useMemo(() => groupedCommands.flatMap(g => g.items), [groupedCommands]);

  const debouncedSearch = useDebounce(async (q: string) => {
    if (!onSearch || q.length < 2) { setSearchResults([]); return; }
    setIsSearching(true);
    try { setSearchResults(await onSearch(q)); } catch (e) { log.error('Search error:', e); setSearchResults([]); } finally { setIsSearching(false); }
  }, 300);

  const handleQueryChange = (v: string) => { setQuery(v); setSelectedIndex(0); debouncedSearch(v); };

  const executeCommand = (item: CommandItem) => {
    if (item.disabled) return;
    if (item.action) item.action();
    else if (item.href) window.location.href = item.href;
    else if (item.id.startsWith('nav-')) onNavigate?.(item.id.replace('nav-', ''));
    onOpenChange(false); setQuery('');
  };

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((p) => (p + 1) % Math.max(allItems.length, 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((p) => (p - 1 + allItems.length) % Math.max(allItems.length, 1)); }
      else if (e.key === 'Enter' && allItems[selectedIndex]) { e.preventDefault(); executeCommand(allItems[selectedIndex]); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, allItems, selectedIndex]);

  React.useEffect(() => {
    if (!open) { setQuery(''); setSearchResults([]); setSelectedIndex(0); }
    else setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const categoryIcons: Record<CommandCategory, React.ReactNode> = {
    navigation: <ArrowRight className="h-3 w-3" />, action: <Zap className="h-3 w-3" />,
    search: <Search className="h-3 w-3" />, recent: <Clock className="h-3 w-3" />,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0">
        <div className="flex items-center border-b border-border px-4">
          <Search className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <input ref={inputRef} value={query} onChange={(e) => handleQueryChange(e.target.value)} placeholder={placeholder}
            className="flex-1 px-4 py-4 text-base bg-transparent border-0 outline-none placeholder:text-muted-foreground"
            autoComplete="off" autoCorrect="off" spellCheck={false} />
          {query && <button onClick={() => handleQueryChange('')} className="p-1.5 hover:bg-muted rounded-md transition-colors"><X className="h-4 w-4 text-muted-foreground" /></button>}
          {isSearching && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin ml-2" />}
        </div>

        <div className="flex items-center justify-between px-4 py-2 bg-muted/30 text-xs text-muted-foreground border-b border-border">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">↑↓</kbd>navegar</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">Enter</kbd>selecionar</span>
            <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">Esc</kbd>fechar</span>
          </div>
          <div className="flex items-center gap-1"><Command className="h-3 w-3" /><kbd className="px-1.5 py-0.5 bg-muted rounded font-mono">K</kbd></div>
        </div>

        <ScrollArea className="max-h-[400px]">
          {!query && (
            <div className="p-2">
              {recentSearches.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Clock className="h-3 w-3" />Buscas recentes</span>
                    {onClearRecent && <button onClick={onClearRecent} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Limpar</button>}
                  </div>
                  <div className="space-y-0.5">
                    {recentSearches.slice(0, 5).map((s) => (
                      <button key={s} onClick={() => { onRecentSearchSelect?.(s); handleQueryChange(s); }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left">
                        <Clock className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{s}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="px-2 py-1.5"><span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Star className="h-3 w-3" />Acesso rápido</span></div>
                <div className="space-y-0.5">
                  {defaultNavigationCommands.slice(0, 5).map((cmd, idx) => (
                    <button key={cmd.id} onClick={() => executeCommand(cmd)}
                      className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left group', idx === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50')}>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground group-hover:text-foreground transition-colors">{cmd.icon}</span>
                        <div><span className="text-sm font-medium">{cmd.title}</span>{cmd.description && <p className="text-xs text-muted-foreground">{cmd.description}</p>}</div>
                      </div>
                      {cmd.shortcut && <div className="flex gap-1">{cmd.shortcut.map((k, i) => <kbd key={i} className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">{k}</kbd>)}</div>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {query && (
            <div className="p-2">
              {groupedCommands.length === 0 && !isSearching && (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Search className="h-8 w-8 mb-2 opacity-50" /><p className="text-sm">Nenhum resultado para "{query}"</p><p className="text-xs mt-1">Tente outros termos</p>
                </div>
              )}
              {groupedCommands.map((group) => (
                <div key={group.title} className="mb-2">
                  <div className="px-2 py-1.5"><span className="text-xs font-medium text-muted-foreground">{group.title}</span></div>
                  <div className="space-y-0.5">
                    {group.items.map((item, idx) => {
                      const gi = groupedCommands.slice(0, groupedCommands.indexOf(group)).reduce((a, g) => a + g.items.length, 0) + idx;
                      return (
                        <motion.button key={item.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.02 }}
                          onClick={() => executeCommand(item)} disabled={item.disabled}
                          className={cn('w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left group', gi === selectedIndex ? 'bg-muted' : 'hover:bg-muted/50', item.disabled && 'opacity-50 cursor-not-allowed')}>
                          <div className="flex items-center gap-3">
                            <span className={cn('transition-colors', item.category === 'action' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')}>{item.icon || categoryIcons[item.category]}</span>
                            <div><span className="text-sm font-medium">{highlightMatch(item.title, query)}</span>{item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {item.badge && <Badge variant="secondary" className="text-[10px]">{item.badge}</Badge>}
                            {item.shortcut && <div className="flex gap-1">{item.shortcut.map((k, i) => <kbd key={i} className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono text-muted-foreground">{k}</kbd>)}</div>}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function useCommandPalette() {
  const [isOpen, setIsOpen] = React.useState(false);
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setIsOpen(p => !p); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return { isOpen, setIsOpen };
}

// Re-export types for consumers
export type { CommandItem, CommandGroup, CommandCategory };
