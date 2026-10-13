import { useEffect, useMemo, useRef, useState } from 'react';
import { TeamConversation } from '@/hooks/chat/useTeamChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, Loader2, Lock, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { AnimatePresence, motion } from 'framer-motion';
import { AddMembersDialog } from './AddMembersDialog';
import { TeamChatHeader } from './TeamChatHeader';
import { TeamChatInputArea } from './TeamChatInputArea';
import { TeamMessageItem } from './TeamMessageItem';
import { useTeamChatPanel } from './useTeamChatPanel';
import { useTeamTyping } from '@/hooks/team-chat/useTeamTyping';
import { useTeamPresence } from '@/hooks/team-chat/useTeamPresence';
import { TeamChatSkipLink, TeamChatAnnouncer } from './TeamChatA11y';

/* eslint-disable react-hooks/refs, react-hooks/immutability */

interface Props { conversation: TeamConversation; onBack: () => void; onToggleDetails?: () => void; showDetails?: boolean; }

/** Janela de renderização da lista de mensagens (sem dependência nova). */
const MESSAGE_WINDOW = 200;

export function TeamChatPanel({ conversation, onBack, onToggleDetails, showDetails }: Props) {
  const s = useTeamChatPanel(conversation);

  // PD-69 / F85 / F86: a digitação e a presença vêm dos canais privados
  // `team-typing-<conversa>` e `team-presence-<conversa>` (RLS em realtime.messages).
  const { typingLabel, sendTyping } = useTeamTyping(conversation.id, s.profile?.id ?? null, s.profile?.name);
  const { onlineCount } = useTeamPresence(conversation.id, s.profile?.id ?? null, s.profile?.name);

  const handleTextChange = (value: string) => {
    s.setText(value);
    sendTyping(value.length > 0);
  };

  // Listas longas não viram centenas de nós no DOM: renderiza a janela final e
  // deixa o restante (já carregado) a um clique.
  const totalMessages = s.filteredMessages.length;
  const [showAllMessages, setShowAllMessages] = useState(false);
  const windowStart = !showAllMessages && totalMessages > MESSAGE_WINDOW ? totalMessages - MESSAGE_WINDOW : 0;
  const visibleMessages = windowStart > 0 ? s.filteredMessages.slice(windowStart) : s.filteredMessages;

  // Contagem das mensagens que chegaram longe do fim da lista.
  const seenCountRef = useRef(0);
  if (s.isNearBottomRef.current) seenCountRef.current = totalMessages;
  const unseenCount = s.showScrollDown ? Math.max(0, totalMessages - seenCountRef.current) : 0;

  const lastIncoming = totalMessages > 0 ? s.filteredMessages[totalMessages - 1] : null;
  const announcement = typingLabel
    ?? (lastIncoming && lastIncoming.sender_id !== s.profile?.id
      ? `Nova mensagem de ${lastIncoming.sender?.name ?? 'alguém'}: ${lastIncoming.content}`
      : '');

  // E68: department channel access check
  const convAny = conversation as unknown as Record<string, unknown>;
  const isDeptChannel = !!(convAny.department_id);
  const profileDeptId = (s.profile as Record<string, unknown>)?.department_id as string | null | undefined;
  const isChannelMember = !isDeptChannel || profileDeptId === convAny.department_id;

  // E73: render performance monitoring (dev only)
  const renderStartRef = useRef<number>(0);
  // eslint-disable-next-line react-hooks/purity
  if (process.env.NODE_ENV === 'development') renderStartRef.current = performance.now();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const elapsed = performance.now() - renderStartRef.current;
    if (elapsed > 16) console.warn(`[TeamChatPanel] render ${elapsed.toFixed(1)}ms (>16ms)`);
  });

  useEffect(() => {
    if (s.isNearBottomRef.current && s.scrollRef.current) {
      s.scrollRef.current.scrollTop = s.scrollRef.current.scrollHeight;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.filteredMessages.length]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (s.scrollRef.current) s.scrollRef.current.scrollTop = s.scrollRef.current.scrollHeight; }, [conversation.id]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (s.showSearch) s.searchInputRef.current?.focus(); }, [s.showSearch]);

  const dateFirstIndexes = useMemo(() => {
    const seen = new Set<string>();
    const result = new Set<number>();
    visibleMessages.forEach((msg, idx) => {
      const k = format(new Date(msg.created_at), 'yyyy-MM-dd');
      if (!seen.has(k)) {
        seen.add(k);
        result.add(idx);
      }
    });
    return result;
  }, [visibleMessages]);

  // TC-006: o scroll é o gatilho real da paginação. Antes o hook tinha
  // `fetchOlderMessages`/`oldestCursor` prontos, mas nada no Panel os chamava —
  // as mensagens antigas ficavam inalcançáveis. Ao chegar no topo (ou ao tocar
  // no botão), busca o lote anterior.
  const handleScroll = () => {
    s.checkNearBottom();
    const el = s.scrollRef.current;
    if (el && el.scrollTop < 80 && s.hasOlderMessages && !s.isFetchingOlder) {
      void s.fetchOlderMessages();
    }
  };

  // E68: locked view for non-members of department channels
  if (!isChannelMember) {
    return (
      <div className="flex flex-col h-full w-full relative">
        <TeamChatHeader conversation={conversation} showDetails={showDetails} voiceId={s.tts.voiceId} speed={s.tts.speed}
          showSearch={false} isMuted={s.isMuted} onBack={onBack} onToggleDetails={onToggleDetails}
          onToggleSearch={() => {}} onAddMembers={() => {}} onVoiceChange={s.tts.setVoiceId} onSpeedChange={s.tts.setSpeed}
          onToggleMute={() => {}} />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 bg-muted/5">
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
      <TeamChatSkipLink />
      <TeamChatAnnouncer message={announcement} />
      <TeamChatHeader conversation={conversation} showDetails={showDetails} voiceId={s.tts.voiceId} speed={s.tts.speed}
        typingLabel={typingLabel} onlineCount={onlineCount}
        showSearch={s.showSearch} isMuted={s.isMuted} onBack={onBack} onToggleDetails={onToggleDetails}
        onToggleSearch={() => { s.setShowSearch(!s.showSearch); if (s.showSearch) s.setSearchQuery(''); }}
        onAddMembers={() => s.setShowAddMembers(true)} onVoiceChange={s.tts.setVoiceId} onSpeedChange={s.tts.setSpeed}
        onToggleMute={() => s.muteMutation.mutate({ conversationId: conversation.id, muted: !s.isMuted })} />

      <AnimatePresence>
        {s.showSearch && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="px-3 py-2 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input ref={s.searchInputRef} value={s.searchQuery} onChange={e => s.setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { s.setShowSearch(false); s.setSearchQuery(''); } }}
                placeholder="Buscar nas mensagens..." className="h-8 text-sm" />
              {s.searchQuery && <span className="text-xs text-muted-foreground whitespace-nowrap">{s.filteredMessages.length} resultado{s.filteredMessages.length !== 1 ? 's' : ''}</span>}
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { s.setShowSearch(false); s.setSearchQuery(''); }} aria-label="Fechar busca"><X className="w-3.5 h-3.5" /></Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div id="team-chat-messages" tabIndex={-1} ref={s.scrollRef} className="flex-1 overflow-auto p-4 bg-muted/5" onScroll={handleScroll} role="log" aria-label="Mensagens da conversa" aria-live="polite">
        {s.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}><Skeleton className="h-10 rounded-2xl" style={{ width: 120 + (i % 3) * 60 }} /></div>)}</div>
        ) : s.filteredMessages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-12">{s.searchQuery ? 'Nenhuma mensagem encontrada' : 'Envie a primeira mensagem!'}</div>
        ) : (
          <>
            {windowStart > 0 && (
              <div className="flex justify-center py-2">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setShowAllMessages(true)}>
                  Mostrar as {windowStart} mensagens anteriores
                </Button>
              </div>
            )}
            {s.hasOlderMessages && !s.searchQuery && (
              <div className="flex justify-center py-2">
                <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground" disabled={s.isFetchingOlder} onClick={() => { void s.fetchOlderMessages(); }}>
                  {s.isFetchingOlder && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
                  Carregar mensagens anteriores
                </Button>
              </div>
            )}
            <div role="list" aria-label="Mensagens" className="space-y-1">
            {visibleMessages.map((msg, idx) => {
              const showDate = dateFirstIndexes.has(idx);
              const isMine = msg.sender_id === s.profile?.id;
              const isEditing = s.editingId === msg.id;
              const repliedMsg = msg.reply_to_id ? s.messages.find(m => m.id === msg.reply_to_id) ?? null : null;
              const isThisTtsPlaying = s.tts.isPlaying && s.tts.currentMessageId === msg.id;
              const isThisTtsLoading = s.tts.isLoading && s.tts.currentMessageId === msg.id;

              return (
                <div
                  key={msg.id}
                  role="listitem"
                  data-index={windowStart + idx}
                  aria-posinset={windowStart + idx + 1}
                  aria-setsize={totalMessages}
                >
                <TeamMessageItem
                  msg={msg}
                  isMine={isMine}
                  showDate={showDate}
                  conversationType={conversation.type}
                  repliedMsg={repliedMsg}
                  isEditing={isEditing}
                  editText={s.editText}
                  ttsIsPlaying={isThisTtsPlaying}
                  ttsIsLoading={isThisTtsLoading}
                  reactions={s.reactions.aggregate(msg.id)}
                  onReply={() => s.setReplyTo(msg)}
                  onEdit={() => s.handleStartEdit(msg)}
                  onDelete={() => s.handleDelete(msg.id)}
                  onCopy={() => s.handleCopyMessage(msg.content)}
                  onTtsToggle={() => (isThisTtsPlaying ? s.tts.stop() : s.tts.speak(msg.content, msg.id))}
                  onSaveEdit={s.handleSaveEdit}
                  onCancelEdit={s.handleCancelEdit}
                  setEditText={s.setEditText}
                  onToggleReaction={(emoji) => s.reactions.toggle({ messageId: msg.id, emoji })}
                />
                </div>
              );
            })}
            </div>
          </>
        )}
      </div>

      {s.showScrollDown && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1">
          {unseenCount > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-3xs font-medium text-primary-foreground shadow">
              {unseenCount} {unseenCount === 1 ? 'nova mensagem' : 'novas mensagens'}
            </span>
          )}
          <Button size="icon" variant="secondary" className="rounded-full shadow-lg h-8 w-8" onClick={s.scrollToBottom} aria-label="Voltar ao final"><ArrowDown className="w-4 h-4" /></Button>
        </div>
      )}

      <TeamChatInputArea conversationId={conversation.id} text={s.text} setText={handleTextChange} replyTo={s.replyTo}
        isRecordingAudio={s.isRecordingAudio} isPending={s.sendMutation.isPending} onSend={s.handleSend}
        onCancelReply={() => s.setReplyTo(null)} onRecordToggle={() => s.setIsRecordingAudio(!s.isRecordingAudio)}
        onAudioSend={s.handleAudioSend} onSendSticker={s.handleSendSticker} onSendAudioMeme={s.handleSendAudioMeme}
        onSendCustomEmoji={s.handleSendCustomEmoji} onFileSent={s.handleFileSent} />

      <AddMembersDialog open={s.showAddMembers} onOpenChange={s.setShowAddMembers} conversation={conversation} />
    </div>
  );
}
