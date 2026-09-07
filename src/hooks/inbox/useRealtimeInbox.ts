 import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
 import { useInboxUIState } from '@/hooks/inbox/useInboxUIState';
 import { ChatService } from '@/services/chat.service';
import { useOfflineCache } from '@/hooks/system/useOfflineCache';
import { useMessages } from '@/hooks/chat/useMessages';
import { useRealtimeMessages, ConversationWithMessages, ConversationContact } from '@/hooks/chat/useRealtimeMessages';
import { useExternalConversations, useExternalMessages } from '@/hooks/integrations/useExternalEvolution';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { Conversation, Message } from '@/types/chat';
import { 
  mapRealtimeConversationToConversation, 
  mapRealtimeMessageToMessage 
} from '@/adapters/inboxAdapter';
import { toast } from 'sonner';

const log = getLogger('useRealtimeInbox');

// Feature flag: use external evolution DB as data source
const USE_EXTERNAL_DB = false;

export function useRealtimeInbox() {
  // Local DB source (original)
  const localRealtime = useRealtimeMessages();
  // External DB source (FATOR X)
  const externalData = useExternalConversations(USE_EXTERNAL_DB);

  // Select source based on flag
  const conversations = USE_EXTERNAL_DB ? externalData.conversations : localRealtime.conversations;
  const loading = USE_EXTERNAL_DB ? externalData.loading : localRealtime.loading;
  const error = USE_EXTERNAL_DB ? externalData.error : localRealtime.error;
  const externalRefetch = externalData.refetch;
  const localRefetch = localRealtime.refetch;
  const refetch = useCallback(() => {
    if (USE_EXTERNAL_DB) return externalRefetch();
    return localRefetch();
  }, [externalRefetch, localRefetch]);

  // These features only available on local for now
  const { sendMessage, markAsRead } = localRealtime;
   const { newMessageNotification, dismissNotification, setSelectedContact, setSoundEnabled } = localRealtime;
   const uiState = useInboxUIState();
   const { selectedContactId, setSelectedContactId, soundOn, setSoundOn, setPendingContactId } = uiState;
   const [selectedContactFallback, setSelectedContactFallback] = useState<{
     contactId: string;
     contact: ConversationContact;
   } | null>(null);
   const [isOnline, setIsOnline] = useState(true);
  const { profile } = useAuth();

  const { conversations: cachedConversations, usingCache } = useOfflineCache(conversations, loading);

  // External messages for selected contact (by remote_jid)
  const externalMsgs = useExternalMessages(USE_EXTERNAL_DB ? selectedContactId : null);

  // Local messages (fallback)
  const localMsgs = useMessages({
    contactId: USE_EXTERNAL_DB ? null : selectedContactId,
    enabled: !USE_EXTERNAL_DB && Boolean(selectedContactId),
  });

  const selectedMessagesLoading = USE_EXTERNAL_DB ? externalMsgs.loading : localMsgs.loading;
  const refetchSelectedMessages = USE_EXTERNAL_DB ? externalMsgs.refetch : localMsgs.refetch;

  // Listen for open-contact-chat events
  useEffect(() => {
    const appWindow = window as Window & { __pendingOpenContactId?: string };
    if (appWindow.__pendingOpenContactId) {
      setPendingContactId(appWindow.__pendingOpenContactId);
      appWindow.__pendingOpenContactId = undefined;
    }
    const handler = (e: Event) => {
      const contactId = (e as CustomEvent).detail?.contactId;
      if (contactId) {
        appWindow.__pendingOpenContactId = undefined;
        setPendingContactId(contactId);
      }
    };
    window.addEventListener('open-contact-chat', handler);
    return () => window.removeEventListener('open-contact-chat', handler);
  }, [setPendingContactId]);

  // Load fallback contact
  const selectedConversation = useMemo(
    () => cachedConversations.find((c) => c.contact.id === selectedContactId) || null,
    [cachedConversations, selectedContactId]
  );

  useEffect(() => {
    if (!selectedContactId || selectedConversation) return;
    let cancelled = false;
    const loadSelectedContact = async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', selectedContactId)
        .maybeSingle();
      if (cancelled) return;
      if (error) { log.error('Error loading selected fallback contact:', error); return; }
      if (data) setSelectedContactFallback({ contactId: selectedContactId, contact: data });
    };
    loadSelectedContact();
    return () => { cancelled = true; };
  }, [selectedContactId, selectedConversation]);

  const fallbackContact = selectedContactFallback?.contactId === selectedContactId
    ? selectedContactFallback.contact
    : null;

  const resolvedSelectedConversation = useMemo<ConversationWithMessages | null>(() => {
    if (selectedConversation) return selectedConversation;
    if (!fallbackContact) return null;
    return { contact: fallbackContact, messages: [], unreadCount: 0, lastMessage: null };
  }, [selectedConversation, fallbackContact]);

  // Online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline); };
  }, []);

  // Handlers
  const handleSelectConversation = useCallback((contactId: string) => {
    setSelectedContactId(contactId);
    setSelectedContact(contactId);
    markAsRead(contactId);
  }, [setSelectedContactId, setSelectedContact, markAsRead]);

  const handleNotificationView = useCallback(() => {
    if (newMessageNotification) {
      handleSelectConversation(newMessageNotification.contactId);
      dismissNotification();
    }
  }, [newMessageNotification, handleSelectConversation, dismissNotification]);

   const toggleSound = useCallback(() => {
     const v = !soundOn;
     setSoundOn(v);
     setSoundEnabled(v);
   }, [soundOn, setSoundOn, setSoundEnabled]);

  const refreshActiveConversation = useCallback(async () => {
    await Promise.all([refetch(), refetchSelectedMessages()]);
  }, [refetch, refetchSelectedMessages]);

  const handleSendMessage = useCallback(async (content: string) => {
    if (!selectedContactId) return;
    const currentId = selectedContactId;
    try {
      await sendMessage(currentId, content);
      await refreshActiveConversation();
    } catch (err) {
      log.error('Error sending message:', err);
      toast.error('Erro ao enviar mensagem');
    }
  }, [selectedContactId, sendMessage, refreshActiveConversation]);

   const handleSendAudio = useCallback(async (blob: Blob) => {
     if (!selectedContactId) { toast.error('Selecione uma conversa primeiro'); return; }
     try {
       const audioObjectUrl = await ChatService.uploadAudio(selectedContactId, blob);
       await sendMessage(selectedContactId, '[Áudio]', 'audio', audioObjectUrl);
     } catch (err) {
       log.error('Error in handleSendAudio:', err);
       toast.error('Erro ao enviar áudio. Tente novamente.');
     } finally {
       await refreshActiveConversation();
     }
   }, [selectedContactId, sendMessage, refreshActiveConversation]);

  // Convert to legacy format using specialized adapter
  const legacyConversation: Conversation | null = useMemo(() => 
    resolvedSelectedConversation ? mapRealtimeConversationToConversation(resolvedSelectedConversation) : null,
    [resolvedSelectedConversation]
  );

  const legacyMessages: Message[] = useMemo(() => {
    if (!selectedContactId) {
      return (resolvedSelectedConversation?.messages || [])
        .map((message) => mapRealtimeMessageToMessage(message, resolvedSelectedConversation?.contact.id));
    }

    // The local hook already returns the legacy UI model. Only Evolution and
    // conversation snapshots still expose raw database rows that need adapting.
    if (!USE_EXTERNAL_DB) return localMsgs.messages;
    return externalMsgs.messages
      .map((message) => mapRealtimeMessageToMessage(message, selectedContactId));
  }, [
    selectedContactId,
    resolvedSelectedConversation,
    localMsgs.messages,
    externalMsgs.messages,
  ]);

   return {
     ...uiState,
     isOnline,
     profile,
     toggleSound,
     conversations, cachedConversations, usingCache,
     loading, error,
     selectedMessagesLoading,
     newMessageNotification, dismissNotification,
     legacyConversation, legacyMessages,
     handleSelectConversation,
     handleNotificationView,
     handleSendMessage,
     handleSendAudio,
     refetch,
     setSelectedContact,
     markAsRead,
   };
}
