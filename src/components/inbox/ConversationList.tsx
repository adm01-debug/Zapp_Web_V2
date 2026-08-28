import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Conversation } from '@/types/chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, StaggeredList, StaggeredItem } from '@/components/ui/motion';
import { SLAIndicator } from './SLAIndicator';
import { ConversationContextMenu } from './ConversationContextMenu';
import { useExternalContact360Batch, CRMBatchResult } from '@/hooks/crm/useExternalContact360Batch';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import {
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Building,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Renders CRM company badge from pre-fetched batch data (no individual RPC call). */

function CRMConversationBadge({ crmInfo }: { crmInfo: CRMBatchResult | undefined }) {
  if (!crmInfo?.company_name) return null;
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <Sparkles className="w-3 h-3 text-primary/60 shrink-0" />
      <span className="text-[10px] text-primary/70 truncate max-w-[140px]">
        {crmInfo.company_name}
      </span>
    </div>
  );
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation) => void;
}

const statusIcons = {
  open: AlertCircle,
  pending: Clock,
  resolved: CheckCircle2,
  waiting: Loader2,
};

const statusColors = {
  open: 'bg-status-open',
  pending: 'bg-status-pending',
  resolved: 'bg-status-resolved',
  waiting: 'bg-status-waiting',
};

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  // Batch CRM lookup: collect all phones, make 1 single RPC call
  const allPhones = useMemo(
    () => conversations.map((c) => c.contact.phone),
    [conversations]
  );
  const { lookup: crmLookup } = useExternalContact360Batch(allPhones);

  const filteredConversations = useMemo(() => {
    const q = search.toLowerCase();
    return conversations.filter((conv) => {
      const matchesSearch = !q || conv.contact.name.toLowerCase().includes(q) ||
        conv.contact.phone.includes(q);
      const matchesFilter = filter === 'all' || conv.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [conversations, search, filter]);

  const counts = useMemo(() => {
    const c = { all: conversations.length, open: 0, pending: 0, waiting: 0 };
    for (const conv of conversations) {
      if (conv.status === 'open') c.open++;
      else if (conv.status === 'pending') c.pending++;
      else if (conv.status === 'waiting') c.waiting++;
    }
    return c;
  }, [conversations]);

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-border/30">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="p-4 border-b border-border/20 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Conversas</h2>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button variant="ghost" size="icon" aria-label="Filtrar conversas" className="hover:bg-primary/10 text-muted-foreground hover:text-foreground">
              <Filter className="w-4 h-4" />
            </Button>
          </motion.div>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
          <Input
            placeholder="Buscar conversas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted/30 border-border/30 focus:border-primary/50 focus:ring-primary/20 transition-all"
          />
        </div>

        {/* Tabs */}
        <Tabs value={filter} onValueChange={setFilter} className="w-full">
          <TabsList className="w-full grid grid-cols-4 bg-muted/30 border border-border/20">
            <TabsTrigger value="all" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Todas ({counts.all})
            </TabsTrigger>
            <TabsTrigger value="open" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Abertas ({counts.open})
            </TabsTrigger>
            <TabsTrigger value="pending" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Pendentes ({counts.pending})
            </TabsTrigger>
            <TabsTrigger value="waiting" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Aguardando ({counts.waiting})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin" role="listbox" aria-label="Lista de conversas">
        {filteredConversations.length === 0 ? (
          <div className="flex items-center justify-center h-full p-4">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <Search className="w-7 h-7 text-primary-foreground" />
              </motion.div>
              <h3 className="font-semibold text-foreground mb-1">Nenhuma conversa</h3>
              <p className="text-sm text-muted-foreground max-w-[200px]">
                {search ? 'Nenhum resultado para sua busca' : 'Suas conversas aparecerão aqui'}
              </p>
            </motion.div>
          </div>
        ) : (
          <StaggeredList className="p-2 space-y-1">
            {filteredConversations.map((conversation) => {
              const StatusIcon = statusIcons[conversation.status];
              const isSelected = selectedId === conversation.id;

              return (
                <StaggeredItem key={conversation.id}>
                  <ConversationContextMenu
                    conversationId={conversation.id}
                    contactName={conversation.contact.name}
                  >
                  <motion.div
                    role="option"
                    tabIndex={0}
                    aria-selected={isSelected}
                    aria-label={`${conversation.contact.name}${conversation.unreadCount > 0 ? `, ${conversation.unreadCount} não lidas` : ''}`}
                    onClick={() => onSelect(conversation)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(conversation); } }}
                    whileHover={{ x: 2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      'relative p-3 rounded-xl cursor-pointer transition-all duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                      isSelected 
                        ? 'bg-primary/10 border border-primary/30' 
                        : 'hover:bg-muted/30 border border-transparent'
                    )}
                  >
                    {/* Selection indicator */}
                    {isSelected && (
                      <motion.div 
                        layoutId="conversationActive"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-primary"
                      />
                    )}

                    <div className="flex items-start gap-3 relative z-10">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        <Avatar className={cn(
                          "w-11 h-11 ring-2 transition-all",
                          isSelected ? "ring-primary/40" : "ring-border/30"
                        )}>
                          <AvatarImage src={conversation.contact.avatar} />
                          <AvatarFallback className="bg-primary/10 text-primary font-medium">
                            {conversation.contact.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-sidebar',
                            statusColors[conversation.status]
                          )}
                        >
                          <StatusIcon className="w-2.5 h-2.5 text-primary-foreground" />
                        </motion.span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            "font-medium text-sm truncate transition-colors",
                            isSelected ? "text-primary" : "text-foreground"
                          )}>
                            {conversation.contact.name}
                          </span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatDistanceToNow(conversation.updatedAt, {
                              addSuffix: false,
                              locale: ptBR,
                            })}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground truncate pr-2">
                            {conversation.lastMessage?.content || 'Sem mensagens'}
                          </p>
                          {conversation.unreadCount > 0 && (
                            <motion.span 
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                              className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-bold bg-primary text-primary-foreground"
                            >
                              {conversation.unreadCount}
                            </motion.span>
                          )}
                        </div>

                        {/* CRM company indicator (from batch — 1 RPC for all conversations) */}
                        {isExternalConfigured && (
                          <CRMConversationBadge crmInfo={crmLookup(conversation.contact.phone)} />
                        )}
                        <div className="mt-2">
                          <SLAIndicator
                            firstMessageAt={conversation.createdAt}
                            firstResponseAt={conversation.status === 'resolved' ? conversation.updatedAt : null}
                            resolvedAt={conversation.status === 'resolved' ? conversation.updatedAt : null}
                            firstResponseMinutes={conversation.priority === 'high' ? 2 : 5}
                            resolutionMinutes={conversation.priority === 'high' ? 30 : 60}
                            compact
                          />
                        </div>

                        {/* Tags */}
                        {conversation.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-2 flex-wrap">
                            {conversation.tags.slice(0, 2).map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 bg-muted/50 border-border/20"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {conversation.tags.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{conversation.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Priority indicator */}
                      {conversation.priority === 'high' && (
                        <div className="w-1 h-8 rounded-full bg-destructive flex-shrink-0" />
                      )}
                    </div>
                  </motion.div>
                  </ConversationContextMenu>
                </StaggeredItem>
              );
            })}
          </StaggeredList>
        )}
      </div>
    </div>
  );
}
