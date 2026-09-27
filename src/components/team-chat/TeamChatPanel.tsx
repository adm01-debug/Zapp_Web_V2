import { useEffect, useMemo, useRef, useCallback } from 'react';
import { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, Search, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence, motion } from 'framer-motion';
import { AddMembersDialog } from './AddMembersDialog';
import { TeamChatHeader } from './TeamChatHeader';
import { TeamChatInputArea } from './TeamChatInputArea';
import { TeamMessageItem } from './TeamMessageItem';
import { useTeamChatPanel } from './useTeamChatPanel';
import { useVirtualizer } from '@tanstack/react-virtual';

interface Props { conversation: TeamConversation; onBack: () => void; onToggleDetails?: () => void; showDetails?: boolean; }

export function TeamChatPanel({ conversation, onBack, onToggleDetails, showDetails }: Props) {
  const s = useTeamChatPanel(conversation);
  const didInitialScrollRef = useRef(false);
  const prevCountRef = useRef(0);

  const rowVirtualizer = useVirtualizer({
    count: s.filteredMessages.length,
    getScrollElement: () => s.scrollRef.current,
    estimateSize: () => 80,
    overscan: 8,
  });

  useEffect(() => {
    didInitialScrollRef.current = false;
    prevCountRef.current = 0;
  }, [conversation.id]);

  useEffect(() => { if (s.showSearch) s.searchInputRef.current?.focus(); }, [s.showSearch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        s.setShowSearch(prev => !prev);
        s.setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [s.setShowSearch, s.setSearchQuery]);

  useEffect(() => {
    const count = s.filteredMessages.length;
    if (count === 0) return;
    const el = s.scrollRef.current;
    if (!el) return;
    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      prevCountRef.current = count;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (count > prevCountRef.current && s.isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevCountRef.current = count;
  }, [s.filteredMessages.length]);

  const handleScroll = useCallback(() => {
    s.checkNearBottom();
    const el = s.scrollRef.current;
    if (el && el.scrollTop < 100) void s.fetchOlderMessages();
  }, [s.checkNearBottom, s.fetchOlderMessages]);

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
        showSearch={s.showSearch} showStats={s.showStats} isMuted={s.isMuted} onBack={onBack} onToggleDetails={onToggleDetails}
        onToggleSearch={() => { s.setShowSearch(!s.showSearch); if (s.showSearch) s.setSearchQuery(''); }}
        onToggleStats={() => s.setShowStats(!s.showStats)}
        onAddMembers={() => s.setShowAddMembers(true)} onVoiceChange={s.tts.setVoiceId} onSpeedChange={s.tts.setSpeed}
        onToggleMute={() => s.muteMutation.mutate({ conversationId: conversation.id, muted: !s.isMuted })}
        canTransfer={s.canTransfer}
        onTransfer={() => s.setShowTransferDialog(true)}
      />

      <AnimatePresence>
        {s.showStats && (
          <motion.div
            key="stats-slot"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-border bg-muted/30 px-4 py-3 overflow-hidden"
            aria-label="Painel de estatísticas"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estatísticas da conversa</span>
              <span className="text-[10px] text-muted-foreground/60 italic">Disponível em breve</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Mensagens', icon: '💬' },
                { label: 'Membros ativos', icon: '👥' },
                { label: 'Tempo médio', icon: '⏱' },
              ].map(({ label, icon }) => (
                <div key={label} className="bg-background/60 rounded-lg px-3 py-2 text-center border border-border/30">
                  <p className="text-base leading-none mb-1">{icon}</p>
                  <p className="text-lg font-bold text-foreground/20 tabular-nums leading-none">—</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {s.showSearch && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-3 py-2 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
              <Input
                ref={s.searchInputRef} value={s.searchQuery}
                onChange={e => s.setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { s.setShowSearch(false); s.setSearchQuery(''); } }}
                placeholder="Buscar nas mensagens... (⌘K)" className="h-8 text-sm"
                aria-label="Campo de busca"
              />
              {s.searchQuery && (
                <span className="text-xs text-muted-foreground whitespace-nowrap" aria-live="polite">
                  {s.filteredMessages.length} resultado{s.filteredMessages.length !== 1 ? 's' : ''}
                </span>
              )}
              <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { s.setShowSearch(false); s.setSearchQuery(''); }} aria-label="Fechar busca">
                <X className="w-3.5 h-3.5" aria-hidden />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={s.scrollRef}
        className="flex-1 overflow-auto bg-muted/5"
        onScroll={handleScroll}
        role="log" aria-label="Mensagens da conversa" aria-live="polite"
      >
        {s.isFetchingOlder && (
          <div className="sticky top-0 z-10 flex justify-center py-2 bg-muted/5">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-label="Carregando mensagens anteriores" />
          </div>
        )}
        {s.isLoading ? (
          <div className="space-y-3 p-4">
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
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map(virtualItem => {
              const msg = s.filteredMessages[virtualItem.index];
              const isMine = msg.sender_id === s.profile?.id;
              const repliedMsg = msg.reply_to_id ? s.messages.find(m => m.id === msg.reply_to_id) ?? null : null;
              const isEditing = s.editingId === msg.id;
              const ttsIsPlaying = s.tts.isPlaying && s.tts.currentMessageId === msg.id;
              const ttsIsLoading = s.tts.isLoading && s.tts.currentMessageId === msg.id;

              return (
                <div
                  key={msg.id}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualItem.start}px)` }}
                  className="px-4 py-0.5"
                >
                  <TeamMessageItem
                    msg={msg}
                    isMine={isMine}
                    showDate={dateFirstIndexes.has(virtualItem.index)}
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {s.showScrollDown && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10">
          <Button type="button" size="icon" variant="secondary" className="rounded-full shadow-lg h-8 w-8" onClick={s.scrollToBottom} aria-label="Rolar para baixo">
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
