import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense, type MouseEventHandler } from 'react';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { usePullToRefresh } from '@/hooks/ui/usePullToRefresh';
import { MiniChatPiP } from '@/components/mobile/MiniChatPiP';
import { resolverAbaAtiva, type TabState } from '@/components/inbox/resolveActiveTab';
import { NewMessageIndicator } from './NewMessageIndicator';
import { InboxEmptyChat } from './InboxEmptyChat';
import { ConversationEmptyState } from '@/components/shared/ConversationEmptyState';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import { ConversationListSidebar } from './ConversationListSidebar';
import { chipDoStatusReaberto } from './conversation-list/reopenChip';
import { useGlobalSearchShortcut } from '@/hooks/ui/useGlobalSearchShortcut';
import { useInboxBulkActions } from '@/hooks/inbox/useInboxBulkActions';
import { useInboxFilters } from '@/hooks/inbox/useInboxFilters';
import { useRealtimeInbox } from '@/hooks/inbox/useRealtimeInbox';
import { useConversationActions } from '@/hooks/chat/useConversationActions';
import { WifiOff, RefreshCw, Loader2, MessageSquarePlus, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ConversationTabs, type ConversationTab } from './chat/ConversationTabs';
import { ConversationTabContent } from './chat/ConversationTabContent';
import { useConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';
import { useContactCrm360 } from '@/hooks/crm/useContactCrm360';
import { useContactUnreadEmails } from '@/hooks/gmail/useContactUnreadEmails';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { useTalkMeQueue } from '@/features/talk-me/useTalkMeQueue';
import { TalkMeView } from '@/features/talk-me/TalkMeView';
import { LiquidMetalButton } from '@/components/ui/liquid-metal-button';
import { useFeatureFlag } from '@/hooks/system/useFeatureFlag';

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

interface TalkMeHeaderButtonProps {
  testId: string;
  count: number | null;
  countUnavailable: boolean;
  loading: boolean;
  queueName?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

function TalkMeHeaderButton({ testId, count, countUnavailable, loading, queueName, onClick }: TalkMeHeaderButtonProps) {
  const queueSuffix = queueName ? ` em ${queueName}` : '';
  const waitingLabel = count === null
    ? ''
    : `${count} ${count === 1 ? 'atendimento aguardando' : 'atendimentos aguardando'}`;
  const statusLabel = countUnavailable ? 'contagem de atendimentos indisponível' : waitingLabel;
  const accessibleStatus = statusLabel ? `: ${statusLabel}` : '';
  const titleStatus = statusLabel ? ` — ${statusLabel}` : '';

  return (
    <LiquidMetalButton
      data-testid={testId}
      data-talkme-trigger="1"
      label="TALK ME"
      count={count}
      loading={loading}
      compact
      aria-label={`TALK ME${accessibleStatus}${queueSuffix}`}
      title={`Abrir TALK ME${titleStatus}${queueSuffix}`}
      onClick={onClick}
    />
  );
}

function isVisibleTalkMeTrigger(element: HTMLButtonElement): boolean {
  if (!element.isConnected || element.disabled) return false;

  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      current.hidden
      || current.getAttribute('aria-hidden') === 'true'
      || current.classList.contains('hidden')
      || style.display === 'none'
      || style.visibility === 'hidden'
    ) return false;
    current = current.parentElement;
  }

  return true;
}

/**
 * Etapa 74 — a aba Tarefas monta sob demanda (lazy + Suspense), então o QuickAdd
 * ainda não existe no instante do atalho: tenta focar por alguns frames até ele
 * aparecer no DOM.
 */
function focarQuickAdd(tentativas = 20): void {
  const campo = document.querySelector<HTMLInputElement>('[data-testid="quick-add-input"]');
  if (campo) { campo.focus(); return; }
  if (tentativas > 0) window.requestAnimationFrame(() => focarQuickAdd(tentativas - 1));
}

/**
 * Diálogo ou menu flutuante aberto (padrão Radix usado no projeto).
 * Enquanto houver overlay, quem é dono do teclado é o overlay — os atalhos do
 * lote não podem agir por baixo dele (mesma checagem de `useKeyboardNavigation`).
 */
function overlayAberto(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
  );
}

/** Campo de edição de texto: o navegador é dono das teclas (Ctrl+A, Delete, r…). */
function focoEmCampoDeTexto(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable ||
    active.getAttribute('contenteditable') === 'true';
}

export function RealtimeInboxView() {
  const isMobile = useIsMobile();
  const inbox = useRealtimeInbox();
  const conversationActions = useConversationActions();
  // `snoozedIds` entra no filtro para a lista ativa suspender a conversa adiada e
  // retomá-la no vencimento do prazo (R2-INB-029).
  const inboxFilters = useInboxFilters({
    conversations: inbox.cachedConversations,
    profileId: inbox.profile?.id,
    snoozedIds: conversationActions.snoozedIds,
  });
  const bulkActions = useInboxBulkActions({ refetch: inbox.refetch, filteredConversations: inboxFilters.filteredConversations });
  const [talkMeOpen, setTalkMeOpen] = useState(false);
  const talkMeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const talkMeEnabled = useFeatureFlag('inbox.talk-me', false);
  const talkMe = useTalkMeQueue(talkMeOpen, talkMeEnabled);
  const talkMeCount = talkMe.queuesError ? null : (talkMe.selectedQueue?.waitingCount ?? null);
  const handleOpenTalkMe = useCallback<MouseEventHandler<HTMLButtonElement>>((event) => {
    talkMeTriggerRef.current = event.currentTarget;
    setTalkMeOpen(true);
  }, []);
  const handleTalkMeOpenChange = useCallback((open: boolean) => {
    setTalkMeOpen(open);
    if (open) return;

    const openingTrigger = talkMeTriggerRef.current;
    window.requestAnimationFrame(() => {
      const firstAvailableTrigger = document.querySelector<HTMLButtonElement>(
        '[data-talkme-trigger]:not([disabled])',
      );
      const availableTriggers = document.querySelectorAll<HTMLButtonElement>(
        '[data-talkme-trigger]:not([disabled])',
      );
      const trigger = [openingTrigger, firstAvailableTrigger, ...availableTriggers]
        .find((candidate): candidate is HTMLButtonElement =>
          candidate !== null && isVisibleTalkMeTrigger(candidate));
      trigger?.focus();
    });
  }, []);
  // Rostos das conversas fixadas exibidos no header do chat (ocupam o espaço
  // livre quando o painel de detalhes está fechado).
  const pinnedConversations = useMemo(
    () => inbox.cachedConversations
      .filter((c) => conversationActions.pinnedIds.has(c.contact.id))
      .map((c) => ({ id: c.contact.id, name: (c.contact.name || '').trim() || 'Sem nome', avatarUrl: c.contact.avatar_url })),
    [inbox.cachedConversations, conversationActions.pinnedIds],
  );

  const pullToRefresh = usePullToRefresh({ onRefresh: async () => { await inbox.refetch(); }, disabled: !isMobile || !!inbox.selectedContactId });

  // Aba ativa do painel central, ancorada no contato que a selecionou.
  // Ao trocar de conversa o id deixa de bater e o valor derivado volta a 'chat'
  // sem efeito nem setState em cascata — manter 'Notas' aberto ao clicar noutro
  // contato seria desorientador.
  const [tabState, setTabState] = useState<TabState>(
    // Etapa 73 — a aba persistida já chega normalizada ('reminders' → 'tasks').
    // `restaurada: true`: a preferência do localStorage vale como padrão da sessão,
    // inclusive na primeira conversa aberta depois do reload. Sem isso ela ficava
    // ancorada em `contactId: null` e morria no instante em que o usuário abria
    // qualquer conversa — descartada exatamente quando importava (medido em
    // produção em 03/10: item 6 do S41, persistia e não restaurava).
    () => ({ contactId: null, tab: inbox.conversationTab, restaurada: true })
  );
  const activeTab: ConversationTab = resolverAbaAtiva(tabState, inbox.selectedContactId);
  // `setConversationTab` desestruturado: chamá-lo como `inbox.setConversationTab`
  // faria o exhaustive-deps exigir o objeto `inbox` inteiro (recriado a cada render).
  const { setConversationTab } = inbox;
  const setActiveTab = useCallback(
    (tab: ConversationTab) => {
      setTabState({ contactId: inbox.selectedContactId, tab, restaurada: false });
      setConversationTab(tab);
    },
    [inbox.selectedContactId, setConversationTab]
  );
  const { counts: tabCounts } = useConversationTabCounts(inbox.selectedContactId);
  // Badge da aba SalesView vem do CRM 360° (client-side) — a RPC get_conversation_tab_counts não muda.
  const { data: crm360ForOrdersBadge } = useContactCrm360(inbox.selectedContactId);
  // Badge da SalesView = compras + propostas em aberto — a aba mostra as duas coisas.
  const tabExtraCounts = {
    orders: (crm360ForOrdersBadge?.purchases.length ?? 0) + (crm360ForOrdersBadge?.openDeals.length ?? 0),
  };
  // U03 — e-mails não lidos do contato (client-side, hook U02). O chip da barra de
  // abas só aparece com count > 0; o clique abre o módulo E-mail na conversa do
  // contato, pelo MESMO link do C03 (`emailContact`/`emailTo`). Erro de consulta
  // vira count 0 no hook → nenhum chip (sem alerta falso).
  const { count: unreadEmails } = useContactUnreadEmails(inbox.selectedContactId);
  const abrirEmailDoContato = useCallback(() => {
    const contato = inbox.legacyConversation?.contact;
    if (!contato) return;
    navigateToView('email-chat', { emailContact: contato.id, emailTo: contato.email ?? '' });
  }, [inbox.legacyConversation]);

  // L6 (paridade V3→V2, doc 11): a soma das não lidas da lista vira anúncio em
  // região `aria-live` quando SOBE. `null` marca a carga inicial: abrir a Inbox
  // já com conversas não lidas não é mensagem nova e não pode ser anunciado.
  const totalNaoLidas = useMemo(
    () => inbox.cachedConversations.reduce((total, c) => total + (c.unreadCount ?? 0), 0),
    [inbox.cachedConversations],
  );
  const totalNaoLidasAnteriorRef = useRef<number | null>(null);
  const anuncioNovasMensagensRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const anterior = totalNaoLidasAnteriorRef.current;
    totalNaoLidasAnteriorRef.current = totalNaoLidas;
    if (anterior === null || totalNaoLidas <= anterior) return;
    const novas = totalNaoLidas - anterior;
    const regiao = anuncioNovasMensagensRef.current;
    if (regiao) regiao.textContent = novas === 1 ? 'Nova mensagem recebida' : `${novas} novas mensagens`;
  }, [totalNaoLidas]);

  // "Usar resposta" (aba IA) — leva o texto sugerido para o input do Chat e troca de aba.
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const handleUseSuggestion = useCallback((text: string) => {
    setPendingDraft(text);
    setActiveTab('chat');
  }, [setActiveTab]);

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

    void handlePendingContact();
  // inbox e inboxFilters são facades recriadas a cada render; depender dos objetos
  // inteiros repetiria o deep-link enquanto as funções assíncronas atualizam estado.
  }, [inbox.pendingContactId, inbox.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Overlay aberto (diálogo/menu Radix): o teclado é dele.
      if (overlayAberto()) return;
      // Campo de texto: o navegador é dono (Ctrl+A seleciona o texto, Delete apaga…).
      if (focoEmCampoDeTexto()) return;
      const key = e.key.toLowerCase();
      // Ctrl+A só seleciona o lote DENTRO do modo de seleção (iniciado pela lista);
      // fora dele, Ctrl+A continua sendo a seleção de texto do navegador.
      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        if (!bulkActions.selectionMode) return;
        e.preventDefault(); bulkActions.selectAll(); return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && bulkActions.selectionMode && bulkActions.selectedIds.size > 0) { e.preventDefault(); bulkActions.bulkArchive(); }
      if (e.key === 'Escape' && bulkActions.selectionMode) { e.preventDefault(); bulkActions.clearSelection(); }
      if (key === 'r' && bulkActions.selectionMode && bulkActions.selectedIds.size > 0 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); bulkActions.bulkMarkAsRead(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bulkActions]);

  // Etapa 74 — Alt+T (atalho global 'open-tasks-tab') abre a aba Tarefas desta
  // conversa e leva o foco para o QuickAdd assim que ele monta.
  useEffect(() => {
    const abrirTarefas = () => {
      setActiveTab('tasks');
      focarQuickAdd();
    };
    window.addEventListener('inbox-open-tasks-tab', abrirTarefas);
    return () => window.removeEventListener('inbox-open-tasks-tab', abrirTarefas);
  }, [setActiveTab]);

  const handleGlobalSearchResult = (result: SearchResult) => {
    if (result.contactId) inbox.handleSelectConversation(result.contactId);
  };

  // R2-INB-015: com um cache válido a Inbox continua utilizável offline. A tela
  // de erro global só substitui a UI quando NÃO há cache para sustentá-la —
  // antes ela engolia o recorte em cache tão logo a carga falhava.
  if (inbox.error && !inbox.usingCache) {
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
      {/* L6: região viva só da Inbox. `role="status"` + `aria-live="polite"` e
          texto escrito por efeito (sem estado) — id próprio para não colidir com
          a região de rotas do `useAriaAnnouncer`. */}
      <div
        ref={anuncioNovasMensagensRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="inbox-novas-mensagens"
        className="sr-only"
      />
      {inbox.globalSearchOpen && (
        <Suspense fallback={null}>
          <GlobalSearch
            open={inbox.globalSearchOpen}
            onOpenChange={inbox.setGlobalSearchOpen}
            onSelectResult={handleGlobalSearchResult}
            // R2-INB-018: a ação rápida tem de executar a intenção — abre o
            // NewConversationModal desta tela em vez de só fechar a busca.
            onNewConversation={() => inbox.setShowNewConversation(true)}
          />
        </Suspense>
      )}

      <NewMessageIndicator show={!!inbox.newMessageNotification} contactName={inbox.newMessageNotification?.contactName || ''} contactAvatar={inbox.newMessageNotification?.contactAvatar} message={inbox.newMessageNotification?.message || ''} onView={inbox.handleNotificationView} onDismiss={inbox.dismissNotification} />

      {inbox.showNewConversation && (
        <Suspense fallback={null}>
          <NewConversationModal open={inbox.showNewConversation} onOpenChange={inbox.setShowNewConversation} onConversationStarted={(contactId) => { inbox.setSelectedContactId(contactId); inbox.refetch(); }} />
        </Suspense>
      )}

      {talkMeEnabled && (
        <TalkMeView
          open={talkMeOpen}
          onOpenChange={handleTalkMeOpenChange}
          controller={talkMe}
          onAccepted={async (contactId) => {
            await inbox.refetch();
            inbox.handleSelectConversation(contactId);
          }}
        />
      )}

      {!(isMobile && inbox.selectedContactId) && (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => inbox.setShowNewConversation(true)}
              className={cn(
                "fixed bottom-24 right-6 z-50 flex items-center justify-center rounded-full border border-primary/20 bg-gradient-to-br from-primary via-primary to-secondary text-primary-foreground shadow-xl shadow-primary/20 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 active:scale-95",
                isMobile ? "h-[44px] w-[44px]" : "h-[54px] w-[54px]",
              )}
              aria-label="Nova conversa"
            >
              <MessageSquarePlus className={cn("h-6 w-6", isMobile && "h-5 w-5")} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={8}>
            Nova Conversa
          </TooltipContent>
        </Tooltip>
      )}

      <ConversationListSidebar
        inbox={inbox}
        inboxFilters={inboxFilters}
        bulkActions={bulkActions}
        pullToRefresh={pullToRefresh}
        conversationActions={conversationActions}
        onOpenTalkMe={handleOpenTalkMe}
        talkMeCount={talkMe.queuesError ? null : (talkMe.selectedQueue?.waitingCount ?? null)}
        talkMeCountUnavailable={Boolean(talkMe.queuesError)}
        talkMeLoading={talkMe.queuesLoading}
        talkMeQueueName={talkMe.selectedQueue?.name}
        talkMeEnabled={talkMeEnabled}
      />

      <div className={cn('flex-1 flex min-w-0 min-h-0 relative z-10 bg-background h-full overflow-hidden', isMobile && !inbox.selectedContactId && 'hidden')}>
        {inbox.legacyConversation ? (
          <Suspense fallback={<ChatFallback />}>
            <>
              <div className="flex-1 min-w-0 min-h-0 relative h-full overflow-hidden flex flex-col">
                <ConversationTabs
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  counts={tabCounts}
                  extraCounts={tabExtraCounts}
                  emailUnread={{ count: unreadEmails, onOpen: abrirEmailDoContato }}
                  trailingAction={talkMeEnabled ? (
                    <TalkMeHeaderButton
                      testId="talk-me-button"
                      count={talkMeCount}
                      countUnavailable={Boolean(talkMe.queuesError)}
                      loading={talkMe.queuesLoading}
                      queueName={talkMe.selectedQueue?.name}
                      onClick={handleOpenTalkMe}
                    />
                  ) : null}
                />
                {/* R2-INB-024: a carga das mensagens desta conversa falhou. O `loading` do
                    hook termina mesmo no erro, então sem este ramo o painel caía no ChatPanel
                    com zero mensagens — ilegível como "falha" e igual a um contato sem histórico,
                    sem caminho de retry. O retry é o refetch DESTA consulta, não da lista global. */}
                {inbox.selectedMessagesError && inbox.legacyMessages.length === 0 ? (
                  <div role="alert" className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4"><WifiOff className="w-8 h-8 text-destructive" /></div>
                      <h3 className="text-lg font-semibold text-foreground mb-2">Erro ao carregar as mensagens</h3>
                      <p className="text-muted-foreground text-sm mb-4 break-words">{inbox.selectedMessagesError}</p>
                      <Button onClick={() => { void inbox.refetchSelectedMessages(); }} variant="outline"><RefreshCw className="w-4 h-4 mr-2" />Tentar novamente</Button>
                    </div>
                  </div>
                ) : inbox.selectedContactId && inbox.selectedMessagesLoading ? <ChatFallback /> : (
                  <ConversationTabContent
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    conversation={inbox.legacyConversation}
                    messages={inbox.legacyMessages}
                    onUseSuggestion={handleUseSuggestion}
                    profileId={inbox.profile?.id ?? null}
                  >
                  <SectionErrorBoundary sectionName="Chat" className="h-full">
                    <ChatPanel
                      key={inbox.legacyConversation.id}
                      conversation={inbox.legacyConversation}
                      messages={inbox.legacyMessages}
                      onSendMessage={inbox.handleSendMessage}
                      onSendAudio={inbox.handleSendAudio}
                      pendingDraft={pendingDraft}
                      onDraftConsumed={() => setPendingDraft(null)}
                      showDetails={isMobile ? false : inbox.showDetails}
                      onToggleDetails={() => inbox.setShowDetails(!inbox.showDetails)}
                      onBack={isMobile ? () => {
                          if (inbox.legacyConversation) {
                            inbox.setPipContact({ name: inbox.legacyConversation.contact.name, avatar: inbox.legacyConversation.contact.avatar ?? undefined, lastMessage: inbox.legacyConversation.lastMessage?.content, contactId: inbox.legacyConversation.id });
                          }
                          inbox.setSelectedContactId(null);
                        } : undefined}
                      isFavorite={conversationActions.isFavorite(inbox.legacyConversation.contact.id)}
                      onToggleFavorite={() => {
                        if (!inbox.legacyConversation) return;
                        const id = inbox.legacyConversation.contact.id;
                        if (conversationActions.isFavorite(id)) conversationActions.unfavoriteContact(id);
                        else conversationActions.favoriteContact(id);
                      }}
                      onArchiveConversation={() => {
                        if (!inbox.legacyConversation) return;
                        conversationActions.archiveContact(inbox.legacyConversation.contact.id);
                      }}
                      onReopenConversation={async () => {
                        if (!inbox.legacyConversation) return;
                        const resultado = await conversationActions.reopenConversation(inbox.legacyConversation.contact.id);
                        if (!resultado) throw new Error('Falha ao reabrir conversa');
                        // Mesmo retorno de filtro da lista: a conversa sai do chip
                        // Resolvidas/Arquivadas e vai para onde ela agora aparece.
                        inboxFilters.setChipTab(chipDoStatusReaberto(resultado.status));
                        inbox.refetch();
                      }}
                      pinnedConversations={pinnedConversations}
                      onSelectPinned={inbox.handleSelectConversation}
                      hasOlderMessages={inbox.hasOlderMessages}
                      loadingOlderMessages={inbox.loadingOlderMessages}
                      onLoadOlderMessages={inbox.loadOlderMessages}
                    />
                  </SectionErrorBoundary>
                  </ConversationTabContent>
                )}
              </div>
              {inbox.showDetails && (
                <SectionErrorBoundary sectionName="Detalhes do Contato">
                  {/*
                    Suspense isolado — CRÍTICO: evita que o lazy-load de
                    ContactDetailsResponsive suspenda o Suspense pai e desmonte
                    o ChatPanel, causando React error #301 (too many re-renders).
                    Sem este wrapper, cada toggle de showDetails crashava o Chat.
                  */}
                  <Suspense fallback={null}>
                    <ContactDetailsResponsive key={`details-${inbox.legacyConversation.id}`} conversation={inbox.legacyConversation} onClose={() => inbox.setShowDetails(false)} />
                  </Suspense>
                </SectionErrorBoundary>
              )}
            </>
          </Suspense>
        ) : (
          <div className="flex h-full min-h-0 flex-1 flex-col">
            {!isMobile && talkMeEnabled && (
              <div className="flex h-[58px] shrink-0 items-center justify-end border-b border-border px-3">
                <TalkMeHeaderButton
                  testId="talk-me-button-empty"
                  count={talkMeCount}
                  countUnavailable={Boolean(talkMe.queuesError)}
                  loading={talkMe.queuesLoading}
                  queueName={talkMe.selectedQueue?.name}
                  onClick={handleOpenTalkMe}
                />
              </div>
            )}
            {inbox.selectedContactId && inbox.selectedContactFallbackStatus === 'loading' ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 aria-hidden="true" className="w-6 h-6 text-primary motion-safe:animate-spin" />
              </div>
            ) : inbox.selectedContactId && (inbox.selectedContactFallbackStatus === 'not-found' || inbox.selectedContactFallbackStatus === 'error') ? (
              // Link/notificação/busca abriram um contato que não veio na lista e não
              // pôde ser carregado: mostra o motivo em vez de uma área de chat muda.
              <ConversationEmptyState
                icon={inbox.selectedContactFallbackStatus === 'not-found' ? UserX : WifiOff}
                title={inbox.selectedContactFallbackStatus === 'not-found' ? 'Conversa não encontrada' : 'Não foi possível abrir a conversa'}
                description={
                  inbox.selectedContactFallbackStatus === 'not-found'
                    ? 'O link é inválido ou você não tem acesso a este contato.'
                    : (inbox.selectedContactFallbackError ?? 'Houve uma falha ao carregar o contato.')
                }
                action={<Button variant="outline" onClick={() => inbox.setSelectedContactId(null)}>Voltar à lista</Button>}
                className="bg-inbox-panel overflow-hidden"
              />
            ) : (
              <InboxEmptyChat
                waitingCount={inboxFilters.chipCounts?.waiting ?? 0}
                unreadCount={inboxFilters.chipCounts?.unread ?? 0}
                onNewConversation={() => inbox.setShowNewConversation(true)}
              />
            )}

          </div>
        )}
      </div>

      {inbox.usingCache && (
        <div
          data-testid="inbox-offline-cache-banner"
          className="absolute top-0 left-0 right-0 z-50 bg-warning/90 text-warning-foreground text-xs text-center py-1.5 font-medium"
        >
          🚧 Modo offline — exibindo dados em cache
          {/* R2-INB-015: identifica o recorte — a conversa ativa está mostrando
              as mensagens guardadas no cache, não as carregadas ao vivo. */}
          {inbox.selectedMessagesFromCache && (
            <span data-testid="inbox-offline-cache-messages"> · mensagens da conversa vindas do cache</span>
          )}
        </div>
      )}

      {isMobile && inbox.pipContact && !inbox.selectedContactId && (
        <MiniChatPiP contactName={inbox.pipContact.name} contactAvatar={inbox.pipContact.avatar} lastMessage={inbox.pipContact.lastMessage} isVisible={true}
          onExpand={() => { inbox.setSelectedContactId(inbox.pipContact!.contactId); inbox.setPipContact(null); }} onDismiss={() => inbox.setPipContact(null)} />
      )}
    </div>
  );
}
