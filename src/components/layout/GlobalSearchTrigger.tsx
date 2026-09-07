import { Search } from 'lucide-react';

export function GlobalSearchTrigger() {
  return (
    <button
      onClick={() => document.dispatchEvent(new CustomEvent('open-global-search'))}
      className="flex items-center gap-2 h-9 px-3.5 rounded-2xl border border-border/40 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
      aria-label="Busca global (Ctrl+K)"
    >
      <Search className="w-3.5 h-3.5 shrink-0" />
      <span className="text-xs hidden sm:inline">Buscar...</span>
      <kbd className="ml-1 px-1.5 py-0.5 rounded-md bg-background/60 text-[10px] font-mono text-muted-foreground border border-border/30">⌘K</kbd>
    </button>
  );
}
