import { useState, useRef, useEffect, lazy, Suspense, useReducer, useCallback, useMemo, startTransition, type ReactNode } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { Conversation, Message } from '@/types/chat';
import { FileUploaderRef } from './FileUploader';
import { useTypingPresence } from '@/hooks/chat/useTypingPresence';
import { useEvolutionApi } from '@/hooks/integrations/useEvolutionApi';
import { useQuickReplies } from '@/hooks/chat/useQuickReplies';
import { useTextToSpeech } from '@/hooks/communication/useTextToSpeech';
import { useUserSettings } from '@/hooks/system/useUserSettings';
import { toast } from '@/hooks/ui/use-toast';
import { useScheduledMessages } from '@/hooks/chat/useScheduledMessages';
import { useMessageSignature } from '@/hooks/chat/useMessageSignature';
import { useChatMediaSending } from './useChatMediaSending';
import { CRMAutoSync } from './CRMAutoSync';
import { ChatToolPanels } from './chat/ChatToolPanels';
import { ChatDialogs } from './chat/ChatDialogs';
import { ChatPanelHeader } from './chat/ChatPanelHeader';
import { ChatMessagesArea, ChatMessagesAreaRef } from './chat/ChatMessagesArea';
import { ChatInputArea } from './chat/ChatInputArea';
import { ChatDragOverlay } from './chat/ChatDragOverlay';
import { ChatQuickRepliesPopover } from './chat/ChatQuickRepliesPopover';
import { ChatSearchBar } from './chat/ChatSearchBar';
import { useChatPanelHandlers } from './chat/useChatPanelHandlers';
import { TabBanner } from './tabs/TabBanner';
import type { ConversationTab } from './chat/ConversationTabs';
import { ChevronUp, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

const WhisperMode = lazy(() => import('./WhisperMode').then(m => ({ default: m.WhisperMode })));

if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  (window as Window).requestIdleCallback(() => {
    import('./TransferDialog');
    import('./AIConversationAssistant');
    import('./CloseConversationDialog');
  });
}

interface ChatPanelProps {
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (content: string) => void | Promise<void>;
  onSendAudio?: (blob: Blob) => Promise<void>;
  showDetails?: boolean;
  onToggleDetails?: () => void;
  onBack?: () => void;
  hideHeader?: boolean;
  /** Texto vindo da aba IA ("Usar resposta") — aplicado ao input e consumido uma única vez. */
  pendingDraft?: string | null;
  onDraftConsumed?: () => void;
  activeTab?: ConversationTab;
  tabNavigation?: ReactNode;
  tabContent?: ReactNode;
  onSelectAssistantTab?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void | Promise<void>;
}

type DialogKey = 'quickReplies' | 'slashCommands' | 'transferDialog' | 'scheduleDialog' | 
  'callDialog' | 'globalSearch' | 'chatSearch' | 'interactiveBuilder' | 'forwardDialog' | 
  'locationPicker' | 'aiAssistant' | 'catalogDirect' | 'whisper' | 'templatesWithVars' | 
  'realtimeTranscription' | 'closeDialog';

type DialogState = Record<DialogKey, boolean>;
type DialogAction = 
  | { type: 'TOGGLE'; key: DialogKey }
  | { type: 'OPEN'; key: DialogKey }
  | { type: 'CLOSE'; key: DialogKey }
  | { type: 'RESET'; keys: DialogKey[] };

const initialDialogState: DialogState = {
  quickReplies: false, slashCommands: false, transferDialog: false, scheduleDialog: false,
  callDialog: false, globalSearch: false, chatSearch: false, interactiveBuilder: false,
  forwardDialog: false, locationPicker: false, aiAssistant: false, catalogDirect: false,
  whisper: false, templatesWithVars: false, realtimeTranscription: false, closeDialog: false,
};

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case 'TOGGLE': return { ...state, [action.key]: !state[action.key] };
    case 'OPEN': return state[action.key] ? state : { ...state, [action.key]: true };
    case 'CLOSE': return state[action.key] ? { ...state, [action.key]: false } : state;
    case 'RESET': {
      const next = { ...state };
      let changed = false;
      for (const k of action.keys) { if (next[k]) { next[k] = false; changed = true; } }
      return changed ? next : state;
    }
    default: return state;
  }
}

type ActiveTool = 'chatSearch' | 'objections' | 'university' | 'aiAssistant' | 'summary' | null;

export function ChatPanel({
  conversation,
  messages,
  onSendMessage,
  onSendAudio,
  showDetails = false,
  onToggleDetails,
  onBack,
  hideHeader = false,
  pendingDraft,
  onDraftConsumed,
  activeTab = 'chat',
  tabNavigation,
  tabContent,
  onSelectAssistantTab,
  isFavorite = false,
  onToggleFavorite,
  hasOlderMessages = false,
  loadingOlderMessages = false,
  onLoadOlderMessages,
}: ChatPanelProps) {
  const [dialogs, dispatch] = useReducer(dialogReducer, initialDialogState);
  const openDialog = useCallback((key: DialogKey) => dispatch({ type: 'OPEN', key }), []);
  const closeDialog = useCallback((key: DialogKey) => dispatch({ type: 'CLOSE', key }), []);

  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const handleSetActiveTool = useCallback((tool: ActiveTool) => {
    setActiveTool(prev => prev === tool ? null : tool);
  }, []);

  const [callDirection, setCallDirection] = useState<'inbound' | 'outbound'>('outbound');
  const [highlightedMessageIds, setHighlightedMessageIds] = useState<Set<string>>(new Set());
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const fileUploaderRef = useRef<FileUploaderRef>(null);
  const messagesAreaRef = useRef<ChatMessagesAreaRef>(null);
  const dragCounterRef = useRef(0);

  const { isContactTyping, typingUsers, handleTypingStart, handleTypingStop } = useTypingPresence({
    conversationId: conversation.id, currentUserId: 'agent', currentUserName: conversation.assignedTo?.name || 'Agente',
  });
  const { quickReplies: dbQuickReplies, incrementUseCount } = useQuickReplies();
  const { settings, updateSettings, saveSettings } = useUserSettings();
  const { editMessage } = useEvolutionApi();
  const { scheduleMessage } = useScheduledMessages(conversation.contact.id);
  const { signatureEnabled, agentName, toggleSignature, applySignature } = useMessageSignature();
  const { instanceName, initResolve, handleSendSticker, handleSendCustomEmoji, handleSendAudioMeme } = useChatMediaSending(conversation.contact.id, conversation.contact.phone);

  const handleVoiceChange = useCallback((v: string) => { updateSettings({ tts_voice_id: v }); setTimeout(() => saveSettings(), 100); }, [updateSettings, saveSettings]);
  const handleSpeedChange = useCallback((s: number) => { updateSettings({ tts_speed: s }); setTimeout(() => saveSettings(), 100); }, [updateSettings, saveSettings]);
  const { speak, stop, isLoading: ttsLoading, isPlaying: ttsPlaying, currentMessageId: ttsMessageId, voiceId, setVoiceId, speed, setSpeed } = useTextToSpeech({
    initialVoiceId: settings.tts_voice_id, initialSpeed: settings.tts_speed, onVoiceChange: handleVoiceChange, onSpeedChange: handleSpeedChange,
  });

  const handlers = useChatPanelHandlers({
    conversationId: conversation.id, contactId: conversation.contact.id, contactPhone: conversation.contact.phone,
    instanceName, onSendMessage, editMessageApi: editMessage, applySignature,
    handleTypingStart, handleTypingStop, openDialog: openDialog as any, closeDialog: closeDialog as any, handleSetActiveTool,
  });

  useEffect(() => { initResolve(); }, [conversation.contact.id, initResolve]);
  useEffect(() => {
    if (activeTab === 'chat' && messagesAreaRef.current?.isNearBottom()) {
      messagesAreaRef.current.scrollToBottom();
    }
  }, [activeTab, messages.length, isContactTyping]);
  // Resets UI-only state when conversation changes; startTransition avoids
  // calling setState synchronously in the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    startTransition(() => {
      setActiveTool(null); setHighlightedMessageIds(new Set()); setActiveHighlightId(null); setSearchQuery('');
    });
  }, [conversation.id]);

  useEffect(() => {
    if (!pendingDraft) return;
    handlers.setInputValue(pendingDraft);
    handlers.inputRef.current?.focus();
    onDraftConsumed?.();
  }, [pendingDraft, onDraftConsumed, handlers]);

  const canGenerateSummary = messages.length >= 10;

  // Memoize expensive derived arrays to avoid re-creation on every keystroke
  const lastContactMessages = useMemo(
    () => messages.filter(m => m.sender === 'contact').slice(-5).map(m => m.content),
    [messages]
  );
  const allMessagesForHeader = useMemo(
    () => messages.map(m => ({ id: m.id, content: m.content, sender: m.sender, timestamp: m.timestamp.toISOString() })),
    [messages]
  );
  const filteredQuickReplies = useMemo(
    () => handlers.inputValue.startsWith('/')
      ? dbQuickReplies.filter((reply) => reply.shortcut.toLowerCase().includes(handlers.inputValue.slice(1).toLowerCase()))
      : dbQuickReplies,
    [dbQuickReplies, handlers.inputValue]
  );

  const handlePanelKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase('pt-BR') === 'f') {
      event.preventDefault();
      handleSetActiveTool('chatSearch');
    }
  }, [handleSetActiveTool]);

  // Allows the contact side panel to reuse the canonical transfer dialog without
  // duplicating its state or transfer implementation. Ignore events for stale panels.
  useEffect(() => {
    const handleOpenTransfer = (event: Event) => {
      const detail = (event as CustomEvent<{ contactId?: string }>).detail;
      if (!detail?.contactId || detail.contactId !== conversation.contact.id) return;
      openDialog('transferDialog');
    };
    window.addEventListener('zapp:open-transfer-dialog', handleOpenTransfer);
    return () => window.removeEventListener('zapp:open-transfer-dialog', handleOpenTransfer);
  }, [conversation.contact.id, openDialog]);

  // Stable refs for ChatMessagesArea to prevent re-renders on input change
  const contactJid = useMemo(() => conversation.contact.phone ? `${conversation.contact.phone}@s.whatsapp.net` : '', [conversation.contact.phone]);
  const contactAvatar = conversation.contact.avatar || undefined;
  const handleScrollToMessage = useCallback((id: string) => messagesAreaRef.current?.scrollToMessage(id), []);

  const handleQuickReply = (reply: { id: string; title: string; shortcut: string; content: string; category: string }) => {
    handlers.setInputValue(reply.content); closeDialog('quickReplies'); incrementUseCount(reply.id);
  };

  const handleTransfer = async (type: 'agent' | 'queue' | 'connection', targetId: string) => {
    const update = type === 'agent'
      ? { assigned_to: targetId }
      : type === 'queue'
        ? { queue_id: targetId, assigned_to: null }
        : { whatsapp_connection_id: targetId };
    const { error } = await supabase.from('contacts').update(update).eq('id', conversation.contact.id);
    if (error) {
      toast({ title: 'Erro ao transferir', description: 'A conversa não foi alterada.', variant: 'destructive' });
      throw error;
    }
    toast({
      title: 'Conversa transferida',
      description: type === 'agent'
        ? 'O novo atendente foi confirmado.'
        : type === 'queue'
          ? 'A nova fila foi confirmada.'
          : 'A nova conexão foi confirmada.',
    });
  };

  const handleScheduleMessage = async (message: string, scheduledAt: Date, attachment?: File) => {
    try {
      let mediaUrl: string | undefined;
      let messageType = 'text';
      if (attachment) {
        const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const uniqueName = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const fileName = `${conversation.contact.id}/${uniqueName}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('whatsapp-media').upload(fileName, attachment);
        if (uploadError) throw uploadError;
        const { data: locatorData } = supabase.storage.from('whatsapp-media').getPublicUrl(fileName);
        if (!locatorData?.publicUrl) throw new Error('Não foi possível criar a referência durável do anexo');
        mediaUrl = locatorData.publicUrl;
        messageType = attachment.type.startsWith('audio') ? 'audio' : attachment.type.startsWith('image') ? 'image' : attachment.type.startsWith('video') ? 'video' : 'document';
      }
      await scheduleMessage({ contactId: conversation.contact.id, content: message, scheduledAt, messageType, mediaUrl });
      closeDialog('scheduleDialog');
    } catch (err) {
      log.error('Failed to schedule message:', err);
      toast({ title: 'Erro ao agendar', description: 'A mensagem não foi agendada.', variant: 'destructive' });
      throw err;
    }
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; if (e.dataTransfer.types.includes('Files')) setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDraggingOver(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && fileUploaderRef.current) fileUploaderRef.current.handleExternalFiles(files);
  };

  return (
    <div className="relative flex h-full min-h-0 min-w-0 overflow-hidden bg-background" onKeyDown={handlePanelKeyDown} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
      <ChatDragOverlay isDraggingOver={isDraggingOver} />
      <CRMAutoSync conversation={conversation} messageCount={messages.length} messages={messages} />

      <div className="flex flex-col flex-1 h-full min-h-0 min-w-0 overflow-hidden">
        {!hideHeader && (
          <ChatPanelHeader conversation={conversation} isContactTyping={isContactTyping} showAIAssistant={activeTool === 'aiAssistant'} showDetails={showDetails}
            showSummaryPanel={activeTool === 'summary'} activeTool={activeTool} onSetActiveTool={handleSetActiveTool}
            voiceId={voiceId} speed={speed} onToggleAIAssistant={() => handleSetActiveTool('aiAssistant')} onToggleDetails={onToggleDetails}
            onStartCall={() => { setCallDirection('outbound'); openDialog('callDialog'); }} onOpenSearch={() => handleSetActiveTool('chatSearch')}
            onOpenTransfer={() => openDialog('transferDialog')} onOpenSchedule={() => openDialog('scheduleDialog')}
            onVoiceChange={setVoiceId} onSpeedChange={setSpeed} onBack={onBack}
            onGenerateSummary={() => handleSetActiveTool('summary')} isSummaryLoading={false} canGenerateSummary={canGenerateSummary}
            onCloseConversation={() => openDialog('closeDialog')}
            lastMessages={lastContactMessages}
            allMessages={allMessagesForHeader}
            onSelectSuggestion={(text) => handlers.setInputValue(text)}
            isFavorite={isFavorite}
            onToggleFavorite={onToggleFavorite} />
        )}

        {tabNavigation}

        <ChatSearchBar messages={messages} isOpen={activeTool === 'chatSearch'}
          onClose={() => { handleSetActiveTool('chatSearch'); setTimeout(() => handlers.inputRef.current?.focus(), 150); }}
          onNavigateToMessage={(id) => messagesAreaRef.current?.scrollToMessage(id)}
          onHighlightChange={(ids, activeId) => { setHighlightedMessageIds(ids); setActiveHighlightId(activeId); }}
          onSearchQueryChange={setSearchQuery} />

        {activeTab === 'chat' ? (
          <div
            id="conversation-tabpanel-chat"
            role="tabpanel"
            aria-labelledby="conversation-tab-chat"
            tabIndex={0}
            className="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <div className="px-3 pt-3">
              <TabBanner
                icon={Sparkles}
                title="Assistente IA"
                description="Sugestões de resposta, identificação de intenção e próximos passos."
                action={onSelectAssistantTab ? {
                  label: 'Ver sugestões',
                  onClick: onSelectAssistantTab,
                } : undefined}
                dismissKey="inbox-ai-banner-dismissed"
                testId="chat-ai-banner"
              />
            </div>

            {hasOlderMessages && onLoadOlderMessages && (
              <div className="flex shrink-0 justify-center px-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void onLoadOlderMessages()}
                  disabled={loadingOlderMessages}
                  className="h-8 gap-1.5 rounded-lg px-3 text-xs text-muted-foreground"
                >
                  {loadingOlderMessages
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    : <ChevronUp className="h-3.5 w-3.5" />}
                  {loadingOlderMessages ? 'Carregando mensagens…' : 'Carregar mensagens anteriores'}
                </Button>
              </div>
            )}

            <ChatMessagesArea ref={messagesAreaRef} messages={messages} isContactTyping={isContactTyping} typingUserName={typingUsers[0]?.name || conversation.contact.name}
              ttsLoading={ttsLoading} ttsPlaying={ttsPlaying} ttsMessageId={ttsMessageId} instanceName={instanceName}
              conversationId={conversation.id} contactJid={contactJid} contactAvatar={contactAvatar}
              onSpeak={speak} onStop={stop} onReply={handlers.handleReplyToMessage} onForward={handlers.handleForwardMessage} onCopy={handlers.handleCopyMessage}
              onScrollToMessage={handleScrollToMessage} onInteractiveButtonClick={handlers.handleInteractiveButtonClick} onEditStart={handlers.handleEditStart}
              highlightedMessageIds={highlightedMessageIds} activeHighlightId={activeHighlightId} searchQuery={searchQuery} />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">{tabContent}</div>
        )}

        <ChatQuickRepliesPopover show={dialogs.quickReplies} replies={filteredQuickReplies} onSelect={handleQuickReply} onClose={() => closeDialog('quickReplies')} />

        {dialogs.whisper && (
          <Suspense fallback={null}>
            <WhisperMode contactId={conversation.contact.id} className="mx-3 mb-2" />
          </Suspense>
        )}

        <ChatInputArea inputValue={handlers.inputValue} replyToMessage={handlers.replyToMessage} editingMessage={handlers.editingMessage} isRecordingAudio={handlers.isRecordingAudio}
          showSlashCommands={dialogs.slashCommands} contactId={conversation.contact.id} contactPhone={conversation.contact.phone}
          contactName={conversation.contact.name} instanceName={instanceName} messages={messages} quickReplies={dbQuickReplies} isSending={handlers.isSending}
          onInputChange={handlers.handleInputChange} onKeyDown={(e) => handlers.handleKeyDown(e, dialogs.slashCommands)} onBlur={handleTypingStop} onSend={handlers.handleSend}
          onCancelReply={() => handlers.setReplyToMessage(null)} onCancelEdit={handlers.handleCancelEdit} onSlashCommand={handlers.handleSlashCommand}
          onCloseSlashCommands={() => closeDialog('slashCommands')} onQuickReply={handleQuickReply}
          onRecordToggle={() => handlers.setIsRecordingAudio(!handlers.isRecordingAudio)} onAudioSend={(blob) => handlers.handleAudioSend(blob, onSendAudio)} onAudioCancel={() => handlers.setIsRecordingAudio(false)}
          onOpenInteractiveBuilder={() => openDialog('interactiveBuilder')} onOpenSchedule={() => openDialog('scheduleDialog')}
          onOpenQuickReplies={() => openDialog('quickReplies')}
          onOpenAssistant={() => onSelectAssistantTab ? onSelectAssistantTab() : handleSetActiveTool('aiAssistant')}
          onOpenTransfer={() => openDialog('transferDialog')}
          onOpenLocationPicker={() => openDialog('locationPicker')} onSendProduct={handlers.handleSendProduct} onSendSticker={handleSendSticker}
          onSendAudioMeme={handleSendAudioMeme} onSendCustomEmoji={handleSendCustomEmoji}
          signatureEnabled={signatureEnabled} signatureName={agentName} onToggleSignature={toggleSignature}
          onPollSent={async (poll) => { await onSendMessage(`📊 *Enquete:* ${poll.name}\n${poll.options.map((option, index) => `${index + 1}. ${option}`).join('\n')}`); }}
          onContactSent={async (contactName) => { await onSendMessage(`📇 Cartão de contato: ${contactName}`); }}
          onOpenCatalog={() => openDialog('catalogDirect')} onSelectSuggestion={(text) => handlers.setInputValue(text)} onSelectTemplate={(text) => handlers.setInputValue(text)}
          fileUploaderRef={fileUploaderRef} inputRef={handlers.inputRef} />

        <ChatDialogs
          dialogs={dialogs} openDialog={openDialog} closeDialog={closeDialog}
          conversation={conversation} forwardMessage={handlers.forwardMessage} callDirection={callDirection}
          contactId={conversation.contact.id} onTransfer={handleTransfer}
          onScheduleMessage={handleScheduleMessage} onSendInteractiveMessage={handlers.handleSendInteractiveMessage}
          onForwardToTargets={handlers.handleForwardToTargets} onSendLocation={handlers.handleSendLocation}
          onSendProduct={handlers.handleSendProduct} onSetInputValue={handlers.setInputValue}
        />
      </div>

      <ChatToolPanels
        activeTool={activeTool} onSetActiveTool={handleSetActiveTool}
        messages={messages} contactId={conversation.contact.id}
        contactName={conversation.contact.name} onSelectSuggestion={(text) => handlers.setInputValue(text)}
      />
    </div>
  );
}
