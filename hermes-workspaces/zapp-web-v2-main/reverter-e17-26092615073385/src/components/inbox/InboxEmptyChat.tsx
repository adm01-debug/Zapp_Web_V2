import { motion } from 'framer-motion';
import { MessageSquare, MessageSquarePlus, Search as SearchIcon } from 'lucide-react';

export function InboxEmptyChat() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background min-h-0 overflow-hidden">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }} className="text-center p-8 max-w-md">
        <div className="relative w-28 h-28 mx-auto mb-8">
          <motion.div
            animate={{ rotate: [0, 3, -3, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary/12 via-primary/6 to-transparent flex items-center justify-center ring-1 ring-primary/10 shadow-lg shadow-primary/5"
          >
            <MessageSquare className="w-12 h-12 text-primary/50" />
          </motion.div>
          <motion.div
            animate={{ y: [0, -8, 0], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute -top-3 -right-3 w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center shadow-sm ring-1 ring-primary/10"
          >
            <MessageSquarePlus className="w-5 h-5 text-primary/60" />
          </motion.div>
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
            className="absolute -bottom-2 -left-2 w-7 h-7 rounded-xl bg-accent/15 flex items-center justify-center ring-1 ring-accent/10"
          >
            <SearchIcon className="w-3.5 h-3.5 text-accent-foreground/50" />
          </motion.div>
        </div>

        <h3 className="text-xl font-bold text-foreground mb-2 tracking-tight">Selecione uma conversa</h3>
        <p className="text-muted-foreground text-sm leading-relaxed mb-6">Escolha uma conversa na lista ao lado para visualizar e responder mensagens</p>
        
        <div className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-muted/30 border border-border/30">
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded-md bg-muted text-3xs font-mono text-muted-foreground border border-border/40 shadow-sm">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded-md bg-muted text-3xs font-mono text-muted-foreground border border-border/40 shadow-sm">↓</kbd>
            <span className="text-2xs text-muted-foreground/60 ml-1">navegar</span>
          </div>
          <div className="w-px h-3 bg-border/40" />
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 rounded-md bg-muted text-3xs font-mono text-muted-foreground border border-border/40 shadow-sm">Enter</kbd>
            <span className="text-2xs text-muted-foreground/60 ml-1">abrir</span>
          </div>
          <div className="w-px h-3 bg-border/40" />
          <div className="flex items-center gap-1">
            <kbd className="px-2 py-0.5 rounded-md bg-muted text-3xs font-mono text-muted-foreground border border-border/40 shadow-sm">⌘K</kbd>
            <span className="text-2xs text-muted-foreground/60 ml-1">buscar</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
