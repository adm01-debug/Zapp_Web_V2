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
import { toast } from '@/hooks/ui/use-toast';
import { validatePttBlob } from '@/lib/audio/pttLimits';
import { Conversation, Message } from '@/types/chat';
import { 
  mapRealtimeConversationToConversation, 
  mapRealtimeMessageToMessage 
} from '@/adapters/inboxAdapter';

const log = getLogger('useRealtimeInbox');

/**
 * Estado de retentativa de UMA gravação de áudio. Guarda o blob (identidade da
 * gravação), o objeto já subido no bucket e o `client_message_id` daquela ação:
 * enquanto a entrega não é confirmada, a retentativa reusa os dois últimos,
 * então a mídia não sobe de novo e o servidor deduplica a nota de voz.
 */
interface EnvioDeAudioPendente {
  blob: Blob;
  contactId: string;
  publicUrl: string;
  clientMessageId: string;
}

/** Mesmo contrato do serviço de envio: sem id seguro, não há como deduplicar. */
function criarIdDeEnvioDeAudio(): string {
  if (typeof crypto?.randomUUID !== 'function') {
    throw new Error('Seu navegador não suporta identificadores de entrega seguros. Atualize-o e tente novamente.');
  }
  return crypto.randomUUID();
}

// Feature flag: use external evolution DB as data source
const USE_EXTERNAL_DB = false;

// `contacts.id` é uuid. Link/notificação/busca podem trazer um id malformado:
// nesse caso a consulta nunca chega ao banco (o PostgREST estouraria o cast) e o
// resultado é "não encontrado", distinto de uma falha de transporte.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

type SelectedContactLookup =
  | { contactId: string; status: 'loading'; error: null }
  | { contactId: string; status: 'not-found'; error: null }
  | { contactId: string; status: 'error'; error: string };

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
  // Retentativa de áudio: vive enquanto a gravação não é aceita nem descartada.
  const pendingAudioSendRef = useRef<EnvioDeAudioPendente | null>(null);
  const [selectedContactFallback, setSelectedContactFallback] = useState<{
    contactId: string;
    contact: ConversationContact;
  } | null>(null);
  // Resultado da consulta do contato fora da lista: carregando / erro / não encontrado.
  const [selectedContactLookup, setSelectedContactLookup] = useState<SelectedContactLookup | null>(null);
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

  // R2-INB-024: `useMessages` termina o `loading` mesmo quando a busca falha e publica o
  // motivo em `error`. Sem repassar esse `error`, a ponte só sabia dizer "não está carregando
  // e não há mensagens" — o consumidor exibia conversa vazia para falha de transporte/permissão,
  // indistinguível de um contato sem histórico e sem retry daquela consulta.
  const selectedMessagesLoading = USE_EXTERNAL_DB ? externalMsgs.loading : localMsgs.loading;
  const selectedMessagesError = USE_EXTERNAL_DB ? externalMsgs.error : localMsgs.error;
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
    // Guarda de UUID antes da consulta: id de link/notificação malformado nunca vai
    // ao banco (o PostgREST estouraria o cast). O "não encontrado" desse caso é
    // DERIVADO abaixo (`isMalformedSelectedContactId`), não gravado aqui: gravar
    // estado direto no corpo do efeito provoca render em cascata (lint
    // react-hooks/set-state-in-effect). O "carregando" também é derivado (padrão).
    if (!isValidUuid(selectedContactId)) return;
    let cancelled = false;
    const loadSelectedContact = async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', selectedContactId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        log.error('Error loading selected fallback contact:', error);
        setSelectedContactLookup({
          contactId: selectedContactId,
          status: 'error',
          error: 'Não foi possível carregar o contato.',
        });
        return;
      }
      if (data) {
        setSelectedContactFallback({ contactId: selectedContactId, contact: data });
        setSelectedContactLookup(null);
      } else {
        // Sem erro e sem linha = inexistente ou fora do acesso (o RLS filtra sem erro).
        setSelectedContactLookup({ contactId: selectedContactId, status: 'not-found', error: null });
      }
    };
    void loadSelectedContact();
    return () => { cancelled = true; };
  }, [selectedContactId, selectedConversation]);

  const fallbackContact = selectedContactFallback?.contactId === selectedContactId
    ? selectedContactFallback.contact
    : null;

  // Estado da consulta do contato fora da lista, para o consumidor mostrar
  // carregando / erro / não encontrado em vez de uma tela vazia e muda.
  // Só vale para o contato selecionado agora (resultado antigo não vaza).
  const isMalformedSelectedContactId =
    Boolean(selectedContactId) && !selectedConversation && !isValidUuid(selectedContactId);

  const selectedContactFallbackStatus: 'idle' | 'loading' | 'error' | 'not-found' =
    !selectedContactId || selectedConversation || fallbackContact
      ? 'idle'
      : isMalformedSelectedContactId
        ? 'not-found'
        : selectedContactLookup && selectedContactLookup.contactId === selectedContactId
          ? selectedContactLookup.status
          : 'loading';
  const selectedContactFallbackError =
    selectedContactLookup && selectedContactLookup.contactId === selectedContactId
      ? selectedContactLookup.error
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

  // R2-INB-059: o contato "aberto" — aquele que suprime som/toast em
  // `notifyAboutIncomingMessage` — tem UMA fonte: `selectedContactId`. Antes, só
  // `handleSelectConversation` atualizava esse ref; os demais caminhos que trocam
  // a seleção (nova conversa criada pelo modal, "Voltar" no celular e expandir o
  // PiP, que só chamam `setSelectedContactId`) ficavam de fora. Efeito: no
  // celular, o contato recém-fechado continuava MUDO (sem som, toast nem
  // notificação) até uma nova seleção; a conversa criada pelo modal não suprimia
  // o aviso dela nem marcava como lida. Aqui o id governa o ref e a leitura em
  // TODOS os caminhos.
  useEffect(() => {
    setSelectedContact(selectedContactId ?? null);
    if (selectedContactId) void markAsRead(selectedContactId);
    // `markAsRead` não é memoizado (lê `conversationsRef` por dentro); listá-lo
    // faria o efeito disparar a cada render. Só a TROCA do id deve agir.
  }, [selectedContactId, setSelectedContact]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers
  const handleSelectConversation = useCallback((contactId: string) => {
    // `setSelectedContact`/`markAsRead` vivem no efeito acima: não duplicar aqui.
    setSelectedContactId(contactId);
  }, [setSelectedContactId]);

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

  const handleSendMessage = useCallback(async (content: string, replyToId?: string | null) => {
    if (!selectedContactId) return;
    const currentId = selectedContactId;
    // PK-21: o caminho de envio NÃO refaz o fetch da lista de conversas nem o da
    // conversa aberta. Os dois já são atualizados pelo Realtime — o INSERT da
    // mensagem enfileirada é tratado por `useRealtimeMessages` (lista) e por
    // `useMessages` (conversa aberta) na inscrição `global-messages-realtime` —, e
    // o par de refetches dentro do envio era o que segurava o compositor depois do
    // despacho, obrigando o agente a esperar uma ida ao servidor que o Realtime já
    // cobria.
    try {
      await sendMessage(currentId, content, 'text', undefined, undefined, replyToId);
    } catch (err) {
      log.error('Error sending message:', err);
      // O ChatPanel é responsável pelo feedback visual. A rejeição precisa
      // chegar até ele para que não limpe o editor nem anuncie sucesso falso.
      throw err;
    }
  }, [selectedContactId, sendMessage]);

  // R2-INB-022 (mantido) + R2-INB-058: o elo de baixo da cadeia do áudio precisa SINALIZAR a
  // falha ao chamador. `handleSendAudio` REJEITA quando não há contato selecionado e quando
  // `ChatService.uploadAudio`/`sendMessage` rejeita (preservando o erro original, mesmo que o
  // refresh da conversa caia), e resolve `true` no sucesso — o valor que o `ChatPanel` lê para
  // fechar o gravador. Antes ela resolvia `false`/saía em silêncio, então quem está acima não
  // distinguia "áudio enviado" de "áudio descartado".
  // Sem toast para falha de TRANSPORTE: o aviso ao usuário é da camada de cima
  // (`useChatPanelHandlers.handleAudioSend` / TextToAudioButton); duplicar faria o mesmo
  // erro aparecer duas vezes.
  // EXCEÇÃO (PE-24): áudio fora dos limites do WhatsApp é recusado AQUI, antes do upload,
  // e o motivo é avisado aqui — esta é a camada que conhece a mensagem exata da validação
  // (a de cima só tem um texto genérico). A gravação não sobe para o bucket.
  const handleSendAudio = useCallback(async (blob: Blob, replyToId?: string | null): Promise<boolean> => {
    if (!selectedContactId) throw new Error('Selecione uma conversa primeiro');
    const contactId = selectedContactId;
    const ptt = await validatePttBlob(blob);
    if (!ptt.ok) {
      const motivo = ptt.message ?? 'Áudio inválido.';
      toast({ title: 'Áudio não enviado', description: motivo, variant: 'destructive' });
      throw new Error(motivo);
    }
    try {
      // Idempotência POR GRAVAÇÃO: a resposta de um despacho pode se perder
      // depois de o POST já ter saído. Sem estado, a retentativa subia um
      // arquivo novo (nome com `Date.now()`) e mandava outro
      // `client_message_id` — duas notas de voz no WhatsApp do cliente. Aqui a
      // MESMA gravação reenvia o objeto já subido e o mesmo id de entrega, e o
      // `UNIQUE (contact_id, client_message_id)` do servidor deduplica.
      const pendente = pendingAudioSendRef.current;
      const mesmaGravacao = pendente && pendente.blob === blob && pendente.contactId === contactId;
      if (!mesmaGravacao) {
        // Outra gravação (ou outra conversa): a anterior não é mais retentável.
        pendingAudioSendRef.current = null;
      }
      let envio = mesmaGravacao ? pendente : null;
      if (!envio) {
        const audioObjectUrl = await ChatService.uploadAudio(contactId, blob);
        envio = {
          blob,
          contactId,
          publicUrl: audioObjectUrl,
          clientMessageId: criarIdDeEnvioDeAudio(),
        };
        pendingAudioSendRef.current = envio;
      }
      if (replyToId) {
        await sendMessage(contactId, '[Áudio]', 'audio', envio.publicUrl, undefined, replyToId, envio.clientMessageId);
      } else {
        await sendMessage(contactId, '[Áudio]', 'audio', envio.publicUrl, undefined, undefined, envio.clientMessageId);
      }
      // Aceita: a gravação deixa de ser retentável — um áudio novo é ação nova.
      pendingAudioSendRef.current = null;
      return true;
    } catch (err) {
      log.error('Error in handleSendAudio:', err);
      throw err;
    } finally {
      // Falha do refresh não pode substituir o erro do transporte que está subindo
      // (`throw err` acima) nem sugerir que o áudio não saiu quando ele saiu.
      try {
        await refreshActiveConversation();
      } catch (refreshErr) {
        log.warn('Audio send finished, but conversation refresh failed:', refreshErr);
      }
    }
  }, [selectedContactId, sendMessage, refreshActiveConversation]);

  // Descarte explícito do estado de retentativa (o usuário cancelou a gravação):
  // a próxima tentativa com o MESMO blob volta a subir e a gerar id novo.
  const discardPendingAudioSend = useCallback(() => {
    pendingAudioSendRef.current = null;
  }, []);

  // Convert to legacy format using specialized adapter
  const legacyConversation: Conversation | null = useMemo(() => 
    resolvedSelectedConversation ? mapRealtimeConversationToConversation(resolvedSelectedConversation) : null,
    [resolvedSelectedConversation]
  );

  // R2-INB-015: recorte de mensagens que o cache guardou para a conversa ativa.
  // Só é oferecido quando a lista ao vivo está vazia (offline) e o cache é a
  // fonte em uso, e é identificado ao consumidor por `selectedMessagesFromCache`.
  const cachedSelectedMessages = useMemo(
    () => (usingCache ? (selectedConversation?.messages ?? []) : []),
    [usingCache, selectedConversation]
  );
  const selectedMessagesFromCache = !USE_EXTERNAL_DB
    && usingCache
    && localMsgs.messages.length === 0
    && cachedSelectedMessages.length > 0;

  const legacyMessages: Message[] = useMemo(() => {
    if (!selectedContactId) {
      return (resolvedSelectedConversation?.messages || [])
        .map((message) => mapRealtimeMessageToMessage(message, resolvedSelectedConversation?.contact.id));
    }

    // The local hook already returns the legacy UI model. Only Evolution and
    // conversation snapshots still expose raw database rows that need adapting.
    if (!USE_EXTERNAL_DB) {
      // R2-INB-015: offline o fetch do contato não completa e `localMsgs` fica
      // vazio; o recorte guardado no cache da conversa selecionada entra no
      // lugar do vazio. Nunca compete com mensagem ao vivo — assim que houver
      // qualquer mensagem carregada, ela reassume (recuperação explícita).
      if (selectedMessagesFromCache) {
        return cachedSelectedMessages
          .map((message) => mapRealtimeMessageToMessage(message, selectedContactId));
      }
      return localMsgs.messages;
    }
    return externalMsgs.messages
      .map((message) => mapRealtimeMessageToMessage(message, selectedContactId));
  }, [
    selectedContactId,
    resolvedSelectedConversation,
    localMsgs.messages,
    externalMsgs.messages,
    selectedMessagesFromCache,
    cachedSelectedMessages,
  ]);

  return {
    ...uiState,
    isOnline,
    profile,
    toggleSound,
    conversations, cachedConversations, usingCache,
    selectedMessagesFromCache,
    loading, error,
    selectedMessagesLoading,
    selectedMessagesError,
    selectedContactFallbackStatus,
    selectedContactFallbackError,
    refetchSelectedMessages,
    hasOlderMessages: !USE_EXTERNAL_DB && localMsgs.hasOlder,
    loadingOlderMessages: !USE_EXTERNAL_DB && localMsgs.loadingOlder,
    loadOlderMessages: !USE_EXTERNAL_DB ? localMsgs.loadOlderMessages : async () => {},
    newMessageNotification, dismissNotification,
    legacyConversation, legacyMessages,
    handleSelectConversation,
    handleNotificationView,
    handleSendMessage,
    handleSendAudio,
    discardPendingAudioSend,
    refetch,
    setSelectedContact,
    markAsRead,
  };
}
