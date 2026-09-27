import { useState, useRef, useCallback, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { useAuth } from '@/hooks/auth/useAuth';
import { useTextToSpeech } from '@/hooks/communication/useTextToSpeech';
import { useUserSettings } from '@/hooks/system/useUserSettings';
import { useTeamMessages, useSendTeamMessage, useDeleteTeamMessage, useEditTeamMessage, useToggleMuteConversation, TeamMessage, TeamConversation } from '@/hooks/chat/useTeamChat';
import { useTeamMessageReactions } from '@/hooks/team-chat/useTeamMessageReactions';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const log = getLogger('TeamChatPanel');

export function useTeamChatPanel(conversation: TeamConversation) {
  const { profile } = useAuth();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<TeamMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);

  const { messages, isLoading } = useTeamMessages(conversation.id);
  const sendMutation = useSendTeamMessage();
  const deleteMutation = useDeleteTeamMessage();
  const editMutation = useEditTeamMessage();
  const muteMutation = useToggleMuteConversation();
  const reactions = useTeamMessageReactions(conversation.id);

  const { settings } = useUserSettings();
  const isMuted = useMemo(() => {
    const muted = settings?.muted_conversations as string[] | undefined;
    return Array.isArray(muted) && muted.includes(conversation.id);
  }, [settings, conversation.id]);

  const tts = useTextToSpeech();

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.content?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

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
        senderId: profile.id,
        replyToId: reply?.id,
      });
    } catch (err) {
      log.error('Erro ao enviar mensagem', err);
      toast.error('Erro ao enviar mensagem');
    }
  }, [text, profile?.id, replyTo, conversation.id, sendMutation]);

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
  }, [profile?.id, conversation.id, sendMutation]);

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
  }, [profile?.id, conversation.id, sendMutation]);

  const handleSendSticker = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '🎨 Figurinha',
      senderId: profile.id,
      mediaUrl: url,
      mediaType: 'sticker',
    });
  }, [profile?.id, conversation.id, sendMutation]);

  const handleSendAudioMeme = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '🎵 Áudio meme',
      senderId: profile.id,
      mediaUrl: url,
      mediaType: 'audio_meme',
    });
  }, [profile?.id, conversation.id, sendMutation]);

  const handleSendCustomEmoji = useCallback(async (url: string) => {
    if (!profile?.id) return;
    await sendMutation.mutateAsync({
      conversationId: conversation.id,
      content: '😀 Emoji',
      senderId: profile.id,
      mediaUrl: url,
      mediaType: 'emoji',
    });
  }, [profile?.id, conversation.id, sendMutation]);

  return {
    profile,
    messages,
    filteredMessages,
    isLoading,
    isMuted,
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
    sendMutation,
    muteMutation,
    tts,
    reactions,
  };
}
