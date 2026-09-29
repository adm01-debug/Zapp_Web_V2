import { useEffect, useMemo, Component, type ReactNode } from 'react';
import { TeamConversation } from '@/hooks/chat/useTeamChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, X, Search, Lock, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence, motion } from 'framer-motion';
import { AddMembersDialog } from './AddMembersDialog';
import { TransferConversationDialog } from './TransferConversationDialog';
import { GroupManagementDialog } from './GroupManagementDialog';
import { TeamChatHeader } from './TeamChatHeader';
import { TeamChatInputArea } from './TeamChatInputArea';
import { useTeamChatPanel } from './useTeamChatPanel';
import { TeamMessageItem } from './TeamMessageItem';

class ChatErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8 text-center">
          Erro ao carregar o chat. Recarregue a página.
        </div>
      );
    }
    return this.props.children;
  }
}

interface Props { conversation: TeamConversation; onBack: () => void; onToggleDetails?: () => void; showDetails?: boolean; }

export function TeamChatPanel({ conversation, onBack, onToggleDetails, showDetails }: Props) {
  const {
    profile, messages, filteredMessages, isLoading, isMuted,
    canTransfer, isGroupCreator,
    showStats, setShowStats,
    showTransferDialog, setShowTransferDialog,
    showGroupManagement, setShowGroupManagement,
    text, setText, replyTo, setReplyTo, editingId, editText, setEditText,
    showSearch, setShowSearch, searchQuery, setSearchQuery,
    showAddMembers, setShowAddMembers, isRecordingAudio, setIsRecordingAudio,
    isFetchingOlder, hasOlderMessages,
    showScrollDown, scrollRef, searchInputRef, isNearBottomRef,
    checkNearBottom, scrollToBottom,
    handleScrollToMessage,
    handleSend, handleDelete, handleStartEdit, handleSaveEdit, handleCancelEdit, handleCopyMessage,
    handleAudioSend, handleFileSent, handleSendSticker, handleSendAudioMeme, handleSendCustomEmoji,
    handlePin, handleArchive,
    handleVoiceChange, handleSpeedChange, sendMutation, muteMutation,
    leaveMutation, renameConvMutation, removeMemberMutation, deleteConvMutation, tts, reactions,
  } = useTeamChatPanel(conversation);

  const convAny = conversation as unknown as Record<string, unknown>;
  const isDeptChannel = !!(convAny.department_id);
  const profileDeptId = (profile as Record<string, unknown>)?.department_id as string | null | undefined;
  const isChannelMember = !isDeptChannel || profileDeptId === convAny.department_id;

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredMessages.length]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [conversation.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (showSearch) searchInputRef.current?.focus(); }, [showSearch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (showSearch) { setShowSearch(false); setSearchQuery(''); }
        else { setShowSearch(true); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSearch, setShowSearch, setSearchQuery]);

  const dateFirstIndexes = useMemo(() => {
    const seen = new Set<string>();
    const result = new Set<number>();
    filteredMessages.forEach((msg, idx) => {
      const k = format(new Date(msg.created_at), 'yyyy-MM-dd');
      if (!seen.has(k)) { seen.add(k); result.add(idx); }
    });
    return result;
  }, [filteredMessages]);

  if (!isChannelMember) {
    return (
      <div className="flex flex-col h-full w-full relative">
        <TeamChatHeader conversation={conversation} showDetails={showDetails} voiceId={tts.voiceId} speed={tts.speed}
          showSearch={false} isMuted={isMuted} onBack={onBack} onToggleDetails={onToggleDetails}
          onToggleSearch={() => {}} onAddMembers={() => {}} onVoiceChange={handleVoiceChange} onSpeedChange={handleSpeedChange}
          onToggleMute={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-inbox-panel">
          <div className="rounded-full bg-muted p-4">
            <Lock className="w-8 h-8 text-muted-foreground" aria-hidden />
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-foreground">Conteúdo Protegido</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Este canal é exclusivo para membros do departamento. Solicite um convite ao administrador.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full relative">
      <TeamChatHeader conversation={conversation} showDetails={showDetails} voiceId={tts.voiceId} speed={tts.speed}
        showSearch={showSearch} showStats={showStats} isMuted={isMuted}
        canTransfer={canTransfer} isGroupCreator={isGroupCreator}
        onBack={onBack} onToggleDetails={onToggleDetails}
        onToggleSearch={() => { setShowSearch(!showSearch); if (showSearch) setSearchQuery(''); }}
        onToggleStats={() => setShowStats(!showStats)}
        onAddMembers={() => setShowAddMembers(true)} onVoiceChange={handleVoiceChange} onSpeedChange={handleSpeedChange}
        onToggleMute={() => muteMutation.mutate({ conversationId: conversation.id, muted: !isMuted })}
        onTransfer={canTransfer ? () => setShowTransferDialog(true) : undefined}
        onRenameGroup={isGroupCreator ? () => setShowGroupManagement(true) : undefined}
        onLeaveGroup={!isGroupCreator && conversation.type === 'group' ? () => leaveMutation.mutate({ conversationId: conversation.id }) : undefined}
        onPin={handlePin}
        onArchive={handleArchive} />

      <AnimatePresence>
        {showSearch && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-3 py-2 border-b border-border bg-chat-header">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input ref={searchInputRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); } }}
                placeholder="Buscar nas mensagens..." className="h-8 text-sm" />
              {searchQuery && <span className="text-xs text-muted-foreground whitespace-nowrap">{filteredMessages.length} resultado{filteredMessages.length !== 1 ? 's' : ''}</span>}
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { setShowSearch(false); setSearchQuery(''); }}><X className="w-3.5 h-3.5" /></Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ChatErrorBoundary>
        <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-1 bg-inbox-panel" onScroll={checkNearBottom} role="log" aria-label="Mensagens da conversa" aria-live="polite">
          {isFetchingOlder && (
            <div className="flex justify-center py-2" aria-label="Carregando mensagens anteriores">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isFetchingOlder && !hasOlderMessages && !isLoading && filteredMessages.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-2 select-none">Início da conversa</p>
          )}
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}><Skeleton className="h-10 rounded-2xl" style={{ width: 120 + (i % 3) * 60 }} /></div>)}</div>
          ) : filteredMessages.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-12">{searchQuery ? 'Nenhuma mensagem encontrada' : 'Envie a primeira mensagem!'}</div>
          ) : (
            filteredMessages.map((msg, idx) => (
              <div
                key={msg.id}
                data-message-id={msg.id}
                onClick={showSearch ? () => handleScrollToMessage(msg.id) : undefined}
                className={showSearch ? 'cursor-pointer rounded-lg transition-colors hover:bg-muted/30' : undefined}
              >
                <TeamMessageItem
                  msg={msg}
                  isMine={msg.sender_id === profile?.id}
                  showDate={dateFirstIndexes.has(idx)}
                  conversationType={conversation.type as 'direct' | 'group'}
                  repliedMsg={msg.reply_to_id ? (messages.find(m => m.id === msg.reply_to_id) ?? null) : null}
                  isEditing={editingId === msg.id}
                  editText={editText}
                  ttsIsPlaying={tts.isPlaying && tts.currentMessageId === msg.id}
                  ttsIsLoading={tts.isLoading && tts.currentMessageId === msg.id}
                  reactions={reactions.aggregate(msg.id)}
                  onReply={() => setReplyTo(msg)}
                  onEdit={() => handleStartEdit(msg)}
                  onDelete={() => handleDelete(msg.id)}
                  onCopy={() => handleCopyMessage(msg.content ?? '')}
                  onTtsToggle={() => { if (tts.isPlaying && tts.currentMessageId === msg.id) tts.stop(); else tts.speak(msg.content ?? '', msg.id); }}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                  setEditText={setEditText}
                  onToggleReaction={emoji => reactions.toggle({ messageId: msg.id, emoji })}
                />
              </div>
            ))
          )}
        </div>
      </ChatErrorBoundary>

      {showScrollDown && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
          <Button variant="secondary" className="rounded-full shadow-lg h-8 px-3 gap-1.5 text-xs" onClick={scrollToBottom}>
            <ArrowDown className="w-3.5 h-3.5" />
            Novas mensagens
          </Button>
        </div>
      )}

      <TeamChatInputArea conversationId={conversation.id} text={text} setText={setText} replyTo={replyTo}
        isRecordingAudio={isRecordingAudio} isPending={sendMutation.isPending} onSend={handleSend}
        onCancelReply={() => setReplyTo(null)} onRecordToggle={() => setIsRecordingAudio(!isRecordingAudio)}
        onAudioSend={handleAudioSend} onSendSticker={handleSendSticker} onSendAudioMeme={handleSendAudioMeme}
        onSendCustomEmoji={handleSendCustomEmoji} onFileSent={handleFileSent} />

      <AddMembersDialog open={showAddMembers} onOpenChange={setShowAddMembers} conversation={conversation} />

      {profile?.id && (
        <TransferConversationDialog
          open={showTransferDialog}
          onOpenChange={setShowTransferDialog}
          conversation={conversation}
          currentUserId={profile.id}
        />
      )}

      {profile?.id && (
        <GroupManagementDialog
          open={showGroupManagement}
          onOpenChange={setShowGroupManagement}
          conversation={conversation}
          isGroupCreator={isGroupCreator}
          currentUserId={profile.id}
          isRenamePending={renameConvMutation.isPending}
          isRemovePending={removeMemberMutation.isPending}
          isLeavePending={leaveMutation.isPending}
          isDeletePending={deleteConvMutation.isPending}
          onRename={name => renameConvMutation.mutate({ conversationId: conversation.id, name })}
          onRemoveMember={profileId => removeMemberMutation.mutate({ conversationId: conversation.id, profileId })}
          onLeave={() => leaveMutation.mutate({ conversationId: conversation.id })}
          onDelete={() => deleteConvMutation.mutate({ conversationId: conversation.id })}
        />
      )}
    </div>
  );
}
