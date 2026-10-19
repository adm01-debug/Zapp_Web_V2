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
import { uploadTeamMedia, TEAM_CHAT_FILES_BUCKET } from '@/hooks/team-chat/uploadTeamMedia';
import { toast } from '@/lib/lazyToast';

const log = getLogger('TeamChatPanel');

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
  const isMuted = useMemo(() => {
    const me = conversation.members?.find(m => m.profile_id === profile?.id);
    return !!me?.is_muted;
  }, [conversation.members, profile?.id]);

  const canTransfer = useMemo(() => {
    const r = (profile as { role?: string } | null)?.role;
    return r === 'admin' || r === 'supervisor';
  }, [profile]);

  const canTransferDepartment = useMemo(
    () => canTransfer && conversation.type === 'department',
    [canTransfer, conversation.type],
  );

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
      const ts = `"${oldestCursor.createdAt}"`;
      const { data, error } = await supabase
        .from('team_messages')
        .select('*, sender:profiles!team_messages_sender_id_fkey(id, name, avatar_url), media_bucket, media_path, status')
        .eq('conversation_id', conversation.id)
        .or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${oldestCursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(60);
      if (error) throw error;
      const older = ((data || []) as TeamMessage[]).reverse();
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

  const searchTerm = debouncedSearchQuery.trim();
  const [serverSearch, setServerSearch] = useState<{ conversationId: string; term: string; results: TeamMessage[] } | null>(null);
  const [serverSearchError, setServerSearchError] = useState<{ conversationId: string; term: string; message: string } | null>(null);

  useEffect(() => {
    if (!searchTerm) return;
    const conversationId = conversation.id;
    let cancelado = false;
    void (async () => {
      const { data, error } = await supabase.rpc('search_team_messages', {
        p_conversation_id: conversationId,
        p_query: searchTerm,
        p_limit: 50,
      });
      if (cancelado) return;
      if (error) {
        log.error('Erro ao buscar mensagens no servidor', error);
        setServerSearch(null);
        setServerSearchError({ conversationId, term: searchTerm, message: 'Não foi possível buscar as mensagens. Tente novamente.' });
        return;
      }
      setServerSearchError(null);
      const rows = (data ?? []) as {
        id: string; sender_id: string; content: string; created_at: string; sender_name: string | null;
      }[];
      setServerSearch({
        conversationId,
        term: searchTerm,
        results: rows.map(row => ({
          id: row.id,
          conversation_id: conversationId,
          sender_id: row.sender_id,
          content: row.content,
          message_type: 'text',
          media_url: null,
          media_type: null,
          reply_to_id: null,
          is_edited: false,
          status: null,
          created_at: row.created_at,
          updated_at: row.created_at,
          sender: { id: row.sender_id, name: row.sender_name ?? 'Usuário', avatar_url: null },
        })),
      });
    })();
    return () => { cancelado = true; };
  }, [searchTerm, conversation.id]);

  const searchActive = searchTerm.length > 0;
  const serverSearchMatches = serverSearch?.conversationId === conversation.id
    && serverSearch?.term === searchTerm;
  const searchError = searchActive
    && serverSearchError?.conversationId === conversation.id
    && serverSearchError.term === searchTerm
    ? serverSearchError.message
    : null;
  const isSearching = searchActive && !searchError && !serverSearchMatches;

  const filteredMessages = useMemo(() => {
    if (!searchActive) return messages;
    if (!serverSearchMatches || !serverSearch) return [];
    return serverSearch.results;
  }, [messages, searchActive, serverSearchMatches, serverSearch]);

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

  const handleAudioSend = useCallback(async (blob: Blob): Promise<boolean> => {
    if (!profile?.id) return false;
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
    isSearching,
    searchError,
    isLoading,
    isMuted,
    canTransfer,
    canTransferDepartment,
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
