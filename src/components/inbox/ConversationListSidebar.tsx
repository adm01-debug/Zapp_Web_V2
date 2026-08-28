import { lazy, Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { MobilePullToRefreshIndicator } from '@/components/mobile/MobilePullToRefresh';
import { VirtualizedRealtimeList } from './VirtualizedRealtimeList';
import { ErrorBoundary } from '@/components/errors/ErrorBoundary';
import { BulkActionsToolbar } from './BulkActionsToolbar';
import { InboxFilters } from './InboxFilters';
import { ContactTypeFilter, FILTER_OPTIONS } from './ContactTypeFilter';
import { TicketTabs } from './TicketTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageSquare, RefreshCw, Search as SearchIcon, MessageSquarePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ConversationListSidebarProps {
  inbox: any;
  inboxFilters: any;
  bulkActions: any;
  pullToRefresh: any;
}

export function ConversationListSidebar({ inbox, inboxFilters, bulkActions, pullToRefresh }: ConversationListSidebarProps) {
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
      isMobile ? (inbox.selectedContactId ? 'hidden' : 'w-full') : 'w-[320px] min-w-[320px] max-w-[320px]'
    )}>
      <BulkActionsToolbar
        selectedCount={bulkActions.selectedIds.size}
        onMarkAsRead={bulkActions.bulkMarkAsRead}
        onTransfer={bulkActions.bulkTransfer}
        onArchive={bulkActions.bulkArchive}
        onClearSelection={bulkActions.clearSelection}
        isLoading={bulkActions.bulkLoading}
      />

      <div className={cn("px-3 border-b border-border space-y-1.5 shrink-0", isMobile ? "pt-1.5 pb-1.5" : "pt-2.5 pb-1.5")}>
        {!isMobile && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold text-foreground tracking-tight">Conversas</h2>
              <span className={cn('w-1.5 h-1.5 rounded-full', inbox.isOnline ? 'bg-success' : 'bg-destructive')} />
            </div>
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={inbox.refetch} disabled={inbox.loading} className="w-7 h-7 rounded-lg hover:bg-muted/60 active:scale-90 transition-all duration-150" aria-label="Atualizar">
                    <RefreshCw className={cn('w-3.5 h-3.5', inbox.loading && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-[10px] font-medium">Atualizar</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => inbox.setShowNewConversation(true)} className="w-7 h-7 rounded-lg text-primary hover:bg-primary/10 active:scale-90 transition-all duration-150" aria-label="Nova conversa">
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-[10px] font-medium">Nova Conversa</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {isMobile ? (
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
              <Input
                ref={contactSearchRef}
                placeholder="Buscar contato..."
                value={contactSearch}
                onChange={(e) => handleContactSearch(e.target.value)}
                className="pl-8 pr-7 bg-muted/40 border-0 rounded-lg h-8 text-xs placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
                aria-label="Buscar contato pelo nome"
              />
              {contactSearch && (
                <Button variant="ghost" size="icon" onClick={clearContactSearch}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-6 h-6 hover:bg-transparent" aria-label="Limpar busca">
                  <X className="w-3 h-3 text-muted-foreground" />
                </Button>
              )}
            </div>
          ) : (
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/60" />
              <Input
                ref={contactSearchRef}
                placeholder="Buscar contato..."
                value={contactSearch}
                onChange={(e) => handleContactSearch(e.target.value)}
                className="pl-7 pr-7 bg-muted/40 border-0 rounded-md h-7 text-[11px] placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-primary/30"
                aria-label="Buscar contato pelo nome"
              />
              {contactSearch && (
                <Button variant="ghost" size="icon" onClick={clearContactSearch}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-5 h-5 hover:bg-transparent" aria-label="Limpar busca">
                  <X className="w-3 h-3 text-muted-foreground" />
                </Button>
              )}
            </div>
          )}
          <div className={cn("shrink-0", isMobile ? "w-[130px]" : "w-[130px]")}>
            <ContactTypeFilter value={inboxFilters.selectedContactType} onChange={inboxFilters.handleContactTypeChange} conversations={inbox.cachedConversations} />
          </div>
        </div>

        <TicketTabs
          conversations={inbox.conversations}
          mainTab={inboxFilters.mainTab}
          subTab={inboxFilters.subTab}
          onMainTabChange={inboxFilters.setMainTab}
          onSubTabChange={inboxFilters.setSubTab}
          showAll={inboxFilters.showAll}
          onShowAllChange={inboxFilters.setShowAll}
          selectedQueueId={inboxFilters.selectedQueueId}
          onQueueChange={inboxFilters.setSelectedQueueId}
        />

        <InboxFilters filters={inboxFilters.filters} onFiltersChange={inboxFilters.setFilters} />
      </div>

      {isMobile && (
        <MobilePullToRefreshIndicator
          isRefreshing={pullToRefresh.isRefreshing}
          pullProgress={pullToRefresh.pullProgress}
          pullDistance={pullToRefresh.pullDistance}
        />
      )}

      <div
        ref={pullToRefresh.containerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden"
        {...(isMobile ? pullToRefresh.handlers : {})}
      >
        {inbox.loading ? (
          <div className="p-3 space-y-1">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3, ease: 'easeOut' }}
                className="flex items-center gap-3 p-2.5 rounded-xl"
              >
                <Skeleton className="w-11 h-11 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3.5 rounded-md" style={{ width: `${60 + Math.random() * 40}%` }} />
                    <Skeleton className="h-3 w-10 rounded-md" />
                  </div>
                  <Skeleton className="h-3 rounded-md" style={{ width: `${40 + Math.random() * 30}%` }} />
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
            />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
