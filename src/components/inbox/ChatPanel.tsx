import { useState, useRef, useEffect, lazy, Suspense, useReducer, useCallback, useMemo } from 'react';
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
import { useAmbientColor } from '@/hooks/ui/useAmbientColor';
import { ChatToolPanels } from './chat/ChatToolPanels';
import { ChatDialogs } from './chat/ChatDialogs';
import { ChatPanelHeader } from './chat/ChatPanelHeader';
import { ChatAssignedBar } from './chat/ChatAssignedBar';
import { ChatMessagesArea, ChatMessagesAreaRef } from './chat/ChatMessagesArea';
import { ChatInputArea } from './chat/ChatInputArea';
import { ChatDragOverlay } from './chat/ChatDragOverlay';
import { ChatQuickRepliesPopover } from './chat/ChatQuickRepliesPopover';
import { ChatSearchBar } from './chat/ChatSearchBar';
import { useChatPanelHandlers } from './chat/useChatPanelHandlers';

const WhisperMode = lazy(() => import('./WhisperMode').then(m => ({ default: m.WhisperMode })));
const NextBestActionEngine = lazy(() => import('./NextBestActionEngine').then(m => ({ default: m.NextBestActionEngine })));

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
  onSendMessage: (content: string) => void;
  onSendAudio?: (blob: Blob) => Promise<void>;
  showDetails?: boolean;
  onToggleDetails?: () => void;
  onBack?: () => void;
  hideHeader?: boolean;
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

export function ChatPanel({ conversation, messages, onSendMessage, onSendAudio, showDetails = false, onToggleDetails, onBack, hideHeader = false }: ChatPanelProps) {
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
  const { instanceName, whatsappConnectionId, initResolve, handleSendSticker, handleSendCustomEmoji, handleSendAudioMeme } = useChatMediaSending(conversation.contact.id, conversation.contact.phone);

  const handleVoiceChange = (v: string) => { updateSettings({ tts_voice_id: v }); setTimeout(() => saveSettings(), 100); };
  const handleSpeedChange = (s: number) => { updateSettings({ tts_speed: s }); setTimeout(() => saveSettings(), 100); };
  const { speak, stop, isLoading: ttsLoading, isPlaying: ttsPlaying, currentMessageId: ttsMessageId, voiceId, setVoiceId, speed, setSpeed } = useTextToSpeech({
    initialVoiceId: settings.tts_voice_id, initialSpeed: settings.tts_speed, onVoiceChange: handleVoiceChange, onSpeedChange: handleSpeedChange,
  });

  const handlers = useChatPanelHandlers({
    conversationId: conversation.id, contactId: conversation.contact.id, contactPhone: conversation.contact.phone,
    instanceName, onSendMessage, editMessageApi: editMessage, applySignature,
    handleTypingStart, handleTypingStop, openDialog: openDialog as any, closeDialog: closeDialog as any, handleSetActiveTool,
  });

  useEffect(() => { initResolve(); }, [conversation.contact.id]);
  useEffect(() => { messagesAreaRef.current?.scrollToBottom(); }, [messages.length, isContactTyping]);
  useEffect(() => {
    setActiveTool(null); setHighlightedMessageIds(new Set()); setActiveHighlightId(null); setSearchQuery('');
  }, [conversation.id]);

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
    () => dbQuickReplies.filter(r => handlers.inputValue.startsWith('/') && r.shortcut.toLowerCase().includes(handlers.inputValue.toLowerCase())),
    [dbQuickReplies, handlers.inputValue]
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); handleSetActiveTool('chatSearch'); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Stable refs for ChatMessagesArea to prevent re-renders on input change
  const contactJid = useMemo(() => conversation.contact.phone ? `${conversation.contact.phone}@s.whatsapp.net` : '', [conversation.contact.phone]);
  const contactAvatar = conversation.contact.avatar || undefined;
  const handleScrollToMessage = useCallback((id: string) => messagesAreaRef.current?.scrollToMessage(id), []);

  const handleQuickReply = (reply: { id: string; title: string; shortcut: string; content: string; category: string }) => {
    handlers.setInputValue(reply.content); closeDialog('quickReplies'); incrementUseCount(reply.id);
  };

  const handleTransfer = (type: 'agent' | 'queue', targetId: string, message?: string) => {
    toast({ title: 'Chat transferido!', description: type === 'agent' ? 'O chat foi transferido para outro atendente.' : 'O chat foi transferido para outra fila.' });
  };

  const handleScheduleMessage = async (message: string, scheduledAt: Date, attachment?: File) => {
    try {
      let mediaUrl: string | undefined;
      let messageType = 'text';
      if (attachment) {
        const fileName = `scheduled_${Date.now()}_${attachment.name}`;
        const { error: uploadError } = await supabase.storage.from('whatsapp-media').upload(fileName, attachment);
        if (!uploadError) {
          const { data: signedData } = await supabase.storage.from('whatsapp-media').createSignedUrl(fileName, 3600);
          mediaUrl = signedData?.signedUrl;
          messageType = attachment.type.startsWith('audio') ? 'audio' : attachment.type.startsWith('image') ? 'image' : attachment.type.startsWith('video') ? 'video' : 'document';
        }
      }
      await scheduleMessage({ contactId: conversation.contact.id, content: message, scheduledAt, messageType, mediaUrl });
      closeDialog('scheduleDialog');
    } catch (err) { log.error('Failed to schedule message:', err); }
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current++; if (e.dataTransfer.types.includes('Files')) setIsDraggingOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDraggingOver(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); dragCounterRef.current = 0; setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && fileUploaderRef.current) fileUploaderRef.current.handleExternalFiles(files);
  };

  const ambient = useAmbientColor(conversation.sentiment);

  return (
    <div className={`flex h-full min-h-0 min-w-0 overflow-hidden relative ${ambient.className}`} style={{ backgroundColor: ambient.bgTint }} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
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
            onSelectSuggestion={(text) => handlers.setInputValue(text)} />
        )}

        <ChatSearchBar messages={messages} isOpen={activeTool === 'chatSearch'}
          onClose={() => { handleSetActiveTool('chatSearch'); setTimeout(() => handlers.inputRef.current?.focus(), 150); }}
          onNavigateToMessage={(id) => messagesAreaRef.current?.scrollToMessage(id)}
          onHighlightChange={(ids, activeId) => { setHighlightedMessageIds(ids); setActiveHighlightId(activeId); }}
          onSearchQueryChange={setSearchQuery} />

        <ChatAssignedBar conversation={conversation} onOpenTransfer={() => openDialog('transferDialog')} />

        <Suspense fallback={null}>
          <NextBestActionEngine contactId={conversation.contact.id} contactName={conversation.contact.name} />
        </Suspense>

        <ChatMessagesArea ref={messagesAreaRef} messages={messages} isContactTyping={isContactTyping} typingUserName={typingUsers[0]?.name || conversation.contact.name}
          ttsLoading={ttsLoading} ttsPlaying={ttsPlaying} ttsMessageId={ttsMessageId} instanceName={instanceName}
          contactJid={contactJid} contactAvatar={contactAvatar}
          onSpeak={speak} onStop={stop} onReply={handlers.handleReplyToMessage} onForward={handlers.handleForwardMessage} onCopy={handlers.handleCopyMessage}
          onScrollToMessage={handleScrollToMessage} onInteractiveButtonClick={handlers.handleInteractiveButtonClick} onEditStart={handlers.handleEditStart}
          highlightedMessageIds={highlightedMessageIds} activeHighlightId={activeHighlightId} searchQuery={searchQuery} />

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
          onOpenLocationPicker={() => openDialog('locationPicker')} onSendProduct={handlers.handleSendProduct} onSendSticker={handleSendSticker}
          onSendAudioMeme={handleSendAudioMeme} onSendCustomEmoji={handleSendCustomEmoji}
          signatureEnabled={signatureEnabled} signatureName={agentName} onToggleSignature={toggleSignature}
          onPollSent={async (poll) => { await supabase.from('messages').insert({ contact_id: conversation.contact.id, whatsapp_connection_id: whatsappConnectionId, content: `📊 *Enquete:* ${poll.name}\n${poll.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`, message_type: 'text', sender: 'agent', status: 'sent' }); }}
          onContactSent={async (contactName) => { await supabase.from('messages').insert({ contact_id: conversation.contact.id, whatsapp_connection_id: whatsappConnectionId, content: `📇 Cartão de contato: ${contactName}`, message_type: 'text', sender: 'agent', status: 'sent' }); }}
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
