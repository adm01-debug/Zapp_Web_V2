import { useEffect, useMemo } from 'react';
import { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence, motion } from 'framer-motion';
import { AddMembersDialog } from './AddMembersDialog';
import { TeamChatHeader } from './TeamChatHeader';
import { TeamChatInputArea } from './TeamChatInputArea';
import { TeamMessageItem } from './TeamMessageItem';
import { useTeamChatPanel } from './useTeamChatPanel';

interface Props { conversation: TeamConversation; onBack: () => void; onToggleDetails?: () => void; showDetails?: boolean; }

export function TeamChatPanel({ conversation, onBack, onToggleDetails, showDetails }: Props) {
  const s = useTeamChatPanel(conversation);

  useEffect(() => {
    if (s.isNearBottomRef.current && s.scrollRef.current) s.scrollRef.current.scrollTop = s.scrollRef.current.scrollHeight;
  }, [s.filteredMessages.length]);

  useEffect(() => { if (s.scrollRef.current) s.scrollRef.current.scrollTop = s.scrollRef.current.scrollHeight; }, [conversation.id]);
  useEffect(() => { if (s.showSearch) s.searchInputRef.current?.focus(); }, [s.showSearch]);

  const dateFirstIndexes = useMemo(() => {
    const seen = new Set<string>();
    const result = new Set<number>();
    s.filteredMessages.forEach((msg, idx) => {
      const k = format(new Date(msg.created_at), 'yyyy-MM-dd');
      if (!seen.has(k)) { seen.add(k); result.add(idx); }
    });
    return result;
  }, [s.filteredMessages]);

  return (
    <div className="flex flex-col h-full w-full relative">
      <TeamChatHeader
        conversation={conversation} showDetails={showDetails} voiceId={s.tts.voiceId} speed={s.tts.speed}
        showSearch={s.showSearch} isMuted={s.isMuted} onBack={onBack} onToggleDetails={onToggleDetails}
        onToggleSearch={() => { s.setShowSearch(!s.showSearch); if (s.showSearch) s.setSearchQuery(''); }}
        onAddMembers={() => s.setShowAddMembers(true)} onVoiceChange={s.tts.setVoiceId} onSpeedChange={s.tts.setSpeed}
        onToggleMute={() => s.muteMutation.mutate({ conversationId: conversation.id, muted: !s.isMuted })}
      />

      <AnimatePresence>
        {s.showSearch && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-3 py-2 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
              <Input
                ref={s.searchInputRef} value={s.searchQuery}
                onChange={e => s.setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { s.setShowSearch(false); s.setSearchQuery(''); } }}
                placeholder="Buscar nas mensagens..." className="h-8 text-sm"
                aria-label="Campo de busca"
              />
              {s.searchQuery && (
                <span className="text-xs text-muted-foreground whitespace-nowrap" aria-live="polite">
                  {s.filteredMessages.length} resultado{s.filteredMessages.length !== 1 ? 's' : ''}
                </span>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { s.setShowSearch(false); s.setSearchQuery(''); }} aria-label="Fechar busca">
                <X className="w-3.5 h-3.5" aria-hidden />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={s.scrollRef}
        className="flex-1 overflow-auto p-4 space-y-1 bg-muted/5"
        onScroll={s.checkNearBottom}
        role="log" aria-label="Mensagens da conversa" aria-live="polite"
      >
        {s.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
                <Skeleton className="h-10 rounded-2xl" style={{ width: 120 + (i % 3) * 60 }} />
              </div>
            ))}
          </div>
        ) : s.filteredMessages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-12">
            {s.searchQuery ? 'Nenhuma mensagem encontrada' : 'Envie a primeira mensagem!'}
          </div>
        ) : (
          s.filteredMessages.map((msg, idx) => {
            const isMine = msg.sender_id === s.profile?.id;
            const repliedMsg = msg.reply_to_id ? s.messages.find(m => m.id === msg.reply_to_id) ?? null : null;
            const isEditing = s.editingId === msg.id;
            const ttsIsPlaying = s.tts.isPlaying && s.tts.currentMessageId === msg.id;
            const ttsIsLoading = s.tts.isLoading && s.tts.currentMessageId === msg.id;

            return (
              <TeamMessageItem
                key={msg.id}
                msg={msg}
                isMine={isMine}
                showDate={dateFirstIndexes.has(idx)}
                conversationType={conversation.type}
                repliedMsg={repliedMsg}
                isEditing={isEditing}
                editText={s.editText}
                ttsIsPlaying={ttsIsPlaying}
                ttsIsLoading={ttsIsLoading}
                onReply={() => s.setReplyTo(msg)}
                onEdit={() => s.handleStartEdit(msg)}
                onDelete={() => s.handleDelete(msg.id)}
                onCopy={() => s.handleCopyMessage(msg.content)}
                onTtsToggle={() => ttsIsPlaying ? s.tts.stop() : s.tts.speak(msg.content, msg.id)}
                onSaveEdit={s.handleSaveEdit}
                onCancelEdit={s.handleCancelEdit}
                setEditText={s.setEditText}
              />
            );
          })
        )}
      </div>

      {s.showScrollDown && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
          <Button size="icon" variant="secondary" className="rounded-full shadow-lg h-8 w-8" onClick={s.scrollToBottom} aria-label="Rolar para baixo">
            <ArrowDown className="w-4 h-4" aria-hidden />
          </Button>
        </div>
      )}

      <TeamChatInputArea
        conversationId={conversation.id} text={s.text} setText={s.setText} replyTo={s.replyTo}
        isRecordingAudio={s.isRecordingAudio} isPending={s.sendMutation.isPending} onSend={s.handleSend}
        onCancelReply={() => s.setReplyTo(null)} onRecordToggle={() => s.setIsRecordingAudio(!s.isRecordingAudio)}
        onAudioSend={s.handleAudioSend} onSendSticker={s.handleSendSticker} onSendAudioMeme={s.handleSendAudioMeme}
        onSendCustomEmoji={s.handleSendCustomEmoji} onFileSent={s.handleFileSent}
      />

      <AddMembersDialog open={s.showAddMembers} onOpenChange={s.setShowAddMembers} conversation={conversation} />
    </div>
  );
}
