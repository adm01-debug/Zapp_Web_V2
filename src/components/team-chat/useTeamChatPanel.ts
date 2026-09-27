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
import { toast } from 'sonner';

const log = getLogger('TeamChatPanel');

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
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
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [hasOlderMessages, setHasOlderMessages] = useState(true);
  const [isFetchingOlder, setIsFetchingOlder] = useState(false);

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
    const muted = settings?.muted_conversations as string[] | undefined;
    return Array.isArray(muted) && muted.includes(conversation.id);
  }, [settings, conversation.id]);

  const canTransfer = useMemo(() => {
    const r = (profile as { role?: string } | null)?.role;
    return r === 'admin' || r === 'supervisor';
  }, [profile]);

  const isGroupCreator = useMemo(() => {
    return !!(profile?.id && conversation.created_by === profile.id);
  }, [profile?.id, conversation.created_by]);

  const ttsOptions = useMemo(() => ({
    initialVoiceId: settingsLoading ? undefined : settings.tts_voice_id,
    initialSpeed: settingsLoading ? undefined : settings.tts_speed,
  }), [settingsLoading, settings.tts_voice_id, settings.tts_speed]);

  const tts = useTextToSpeech(ttsOptions);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleVoiceChange = useCallback((newVoiceId: string) => {
    tts.setVoiceId(newVoiceId);
    if (!profile?.id) return;
    void supabase.from('user_settings').upsert(
      { user_id: profile.id, tts_voice_id: newVoiceId },
      { onConflict: 'user_id' },
    );
  }, [tts.setVoiceId, profile]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleSpeedChange = useCallback((newSpeed: number) => {
    tts.setSpeed(newSpeed);
    if (!profile?.id) return;
    void supabase.from('user_settings').upsert(
      { user_id: profile.id, tts_speed: newSpeed },
      { onConflict: 'user_id' },
    );
  }, [tts.setSpeed, profile]);

  const messages = useMemo(() => {
    const ids = new Set<string>();
    const combined: TeamMessage[] = [];
    for (const m of [...olderMessages, ...newestMessages]) {
      if (!ids.has(m.id)) { ids.add(m.id); combined.push(m); }
    }
    return combined;
  }, [olderMessages, newestMessages]);

  useEffect(() => {
    if (newestMessages.length > 0 && oldestCursor === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOldestCursor(newestMessages[0].created_at);
    }
  }, [newestMessages, oldestCursor]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOlderMessages([]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOldestCursor(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasOlderMessages(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowStats(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowTransferDialog(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowGroupManagement(false);
  }, [conversation.id]);

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
      const { data, error } = await supabase
        .from('team_messages')
        .select('*, sender:profiles!team_messages_sender_id_fkey(id, name, avatar_url), media_bucket, media_path, status')
        .eq('conversation_id', conversation.id)
        .lt('created_at', oldestCursor)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      const older = ((data || []) as TeamMessage[]).reverse();
      if (older.length === 0) {
        setHasOlderMessages(false);
      } else {
        setOldestCursor(older[0].created_at);
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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
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
        senderId: profile.id,
        replyToId: reply?.id,
      });
    } catch (err) {
      log.error('Erro ao enviar mensagem', err);
      toast.error('Erro ao enviar mensagem');
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
    if (!editingId || !editText.trim()) return;
    try {
      await editMutation.mutateAsync({ messageId: editingId, content: editText.trim(), conversationId: conversation.id });
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

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleAudioSend = useCallback(async (blob: Blob) => {
    if (!profile?.id) return;
    const fileName = `audio-${Date.now()}.webm`;
    const { data, error } = await supabase.storage.from('team-chat-files').upload(
      `${conversation.id}/${fileName}`,
      blob,
      { contentType: 'audio/webm', upsert: false },
    );
    if (error) { toast.error('Erro ao enviar áudio'); return; }
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '🎤 Mensagem de áudio',
      senderId: profile.id,
      mediaPath: data.path,
      mediaBucket: 'team-chat-files',
      mediaType: 'audio',
    });
  }, [profile, conversation.id, sendMutation]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleFileSent = useCallback(async ({ path, bucket, type, name }: { path: string; bucket: string; type: string; name: string }) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: name,
      senderId: profile.id,
      mediaPath: path,
      mediaBucket: bucket,
      mediaType: type as TeamMessage['media_type'],
    });
  }, [profile, conversation.id, sendMutation]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleSendSticker = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '🎨 Figurinha',
      senderId: profile.id,
      mediaUrl: url,
      mediaType: 'sticker',
    });
  }, [profile, conversation.id, sendMutation]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleSendAudioMeme = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '🎵 Áudio meme',
      senderId: profile.id,
      mediaUrl: url,
      mediaType: 'audio_meme',
    });
  }, [profile, conversation.id, sendMutation]);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const handleSendCustomEmoji = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '😀 Emoji',
      senderId: profile.id,
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
