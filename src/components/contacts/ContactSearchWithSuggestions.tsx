import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, Clock, Sparkles, X, Tag, Building, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactSearchWithSuggestionsProps {
  value: string;
  onChange: (val: string) => void;
  uniqueCompanies: string[];
  uniqueTags: string[];
  totalCount: number;
}

const STORAGE_KEY = 'contact-recent-searches';
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function addRecentSearch(term: string) {
  if (!term.trim()) return;
  const recent = getRecentSearches().filter(s => s !== term);
  recent.unshift(term);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function clearRecentSearches() {
  localStorage.removeItem(STORAGE_KEY);
}

export function ContactSearchWithSuggestions({
  value, onChange, uniqueCompanies, uniqueTags, totalCount,
}: ContactSearchWithSuggestionsProps) {
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focused) setRecentSearches(getRecentSearches());
  }, [focused]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const suggestions = useMemo(() => {
    if (!value.trim()) return [];
    const lower = value.toLowerCase();
    const items: { type: 'company' | 'tag'; label: string; icon: typeof Building }[] = [];

    uniqueCompanies.filter(c => c.toLowerCase().includes(lower)).slice(0, 3)
      .forEach(c => items.push({ type: 'company', label: c, icon: Building }));

    uniqueTags.filter(t => t.toLowerCase().includes(lower)).slice(0, 3)
      .forEach(t => items.push({ type: 'tag', label: t, icon: Tag }));

    return items;
  }, [value, uniqueCompanies, uniqueTags]);

  const showDropdown = focused && (recentSearches.length > 0 || suggestions.length > 0 || !value);

  const handleSelect = (term: string) => {
    onChange(term);
    addRecentSearch(term);
    setFocused(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      addRecentSearch(value.trim());
      setFocused(false);
    }
    if (e.key === 'Escape') {
      setFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-[320px]">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-muted-foreground z-10" />
      <Input
        ref={inputRef}
        placeholder="Buscar por nome, telefone, email ou empresa…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={handleKeyDown}
        className={cn("h-11 pl-11 rounded-xl bg-input border-border text-[15px] transition-all", focused && "ring-2 ring-primary/20")}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1.5 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Quick stats */}
            {!value && (
              <div className="px-3 py-2 bg-muted/30 border-b border-border/30">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Sparkles className="w-3 h-3" />
                  <span>{totalCount} contatos na base</span>
                  <span>·</span>
                  <span>{uniqueCompanies.length} empresas</span>
                </div>
              </div>
            )}

            {/* Recent searches */}
            {!value && recentSearches.length > 0 && (
              <div className="p-2">
                <div className="flex items-center justify-between px-2 mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Recentes
                  </span>
                  <button
                    onClick={() => { clearRecentSearches(); setRecentSearches([]); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Limpar
                  </button>
                </div>
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    onClick={() => handleSelect(term)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors text-left"
                  >
                    <Clock className="w-3 h-3 shrink-0 opacity-50" />
                    <span className="truncate">{term}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="p-2 border-t border-border/30">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2">
                  Sugestões
                </span>
                {suggestions.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={`${item.type}-${item.label}`}
                      onClick={() => handleSelect(item.label)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors text-left mt-0.5"
                    >
                      <Icon className="w-3 h-3 shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground">{item.label}</span>
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-auto shrink-0">
                        {item.type === 'company' ? 'Empresa' : 'Tag'}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
