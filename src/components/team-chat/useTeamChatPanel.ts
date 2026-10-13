import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import { useAuth } from '@/hooks/auth/useAuth';
import { useTextToSpeech } from '@/hooks/communication/useTextToSpeech';
import { useUserSettings } from '@/hooks/system/useUserSettings';
import { useSendTeamMessage, useDeleteTeamMessage, useEditTeamMessage, useToggleMuteConversation, TeamMessage, TeamConversation } from '@/hooks/chat/useTeamChat';
import { useRenameConversation, useRemoveConversationMember, useLeaveConversation, useDeleteConversation } from '@/hooks/team-chat/useTeamChatMutations';
import { useTeamMessages } from '@/hooks/team-chat/useTeamMessages';
import { useTeamMessageReactions } from '@/hooks/team-chat/useTeamMessageReactions';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { uploadTeamMedia, TEAM_CHAT_FILES_BUCKET } from '@/hooks/team-chat/uploadTeamMedia';
import { toast } from 'sonner';

const log = getLogger('TeamChatPanel');

// Mesmo teto de página do histórico novo (`useTeamMessages`): era o `.limit(60)`
// do select direto que a paginação fazia.
const OLDER_MESSAGES_PAGE_SIZE = 60;

/**
 * SL-016 (F54) — linha da RPC `get_team_messages_page`: vem achatada
 * (`sender_name`/`sender_avatar`) porque o servidor resolve o remetente sem
 * depender da RLS de `profiles`.
 */
type TeamMessagePageRow = Database['public']['Functions']['get_team_messages_page']['Returns'][number];

function pageRowToTeamMessage(row: TeamMessagePageRow): TeamMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    content: row.content ?? '',
    message_type: row.message_type ?? 'text',
    media_url: row.media_url ?? null,
    media_type: row.media_type ?? null,
    media_bucket: row.media_bucket ?? null,
    media_path: row.media_path ?? null,
    reply_to_id: row.reply_to_id ?? null,
    is_edited: row.is_edited ?? false,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sender: row.sender_id
      ? { id: row.sender_id, name: row.sender_name ?? '', avatar_url: row.sender_avatar ?? null }
      : undefined,
  };
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * SL-072 — a gravação do chat interno não é sempre webm: o MediaRecorder do
 * Safari entrega `audio/mp4` (m4a) e o TTS (ElevenLabs) entrega `audio/mpeg`
 * (mp3). O upload declarava `webm` fixo, então o objeto era rotulado com um
 * formato que o navegador não toca (o áudio "não tocava no Safari"). A extensão
 * e o contentType saem agora do blob real; sem mime reconhecido, mantém webm.
 */
const AUDIO_UPLOAD_FORMATS: Record<string, { extension: string; contentType: string }> = {
  'audio/webm': { extension: 'webm', contentType: 'audio/webm' },
  'audio/mp4': { extension: 'm4a', contentType: 'audio/mp4' },
  'audio/m4a': { extension: 'm4a', contentType: 'audio/mp4' },
  'audio/x-m4a': { extension: 'm4a', contentType: 'audio/mp4' },
  'audio/aac': { extension: 'aac', contentType: 'audio/aac' },
  'audio/mpeg': { extension: 'mp3', contentType: 'audio/mpeg' },
  'audio/mp3': { extension: 'mp3', contentType: 'audio/mpeg' },
  'audio/ogg': { extension: 'ogg', contentType: 'audio/ogg' },
  'audio/wav': { extension: 'wav', contentType: 'audio/wav' },
};

export function resolveAudioUploadFormat(blob: Blob): { extension: string; contentType: string } {
  const mime = (blob.type || '').split(';')[0].trim().toLowerCase();
  return AUDIO_UPLOAD_FORMATS[mime] ?? { extension: 'webm', contentType: 'audio/webm' };
}

export function useTeamChatPanel(conversation: TeamConversation) {
  const { profile } = useAuth();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<TeamMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showGroupManagement, setShowGroupManagement] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showTransferDialog, setShowTransferDialog] = useState(false);
  const [olderMessages, setOlderMessages] = useState<TeamMessage[]>([]);
  const [oldestCursor, setOldestCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);

  // Rascunho e resposta são da conversa: o painel não remonta ao trocar de
  // conversa, então o reset acontece no render (mesmo padrão de
  // useFilesViewState). Sem isso o texto de uma conversa aparece na outra e o
  // autosave do rascunho grava na chave errada — idem para o reply_to.
  const [conversationScopeId, setConversationScopeId] = useState(conversation.id);
  if (conversationScopeId !== conversation.id) {
    setConversationScopeId(conversation.id);
    setText('');
    setReplyTo(null);
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  const savedScrollFromBottomRef = useRef<number | null>(null);

  const { messages: newestMessages, isLoading } = useTeamMessages(conversation.id);
  const sendMutation = useSendTeamMessage();
  const deleteMutation = useDeleteTeamMessage();
  const editMutation = useEditTeamMessage();
  const muteMutation = useToggleMuteConversation();
  const renameConvMutation = useRenameConversation();
  const removeMemberMutation = useRemoveConversationMember();
  const leaveMutation = useLeaveConversation();
  const deleteConvMutation = useDeleteConversation();
  const reactions = useTeamMessageReactions(conversation.id);

  const { settings, isLoading: settingsLoading } = useUserSettings();
  // TC-007: a fonte única do mute é a membership (`team_conversation_members.is_muted`) —
  // exatamente onde `useToggleMuteConversation` grava. Antes a leitura vinha de
  // `user_settings.muted_conversations`, então o estado exibido não refletia o banco.
  const isMuted = useMemo(() => {
    const me = conversation.members?.find(m => m.profile_id === profile?.id);
    return !!me?.is_muted;
  }, [conversation.members, profile?.id]);

  const canTransfer = useMemo(() => {
    const r = (profile as { role?: string } | null)?.role;
    return r === 'admin' || r === 'supervisor';
  }, [profile]);

  const isGroupCreator = useMemo(() => {
    return !!(profile?.id && conversation.created_by === profile.id);
  }, [profile, conversation.created_by]);

  const ttsOptions = useMemo(() => ({
    initialVoiceId: settingsLoading ? undefined : settings.tts_voice_id,
    initialSpeed: settingsLoading ? undefined : settings.tts_speed,
  }), [settingsLoading, settings.tts_voice_id, settings.tts_speed]);

  const tts = useTextToSpeech(ttsOptions);

  const handleVoiceChange = useCallback((newVoiceId: string) => {
    tts.setVoiceId(newVoiceId);
    if (!profile?.id) return;
    void supabase.from('user_settings').upsert(
      { user_id: profile.id, tts_voice_id: newVoiceId },
      { onConflict: 'user_id' },
    );
  }, [tts, profile]);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    tts.setSpeed(newSpeed);
    if (!profile?.id) return;
    void supabase.from('user_settings').upsert(
      { user_id: profile.id, tts_speed: newSpeed },
      { onConflict: 'user_id' },
    );
  }, [tts, profile]);

  const messages = useMemo(() => {
    const ids = new Set<string>();
    const combined: TeamMessage[] = [];
    for (const m of [...olderMessages, ...newestMessages]) {
      if (!ids.has(m.id)) { ids.add(m.id); combined.push(m); }
    }
    return combined;
  }, [olderMessages, newestMessages]);

  // TC-006 — o reset por conversa roda ANTES do init do cursor: se rodasse
  // depois (como estava), o `setOldestCursor(null)` do reset apagava o cursor
  // que o efeito de init tinha acabado de gravar (ambos disparam no mesmo
  // commit de montagem/troca), e a paginação nunca começava — as mensagens
  // antigas ficavam inalcançáveis.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOlderMessages([]);
    setOldestCursor(null);
    setHasOlderMessages(true);
    setShowStats(false);
    setShowTransferDialog(false);
    setShowGroupManagement(false);
  }, [conversation.id]);

  useEffect(() => {
    if (newestMessages.length > 0 && oldestCursor === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOldestCursor({ createdAt: newestMessages[0].created_at, id: newestMessages[0].id });
    }
  }, [newestMessages, oldestCursor]);


  useEffect(() => {
    if (savedScrollFromBottomRef.current === null) return;
    const delta = savedScrollFromBottomRef.current;
    savedScrollFromBottomRef.current = null;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight - delta;
    });
  }, [olderMessages.length]);

  const fetchOlderMessages = useCallback(async () => {
    if (isFetchingOlder || !hasOlderMessages || !oldestCursor) return;
    const el = scrollRef.current;
    if (el) savedScrollFromBottomRef.current = el.scrollHeight - el.scrollTop;
    setIsFetchingOlder(true);
    try {
      // TC-006 / SL-016 (F54) — a página anterior usa a mesma RPC achatada do
      // histórico novo: `get_team_messages_page`. O `select` direto com embed de
      // `profiles` voltava `sender: null` para o agente (a RLS de `profiles` é
      // 'own + admin'), então as antigas apareciam sem nome nem foto. O keyset
      // composto `(created_at, id)` vai no `p_before_id` e é resolvido no
      // servidor. O desempate por `id` para mensagens com o MESMO `created_at`
      // do cursor é do banco (N-072) — o SQL desta RPC ainda compara só
      // `created_at < v_before_at`.
      const { data, error } = await supabase.rpc('get_team_messages_page', {
        p_conversation_id: conversation.id,
        p_before_id: oldestCursor.id,
        p_limit: OLDER_MESSAGES_PAGE_SIZE,
      });
      if (error) throw error;
      // A RPC devolve DESC (mais novas primeiro); o painel trabalha ASC.
      const older = ((data ?? []) as TeamMessagePageRow[]).map(pageRowToTeamMessage).reverse();
      if (older.length === 0) {
        setHasOlderMessages(false);
      } else {
        setOldestCursor({ createdAt: older[0].created_at, id: older[0].id });
        setOlderMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          return [...older.filter(m => !ids.has(m.id)), ...prev];
        });
      }
    } catch (err) {
      log.error('Erro ao carregar mensagens anteriores', err);
    } finally {
      setIsFetchingOlder(false);
    }
  }, [isFetchingOlder, hasOlderMessages, oldestCursor, conversation.id]);

  const debouncedSearchQuery = useDebounce(searchQuery, 400);

  const filteredMessages = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return messages;
    const q = debouncedSearchQuery.toLowerCase();
    return messages.filter(m => m.content?.toLowerCase().includes(q));
  }, [messages, debouncedSearchQuery]);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    isNearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setShowScrollDown(false);
    }
  }, []);

  const handleSend = useCallback(async () => {
    const content = text.trim();
    if (!content || !profile?.id) return;
    setText('');
    const reply = replyTo;
    setReplyTo(null);
    try {
      await sendMutation.mutateAsync({
        conversationId: conversation.id,
        content,
        replyToId: reply?.id,
      });
    } catch (err) {
      log.error('Erro ao enviar mensagem', err);
      toast.error('Erro ao enviar mensagem');
      // TC-010: o campo era limpo ANTES do await e nada voltava no erro — uma
      // falha de rede/RLS apagava o rascunho e a resposta sem recuperação.
      // Devolve o que foi enviado, mas nunca sobrescreve o que o usuário já
      // digitou enquanto o envio estava em voo (só restaura se ainda vazio).
      setText(prev => (prev.length === 0 ? content : prev));
      setReplyTo(prev => (prev === null ? reply : prev));
    }
  }, [text, profile, replyTo, conversation.id, sendMutation]);

  const handleDelete = useCallback(async (messageId: string) => {
    try {
      await deleteMutation.mutateAsync({ messageId, conversationId: conversation.id });
    } catch (err) {
      log.error('Erro ao excluir mensagem', err);
      toast.error('Erro ao excluir');
    }
  }, [deleteMutation, conversation.id]);

  const handleStartEdit = useCallback((msg: TeamMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content ?? '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editText.trim();
    if (!editingId || !trimmed) return;
    try {
      await editMutation.mutateAsync({ messageId: editingId, content: trimmed, conversationId: conversation.id });
      setEditingId(null);
      setEditText('');
    } catch (err) {
      log.error('Erro ao editar mensagem', err);
      toast.error('Erro ao editar');
    }
  }, [editingId, editText, editMutation, conversation.id]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const handleCopyMessage = useCallback((content: string) => {
    void navigator.clipboard.writeText(content).then(() => toast.success('Copiado!'));
  }, []);

  // R2-INB-058 (#350-B): o chamador precisa saber se o áudio foi enviado.
  // `undefined` era lido como sucesso pelo TextToAudioButton, que descartava a
  // prévia. Agora todo caminho devolve boolean: `true` SÓ após a mutação confirmar;
  // quando `handleAudioSend` devolve `false` ou rejeita, o TextToAudioButton PRESERVA
  // a prévia do áudio gerado e só a descarta no envio confirmado com `true`.
  const handleAudioSend = useCallback(async (blob: Blob): Promise<boolean> => {
    if (!profile?.id) return false;
    // SL-072: o formato do upload vem do blob real — webm no Chrome, mp4/m4a no
    // Safari (e mp3 no TTS). Antes ia webm fixo e o Safari não tocava o áudio.
    const { extension, contentType } = resolveAudioUploadFormat(blob);
    try {
      const locator = await uploadTeamMedia({
        profileId: profile.id,
        conversationId: conversation.id,
        file: blob,
        extension,
        contentType,
        upsert: false,
      });
      if (!locator) return false;
      await sendMutation.mutateAsync({
        conversationId: conversation.id,
        content: '🎤 Mensagem de áudio',
        mediaPath: locator.mediaPath,
        mediaBucket: locator.mediaBucket,
        mediaType: 'audio',
      });
      return true;
    } catch (err) {
      log.error('Erro ao enviar áudio', err);
      toast.error('Erro ao enviar áudio');
      return false;
    }
  }, [profile, conversation.id, sendMutation]);

  const handleFileSent = useCallback(async (mediaPath: string, mediaType: string, fileName: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: fileName,
      mediaBucket: TEAM_CHAT_FILES_BUCKET,
      mediaPath,
      mediaType: (mediaType as TeamMessage['media_type']) ?? undefined,
    });
  }, [profile, conversation.id, sendMutation]);

  const handleSendSticker = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '🎨 Figurinha',
      mediaUrl: url,
      mediaType: 'sticker',
    });
  }, [profile, conversation.id, sendMutation]);

  const handleSendAudioMeme = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '🎵 Áudio meme',
      mediaUrl: url,
      mediaType: 'audio_meme',
    });
  }, [profile, conversation.id, sendMutation]);

  const handleSendCustomEmoji = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '😀 Emoji',
      mediaUrl: url,
      mediaType: 'emoji',
    });
  }, [profile, conversation.id, sendMutation]);

  return {
    profile,
    messages,
    filteredMessages,
    isLoading,
    isMuted,
    canTransfer,
    isGroupCreator,
    isFetchingOlder,
    hasOlderMessages,
    fetchOlderMessages,
    showStats,
    setShowStats,
    showTransferDialog,
    setShowTransferDialog,
    showGroupManagement,
    setShowGroupManagement,
    text,
    setText,
    replyTo,
    setReplyTo,
    editingId,
    editText,
    setEditText,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    showAddMembers,
    setShowAddMembers,
    isRecordingAudio,
    setIsRecordingAudio,
    showScrollDown,
    scrollRef,
    searchInputRef,
    isNearBottomRef,
    checkNearBottom,
    scrollToBottom,
    handleSend,
    handleDelete,
    handleStartEdit,
    handleSaveEdit,
    handleCancelEdit,
    handleCopyMessage,
    handleAudioSend,
    handleFileSent,
    handleSendSticker,
    handleSendAudioMeme,
    handleSendCustomEmoji,
    handleVoiceChange,
    handleSpeedChange,
    sendMutation,
    muteMutation,
    renameConvMutation,
    removeMemberMutation,
    leaveMutation,
    deleteConvMutation,
    tts,
    reactions,
  };
}
