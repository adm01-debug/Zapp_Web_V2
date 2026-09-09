import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { MobilePullToRefreshIndicator } from '@/components/mobile/MobilePullToRefresh';
import { VirtualizedRealtimeList } from './VirtualizedRealtimeList';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { InboxFilters } from './InboxFilters';
import { FILTER_OPTIONS } from './ContactTypeFilter';
import { TicketTabs } from './TicketTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Search as SearchIcon, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { useConversationActions } from '@/hooks/chat/useConversationActions';

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
  conversationActions: ReturnType<typeof useConversationActions>;
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

      <div className={cn('shrink-0 space-y-3 border-b border-border px-4', isMobile ? 'py-3' : 'pb-3 pt-3')}>
        {!isMobile && (
          <div className="flex min-h-14 items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold tracking-tight text-foreground">Conversas</h2>
              <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted-foreground">
                <span>{inbox.cachedConversations.length.toLocaleString('pt-BR')} conversas</span>
                <span
                  className={cn('h-2 w-2 rounded-full', inbox.isOnline ? 'bg-success' : 'bg-destructive')}
                  aria-label={inbox.isOnline ? 'Conectado' : 'Sem conexão'}
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => inbox.setShowNewConversation(true)}
              className="h-10 shrink-0 gap-2 rounded-xl px-4 text-xs font-semibold shadow-none"
            >
              <Plus className="h-4 w-4" />
              Nova conversa
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              ref={contactSearchRef}
              placeholder="Buscar conversas…"
              value={contactSearch}
              onChange={(e) => handleContactSearch(e.target.value)}
              className="h-10 rounded-xl border-border bg-input pl-10 pr-9 text-sm placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-primary/40"
              aria-label="Buscar conversas"
            />
            {contactSearch && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearContactSearch}
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg hover:bg-muted"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
          <InboxFilters
            compact
            filters={inboxFilters.filters}
            onFiltersChange={inboxFilters.setFilters}
            showAll={inboxFilters.showAll}
            onShowAllChange={inboxFilters.setShowAll}
            selectedContactType={inboxFilters.selectedContactType}
            onContactTypeChange={inboxFilters.handleContactTypeChange}
            selectedQueueId={inboxFilters.selectedQueueId}
            onQueueChange={inboxFilters.setSelectedQueueId}
            onRefresh={inbox.refetch}
            refreshing={inbox.loading}
          />
        </div>

        <TicketTabs
          conversations={inbox.conversations}
          chipTab={inboxFilters.chipTab}
          onChipTabChange={inboxFilters.setChipTab}
          profileId={inbox.profile?.id}
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
                <EmptyIcon className={cn('w-10 h-10 mx-auto mb-3', activeOpt?.iconColor || 'text-muted-foreground/30')} />
                <p className="text-sm text-muted-foreground">{msg}</p>
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
              pinnedIds={conversationActions.pinnedIds}
              favoriteIds={conversationActions.favoriteIds}
              onPin={(contactId) => {
                if (conversationActions.isPinned(contactId)) conversationActions.unpinConversation(contactId);
                else conversationActions.pinConversation(contactId);
              }}
              onFavorite={(contactId) => {
                if (conversationActions.isFavorite(contactId)) conversationActions.unfavoriteContact(contactId);
                else conversationActions.favoriteContact(contactId);
              }}
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
