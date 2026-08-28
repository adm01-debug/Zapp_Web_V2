import { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { Conversation } from '@/types/chat';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from '@/components/ui/motion';
import { Search, Filter } from 'lucide-react';
import { ConversationItem } from './conversation-list/ConversationItem';

const ITEM_HEIGHT = 140;
const COMPACT_ITEM_HEIGHT = 80;

interface VirtualizedConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation) => void;
  compactMode?: boolean;
  onArchive?: (conversation: Conversation) => void;
  onMarkRead?: (conversation: Conversation) => void;
}

export function VirtualizedConversationList({ conversations, selectedId, onSelect, compactMode = false }: VirtualizedConversationListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const parentRef = useRef<HTMLDivElement>(null);
  const itemHeight = compactMode ? COMPACT_ITEM_HEIGHT : ITEM_HEIGHT;

  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      const matchesSearch = conv.contact.name.toLowerCase().includes(search.toLowerCase()) || conv.contact.phone.includes(search);
      const matchesFilter = filter === 'all' || conv.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [conversations, search, filter]);

  const counts = useMemo(() => ({
    all: conversations.length,
    open: conversations.filter((c) => c.status === 'open').length,
    pending: conversations.filter((c) => c.status === 'pending').length,
    waiting: conversations.filter((c) => c.status === 'waiting').length,
  }), [conversations]);

  const virtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5,
  });

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-border/30">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={cn("p-4 border-b border-border/20", compactMode ? "space-y-2" : "space-y-4")}>
        <div className="flex items-center justify-between">
          <h2 className={cn("font-semibold text-foreground", compactMode ? "text-base" : "text-lg")}>Conversas</h2>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button variant="ghost" size="icon" className="hover:bg-primary/10 text-muted-foreground hover:text-foreground"><Filter className="w-4 h-4" /></Button>
          </motion.div>
        </div>
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input placeholder="Buscar conversas..." value={search} onChange={(e) => setSearch(e.target.value)} className={cn("pl-9 bg-muted/30 border-border/30 focus:border-primary/50 focus:ring-primary/20 transition-all", compactMode && "h-8 text-sm")} />
        </div>
        <Tabs value={filter} onValueChange={setFilter} className="w-full">
          <TabsList className={cn("w-full grid grid-cols-4 bg-muted/30 border border-border/20", compactMode && "h-8")}>
            <TabsTrigger value="all" className={cn("text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground", compactMode && "text-[10px] py-1")}>Todas ({counts.all})</TabsTrigger>
            <TabsTrigger value="open" className={cn("text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground", compactMode && "text-[10px] py-1")}>Abertas ({counts.open})</TabsTrigger>
            <TabsTrigger value="pending" className={cn("text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground", compactMode && "text-[10px] py-1")}>Pendentes ({counts.pending})</TabsTrigger>
            <TabsTrigger value="waiting" className={cn("text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground", compactMode && "text-[10px] py-1")}>Aguardando ({counts.waiting})</TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      <div ref={parentRef} className="flex-1 overflow-auto scrollbar-thin" role="listbox" aria-label="Lista de conversas virtualizada">
        {filteredConversations.length === 0 ? (
          <EmptyState icon={Search} title="Nenhuma conversa encontrada" description="Ajuste os filtros ou aguarde novas mensagens chegarem" illustration="inbox" size="sm" />
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const conversation = filteredConversations[virtualRow.index];
              return (
                <div key={virtualRow.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}>
                  <ConversationItem conversation={conversation} isSelected={selectedId === conversation.id} onSelect={onSelect} compact={compactMode} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
