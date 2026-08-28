import { useEffect, lazy, Suspense } from 'react';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { usePullToRefresh } from '@/hooks/ui/usePullToRefresh';
import { MiniChatPiP } from '@/components/mobile/MiniChatPiP';
import { NewMessageIndicator } from './NewMessageIndicator';
import { InboxEmptyChat } from './InboxEmptyChat';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import { ConversationListSidebar } from './ConversationListSidebar';
import { useGlobalSearchShortcut } from '@/hooks/ui/useGlobalSearchShortcut';
import { useInboxBulkActions } from '@/hooks/inbox/useInboxBulkActions';
import { useInboxFilters } from '@/hooks/inbox/useInboxFilters';
import { useRealtimeInbox } from '@/hooks/inbox/useRealtimeInbox';
import { WifiOff, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ChatPanel = lazy(() => import('./ChatPanel').then(m => ({ default: m.ChatPanel })));
const ContactDetails = lazy(() => import('./ContactDetails').then(m => ({ default: m.ContactDetails })));
const ContactDetailsResponsive = lazy(() => import('./ContactDetailsResponsive').then(m => ({ default: m.ContactDetailsResponsive })));
const GlobalSearch = lazy(() => import('./GlobalSearch').then(m => ({ default: m.GlobalSearch })));
const NewConversationModal = lazy(() => import('./NewConversationModal').then(m => ({ default: m.NewConversationModal })));

const ChatFallback = () => (
  <div className="flex-1 flex items-center justify-center">
    <Loader2 className="w-6 h-6 text-primary animate-spin" />
  </div>
);

interface SearchResult {
  id: string;
  type: 'message' | 'contact' | 'transcription' | 'action' | 'crm';
  title: string;
  preview: string;
  timestamp: Date;
  contactId?: string;
  contactName?: string;
  messageType?: string;
  tags?: string[];
  action?: () => void;
  crmPhone?: string;
}

export function RealtimeInboxView() {
  const isMobile = useIsMobile();
  const inbox = useRealtimeInbox();
  const inboxFilters = useInboxFilters({ conversations: inbox.cachedConversations, profileId: inbox.profile?.id });
  const bulkActions = useInboxBulkActions({ refetch: inbox.refetch, filteredConversations: inboxFilters.filteredConversations });
  const pullToRefresh = usePullToRefresh({ onRefresh: async () => { await inbox.refetch(); }, disabled: !isMobile || !!inbox.selectedContactId });

  useGlobalSearchShortcut({ onOpen: () => inbox.setGlobalSearchOpen(true) });

  useEffect(() => {
    if (!inbox.pendingContactId || inbox.loading) return;
    
    const handlePendingContact = async () => {
      inboxFilters.setMainTab('search');
      inboxFilters.setSubTab('attending');
      await inbox.setSelectedContactId(inbox.pendingContactId);
      await inbox.setSelectedContact(inbox.pendingContactId!);
      await inbox.markAsRead(inbox.pendingContactId!);
      inbox.setPendingContactId(null);
    };

    handlePendingContact();
  }, [inbox.pendingContactId, inbox.loading]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.getAttribute('contenteditable') === 'true';
      if (isInput) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); bulkActions.selectAll(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && bulkActions.selectionMode && bulkActions.selectedIds.size > 0) { e.preventDefault(); bulkActions.bulkArchive(); }
      if (e.key === 'Escape' && bulkActions.selectionMode) { e.preventDefault(); bulkActions.clearSelection(); }
      if (e.key === 'r' && bulkActions.selectionMode && bulkActions.selectedIds.size > 0 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); bulkActions.bulkMarkAsRead(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bulkActions]);

  const handleGlobalSearchResult = (result: SearchResult) => {
    if (result.contactId) inbox.handleSelectConversation(result.contactId);
  };

  if (inbox.error) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <div className="text-center p-8">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4"><WifiOff className="w-8 h-8 text-destructive" /></div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Erro de conexão</h3>
          <p className="text-muted-foreground text-sm mb-4">{inbox.error}</p>
          <Button onClick={inbox.refetch} variant="outline"><RefreshCw className="w-4 h-4 mr-2" />Tentar novamente</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full relative bg-background overflow-hidden">
      {inbox.globalSearchOpen && (
        <Suspense fallback={null}><GlobalSearch open={inbox.globalSearchOpen} onOpenChange={inbox.setGlobalSearchOpen} onSelectResult={handleGlobalSearchResult} /></Suspense>
      )}

      <NewMessageIndicator show={!!inbox.newMessageNotification} contactName={inbox.newMessageNotification?.contactName || ''} contactAvatar={inbox.newMessageNotification?.contactAvatar} message={inbox.newMessageNotification?.message || ''} onView={inbox.handleNotificationView} onDismiss={inbox.dismissNotification} />

      {inbox.showNewConversation && (
        <Suspense fallback={null}>
          <NewConversationModal open={inbox.showNewConversation} onOpenChange={inbox.setShowNewConversation} onConversationStarted={(contactId) => { inbox.setSelectedContactId(contactId); inbox.refetch(); }} />
        </Suspense>
      )}

      <ConversationListSidebar inbox={inbox} inboxFilters={inboxFilters} bulkActions={bulkActions} pullToRefresh={pullToRefresh} />

      <div className={cn('flex-1 flex min-w-0 min-h-0 relative z-10 bg-background h-full overflow-hidden', isMobile && !inbox.selectedContactId && 'hidden')}>
        {inbox.legacyConversation ? (
          <Suspense fallback={<ChatFallback />}>
            <>
              <div className="flex-1 min-w-0 min-h-0 relative h-full overflow-hidden">
                {inbox.selectedContactId && inbox.selectedMessagesLoading ? <ChatFallback /> : (
                  <SectionErrorBoundary sectionName="Chat" className="h-full">
                    <ChatPanel
                      key={inbox.legacyConversation.id}
                      conversation={inbox.legacyConversation}
                      messages={inbox.legacyMessages}
                      onSendMessage={inbox.handleSendMessage}
                      onSendAudio={inbox.handleSendAudio}
                      showDetails={isMobile ? false : inbox.showDetails}
                      onToggleDetails={() => inbox.setShowDetails(!inbox.showDetails)}
                      onBack={isMobile ? () => {
                        if (inbox.legacyConversation) {
                          inbox.setPipContact({ name: inbox.legacyConversation.contact.name, avatar: inbox.legacyConversation.contact.avatar, lastMessage: inbox.legacyConversation.lastMessage?.content, contactId: inbox.legacyConversation.id });
                        }
                        inbox.setSelectedContactId(null);
                      } : undefined}
                    />
                  </SectionErrorBoundary>
                )}
              </div>
              {inbox.showDetails && (
                <SectionErrorBoundary sectionName="Detalhes do Contato">
                  <ContactDetailsResponsive key={`details-${inbox.legacyConversation.id}`} conversation={inbox.legacyConversation} onClose={() => inbox.setShowDetails(false)} />
                </SectionErrorBoundary>
              )}
            </>
          </Suspense>
        ) : <InboxEmptyChat />}
      </div>

      {inbox.usingCache && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-warning/90 text-warning-foreground text-xs text-center py-1.5 font-medium">📡 Modo offline — exibindo dados em cache</div>
      )}

      {isMobile && inbox.pipContact && !inbox.selectedContactId && (
        <MiniChatPiP contactName={inbox.pipContact.name} contactAvatar={inbox.pipContact.avatar} lastMessage={inbox.pipContact.lastMessage} isVisible={true}
          onExpand={() => { inbox.setSelectedContactId(inbox.pipContact!.contactId); inbox.setPipContact(null); }} onDismiss={() => inbox.setPipContact(null)} />
      )}
    </div>
  );
}
