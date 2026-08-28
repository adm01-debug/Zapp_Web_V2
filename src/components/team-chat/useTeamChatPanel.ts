import { useState, useRef, useCallback, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { useAuth } from '@/hooks/auth/useAuth';
import { useTextToSpeech } from '@/hooks/communication/useTextToSpeech';
import { useUserSettings } from '@/hooks/system/useUserSettings';
import { useTeamMessages, useSendTeamMessage, useDeleteTeamMessage, useEditTeamMessage, useToggleMuteConversation, TeamMessage, TeamConversation } from '@/hooks/chat/useTeamChat';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const log = getLogger('useTeamChatPanel');

export function useTeamChatPanel(conversation: TeamConversation) {
  const { profile } = useAuth();
  const { data: messages = [], isLoading } = useTeamMessages(conversation.id);
  const sendMutation = useSendTeamMessage();
  const deleteMutation = useDeleteTeamMessage();
  const editMutation = useEditTeamMessage();
  const muteMutation = useToggleMuteConversation();

  const currentMember = conversation.members?.find(m => m.profile_id === profile?.id);
  const isMuted = currentMember?.is_muted ?? false;

  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [replyTo, setReplyTo] = useState<TeamMessage | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { settings, updateSettings, saveSettings } = useUserSettings();
  const handleVoiceChange = (v: string) => { updateSettings({ tts_voice_id: v }); setTimeout(() => saveSettings(), 100); };
  const handleSpeedChange = (s: number) => { updateSettings({ tts_speed: s }); setTimeout(() => saveSettings(), 100); };
  const tts = useTextToSpeech({
    initialVoiceId: settings.tts_voice_id, initialSpeed: settings.tts_speed,
    onVoiceChange: handleVoiceChange, onSpeedChange: handleSpeedChange,
  });

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    isNearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
  }, []);

  const scrollToBottom = useCallback(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(
      { conversationId: conversation.id, content: trimmed, replyToId: replyTo?.id },
      { onError: (err) => { log.error('Failed to send:', err); toast.error('Falha ao enviar mensagem.'); setText(trimmed); } }
    );
    setText(''); setReplyTo(null);
  }, [text, sendMutation, conversation.id, replyTo]);

  const handleSendMedia = useCallback((mediaUrl: string, mediaType: string, content?: string) => {
    sendMutation.mutate(
      { conversationId: conversation.id, content: content || '', mediaUrl, mediaType, replyToId: replyTo?.id },
      { onError: (err) => { log.error('Failed to send media:', err); toast.error('Falha ao enviar mídia.'); } }
    );
    setReplyTo(null);
  }, [sendMutation, conversation.id, replyTo]);

  const handleSendSticker = useCallback((url: string) => handleSendMedia(url, 'sticker', '🎨 Figurinha'), [handleSendMedia]);
  const handleSendAudioMeme = useCallback((url: string) => handleSendMedia(url, 'audio_meme', '🎵 Áudio meme'), [handleSendMedia]);
  const handleSendCustomEmoji = useCallback((url: string) => handleSendMedia(url, 'emoji', '😀 Emoji'), [handleSendMedia]);
  const handleFileSent = useCallback((mediaUrl: string, mediaType: string, fileName: string) => handleSendMedia(mediaUrl, mediaType, fileName), [handleSendMedia]);

  const handleAudioSend = useCallback(async (blob: Blob) => {
    setIsRecordingAudio(false);
    try {
      const path = `${profile?.id}/${conversation.id}/${Date.now()}.webm`;
      const { error } = await supabase.storage.from('team-chat-files').upload(path, blob, { contentType: 'audio/webm' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('team-chat-files').getPublicUrl(path);
      handleSendMedia(urlData.publicUrl, 'audio', '🎤 Mensagem de áudio');
    } catch (err) { toast.error('Erro ao enviar áudio'); log.error('Audio upload error:', err); }
  }, [profile?.id, conversation.id, handleSendMedia]);

  const handleDelete = useCallback((msgId: string) => {
    deleteMutation.mutate({ messageId: msgId, conversationId: conversation.id },
      { onError: (err) => { log.error('Failed to delete:', err); toast.error('Falha ao excluir.'); } });
  }, [deleteMutation, conversation.id]);

  const handleStartEdit = useCallback((msg: TeamMessage) => { setEditingId(msg.id); setEditText(msg.content || ''); }, []);
  const handleSaveEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (!editingId || !trimmed) { handleCancelEdit(); return; }
    editMutation.mutate({ messageId: editingId, content: trimmed, conversationId: conversation.id },
      { onError: (err) => { log.error('Failed to edit:', err); toast.error('Falha ao editar.'); } });
    setEditingId(null); setEditText('');
  }, [editingId, editText, editMutation, conversation.id]);

  const handleCancelEdit = useCallback(() => { setEditingId(null); setEditText(''); }, []);
  const handleCopyMessage = useCallback((content: string | null) => {
    if (!content) return;
    navigator.clipboard.writeText(content).then(() => toast.success('Copiado!')).catch(() => toast.error('Erro ao copiar'));
  }, []);

  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter(m => m.content?.toLowerCase().includes(q));
  }, [messages, searchQuery]);

  return {
    profile, messages, isLoading, isMuted, filteredMessages,
    text, setText, editingId, editText, setEditText,
    isRecordingAudio, setIsRecordingAudio, replyTo, setReplyTo,
    showScrollDown, showAddMembers, setShowAddMembers,
    showSearch, setShowSearch, searchQuery, setSearchQuery,
    scrollRef, isNearBottomRef, searchInputRef,
    tts, muteMutation, sendMutation,
    checkNearBottom, scrollToBottom, handleSend, handleSendSticker, handleSendAudioMeme,
    handleSendCustomEmoji, handleFileSent, handleAudioSend,
    handleDelete, handleStartEdit, handleSaveEdit, handleCancelEdit, handleCopyMessage,
  };
}
