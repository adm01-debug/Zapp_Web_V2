import { lazy, Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { MobilePullToRefreshIndicator } from '@/components/mobile/MobilePullToRefresh';
import { VirtualizedRealtimeList } from './VirtualizedRealtimeList';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { InboxFilters } from './InboxFilters';
import { FILTER_OPTIONS } from './ContactTypeFilter';
import { StatusChips } from './conversation-list/StatusChips';
import type { useConversationActions } from '@/hooks/chat/useConversationActions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Search as SearchIcon, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SKELETON_WIDTHS = [
  { name: 68, msg: 55 }, { name: 82, msg: 70 }, { name: 74, msg: 62 },
  { name: 91, msg: 80 }, { name: 65, msg: 48 }, { name: 78, msg: 65 },
  { name: 88, msg: 73 },
];

interface ConversationListSidebarProps {
  inbox: any;
  inboxFilters: any;
  bulkActions: any;
  pullToRefresh: any;
  conversationActions?: ReturnType<typeof useConversationActions>;
}

export function ConversationListSidebar({ inbox, inboxFilters, bulkActions, pullToRefresh, conversationActions }: ConversationListSidebarProps) {
  const isMobile = useIsMobile();
  const contactSearchRef = useRef<HTMLInputElement>(null);
  const [contactSearch, setContactSearch] = useState('');

  // Sync local search to inboxFilters
  const handleContactSearch = useCallback((value: string) => {
    setContactSearch(value);
    inboxFilters.setSearch(value);
  }, [inboxFilters]);

  const clearContactSearch = useCallback(() => {
    setContactSearch('');
    inboxFilters.setSearch('');
    contactSearchRef.current?.focus();
  }, [inboxFilters]);

  return (
    <div className={cn(
      'h-full min-h-0 flex-shrink-0 relative z-10 border-r border-border bg-card flex flex-col overflow-hidden',
      isMobile ? (inbox.selectedContactId ? 'hidden' : 'w-full') : 'w-[350px] min-w-[350px] max-w-[350px]'
    )}>
      <BulkActionsToolbar
        selectedCount={bulkActions.selectedIds.size}
        onMarkAsRead={bulkActions.bulkMarkAsRead}
        onTransfer={bulkActions.bulkTransfer}
        onArchive={bulkActions.bulkArchive}
        onClearSelection={bulkActions.clearSelection}
        isLoading={bulkActions.bulkLoading}
      />

      <div className="border-b border-border shrink-0">
        {!isMobile && (
          <div className="h-14 px-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold tracking-tight text-foreground leading-none">Conversas</h2>
              <div className="flex items-center gap-1.5 mt-1">
                <span className={cn('w-2 h-2 rounded-full shrink-0', inbox.isOnline ? 'bg-success' : 'bg-destructive')} />
                <span className="text-[13px] text-muted-foreground truncate">{inbox.cachedConversations.length.toLocaleString('pt-BR')} conversas</span>
              </div>
            </div>
            <Button
              onClick={() => inbox.setShowNewConversation(true)}
              className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nova conversa
            </Button>
          </div>
        )}

        <div className={cn('flex items-center gap-2 px-4', isMobile ? 'pt-1.5 pb-1' : 'pb-1')}>
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
            <Input
              ref={contactSearchRef}
              placeholder="Buscar conversas…"
              value={contactSearch}
              onChange={(e) => handleContactSearch(e.target.value)}
              className="pl-10 pr-8 h-10 rounded-xl bg-input border border-border text-sm placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary/30"
              aria-label="Buscar contato pelo nome"
            />
            {contactSearch && (
              <Button variant="ghost" size="icon" onClick={clearContactSearch}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 hover:bg-transparent" aria-label="Limpar busca">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
        <div className="px-4 pb-2 overflow-x-auto scrollbar-none">
          <InboxFilters
            filters={inboxFilters.filters}
            onFiltersChange={inboxFilters.setFilters}
            showAll={inboxFilters.showAll}
            onShowAllChange={inboxFilters.setShowAll}
            selectedContactType={inboxFilters.selectedContactType}
            onContactTypeChange={inboxFilters.handleContactTypeChange}
            selectedQueueId={inboxFilters.selectedQueueId}
            onQueueChange={inboxFilters.setSelectedQueueId}
            onRefetch={inbox.refetch}
            isRefetching={inbox.loading}
          />
        </div>

        <StatusChips
          conversations={inbox.conversations}
          chipTab={inboxFilters.chipTab}
          onChipTabChange={inboxFilters.setChipTab}
        />
      </div>

      {isMobile && (
        <MobilePullToRefreshIndicator
          isRefreshing={pullToRefresh.isRefreshing}
          pullProgress={pullToRefresh.pullProgress}
          pullDistance={pullToRefresh.pullDistance}
        />
      )}

      <div
        // eslint-disable-next-line react-hooks/refs
        ref={pullToRefresh.containerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        // eslint-disable-next-line react-hooks/refs
        {...(isMobile ? pullToRefresh.handlers : {})}
      >
        {inbox.loading ? (
          <div className="p-3 space-y-1">
            {SKELETON_WIDTHS.map(({ name, msg }, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
                className="flex items-center gap-3 p-2.5 rounded-xl"
              >
                <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3.5 rounded-md" style={{ width: `${name}%` }} />
                    <Skeleton className="h-3 w-10 rounded-md" />
                  </div>
                  <Skeleton className="h-3 rounded-md" style={{ width: `${msg}%` }} />
                </div>
              </motion.div>
            ))}
          </div>
        ) : inboxFilters.filteredConversations.length === 0 ? (
          (() => {
            const activeOpt = FILTER_OPTIONS.find(o => o.value === (inboxFilters.selectedContactType || 'all'));
            const EmptyIcon = activeOpt?.icon || MessageSquare;
            const emptyMessages: Record<string, string> = {
              individual: 'Nenhum chat individual encontrado',
              grupo: 'Nenhum grupo encontrado',
              grupo_orcamentos: 'Nenhum orçamento em aberto',
              grupo_aprovacao: 'Nenhuma aprovação pendente',
              grupo_os: 'Nenhuma O.S. encontrada',
              grupo_acerto: 'Nenhum acerto pendente',
              grupo_sem_categoria: 'Nenhum grupo sem categoria',
              cliente: 'Nenhum cliente encontrado',
              colaborador: 'Nenhum colaborador encontrado',
              fornecedor: 'Nenhum fornecedor encontrado',
              prestador_servico: 'Nenhum prestador encontrado',
              transportadora: 'Nenhuma transportadora encontrada',
            };
            const msg = inboxFilters.search ? 'Nenhuma conversa encontrada' : emptyMessages[inboxFilters.selectedContactType || ''] || 'Sem conversas';
            return (
              <motion.div key={inboxFilters.selectedContactType || 'all'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-kpi-blue text-kpi-blue-fg flex items-center justify-center mx-auto mb-3">
                  <EmptyIcon className="w-6 h-6" />
                </div>
                <p className="text-[15px] font-semibold text-foreground mb-1">{msg}</p>
                <p className="text-[13px] text-muted-foreground">Novas conversas aparecerão aqui.</p>
              </motion.div>
            );
          })()
        ) : (
          <ErrorBoundary
            fallback={<div className="p-8 text-center"><MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm text-muted-foreground">Erro ao carregar. Recarregue.</p></div>}
          >
            <VirtualizedRealtimeList
              conversations={inboxFilters.filteredConversations}
              selectedContactId={inbox.selectedContactId}
              onSelectConversation={inbox.handleSelectConversation}
              selectionMode={bulkActions.selectionMode}
              selectedIds={bulkActions.selectedIds}
              onToggleSelection={bulkActions.toggleSelection}
              pinnedIds={conversationActions?.pinnedIds}
              onPin={(contactId) => {
                if (conversationActions?.isPinned(contactId)) conversationActions.unpinConversation(contactId);
                else conversationActions?.pinConversation(contactId);
              }}
              favoriteIds={conversationActions?.favoriteIds}
              onFavorite={(contactId) => {
                if (conversationActions?.isFavorite(contactId)) conversationActions.unfavoriteContact(contactId);
                else conversationActions?.favoriteContact(contactId);
              }}
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
