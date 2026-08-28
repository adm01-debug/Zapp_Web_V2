import { useEffect, useMemo, memo } from 'react';
import { TeamConversation } from '@/hooks/chat/useTeamChat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowDown, Pencil, Trash2, X, Check, Reply, Image as ImageIcon, Music, FileText, Video, Copy, Volume2, VolumeX, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { MarkdownPreview } from '@/components/inbox/chat/MarkdownPreview';
import { AnimatePresence, motion } from 'framer-motion';
import { AddMembersDialog } from './AddMembersDialog';
import { TeamChatHeader } from './TeamChatHeader';
import { TeamChatInputArea } from './TeamChatInputArea';
import { useTeamChatPanel } from './useTeamChatPanel';

import { TeamMessage } from '@/hooks/chat/useTeamChat';
import { isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatTime(dateStr: string) { return format(new Date(dateStr), 'HH:mm'); }
function formatDateSep(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Hoje';
  if (isYesterday(d)) return 'Ontem';
  return format(d, "d 'de' MMMM", { locale: ptBR });
}

const MediaContent = memo(function MediaContent({ msg }: { msg: TeamMessage }) {
  if (!msg.media_url) return null;
  switch (msg.media_type) {
    case 'image': case 'sticker': case 'emoji':
      return <img src={msg.media_url} alt="media" className={cn("rounded-lg max-h-48 object-contain cursor-pointer", msg.media_type === 'sticker' || msg.media_type === 'emoji' ? 'w-24 h-24' : 'max-w-full')} onClick={() => window.open(msg.media_url!, '_blank')} />;
    case 'video': return <video src={msg.media_url} controls className="rounded-lg max-h-48 max-w-full" />;
    case 'audio': case 'audio_meme': {
      const isWebm = msg.media_url?.endsWith('.webm');
      return (
        <div className="flex flex-col gap-1 w-full max-w-[240px]">
          <audio src={msg.media_url} controls className="w-full" />
          {isWebm && (
            <p className="text-[9px] opacity-60 italic px-1">
              Nota: Áudio WebM pode não ser compatível com Safari/iOS.
            </p>
          )}
        </div>
      );
    }
    case 'document': return <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"><FileText className="w-5 h-5 text-muted-foreground shrink-0" /><span className="text-sm text-foreground underline truncate">{msg.content || 'Documento'}</span></a>;
    default: return null;
  }
});

const MediaTypeIcon = memo(function MediaTypeIcon({ type }: { type: string | null }) {
  switch (type) {
    case 'image': return <ImageIcon className="w-3 h-3" />;
    case 'video': return <Video className="w-3 h-3" />;
    case 'audio': case 'audio_meme': return <Music className="w-3 h-3" />;
    case 'document': return <FileText className="w-3 h-3" />;
    default: return null;
  }
});

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
      if (!seen.has(k)) {
        seen.add(k);
        result.add(idx);
      }
    });
    return result;
  }, [s.filteredMessages]);

  return (
    <div className="flex flex-col h-full w-full relative">
      <TeamChatHeader conversation={conversation} showDetails={showDetails} voiceId={s.tts.voiceId} speed={s.tts.speed}
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
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { s.setShowSearch(false); s.setSearchQuery(''); }}><X className="w-3.5 h-3.5" /></Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={s.scrollRef} className="flex-1 overflow-auto p-4 space-y-1 bg-muted/5" onScroll={s.checkNearBottom} role="log" aria-label="Mensagens da conversa" aria-live="polite">
        {s.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}><Skeleton className="h-10 rounded-2xl" style={{ width: 120 + (i % 3) * 60 }} /></div>)}</div>
        ) : s.filteredMessages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-12">{s.searchQuery ? 'Nenhuma mensagem encontrada' : 'Envie a primeira mensagem!'}</div>
        ) : (
          s.filteredMessages.map((msg, idx) => {
            const showDate = dateFirstIndexes.has(idx);
            const isMine = msg.sender_id === s.profile?.id;
            const isEditing = s.editingId === msg.id;
            const hasMedia = !!msg.media_url;
            const repliedMsg = msg.reply_to_id ? s.messages.find(m => m.id === msg.reply_to_id) : null;
            const isThisTtsPlaying = s.tts.isPlaying && s.tts.currentMessageId === msg.id;
            const isThisTtsLoading = s.tts.isLoading && s.tts.currentMessageId === msg.id;
            const cleanText = msg.content?.replace(/\[.*?\]/g, '').replace(/https?:\/\/\S+/g, '').trim();

            return (
              <ContextMenu key={msg.id}>
                <ContextMenuTrigger asChild>
                  <div id={`msg-${msg.id}`} className="scroll-mt-20">
                    {showDate && <div className="flex justify-center py-4"><span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground bg-muted/30 px-4 py-1.5 rounded-full border border-border/10">{formatDateSep(msg.created_at)}</span></div>}
                    <div className={cn("flex gap-3 py-1 group", isMine ? "flex-row-reverse" : "flex-row")}>
                      {!isMine && <Avatar className="w-8 h-8 mt-1 shrink-0 border border-border/10 shadow-sm"><AvatarImage src={msg.sender?.avatar_url || undefined} /><AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">{msg.sender?.name?.charAt(0) || '?'}</AvatarFallback></Avatar>}
                      <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm relative transition-all duration-300", 
                        isMine ? "bg-primary text-primary-foreground rounded-tr-none border border-primary/20" : "bg-card border border-border/50 text-foreground rounded-tl-none")}>
                        {!isMine && conversation.type === 'group' && <p className="text-[10px] font-bold mb-1 text-primary/80 uppercase tracking-tighter">{msg.sender?.name}</p>}
                        {repliedMsg && <div className={cn("text-[10px] mb-1.5 px-2 py-1 rounded border-l-2", isMine ? "bg-primary-foreground/10 border-primary-foreground/30" : "bg-muted/50 border-muted-foreground/30")}><span className="font-medium">{repliedMsg.sender?.name}</span><p className="truncate opacity-80 flex items-center gap-1">{repliedMsg.media_type && <MediaTypeIcon type={repliedMsg.media_type} />}{repliedMsg.content || 'Mídia'}</p></div>}
                        {isEditing ? (
                          <div className="space-y-1.5 min-w-[150px]">
                            <Input value={s.editText} onChange={e => s.setEditText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') s.handleSaveEdit(); if (e.key === 'Escape') s.handleCancelEdit(); }} className="h-8 text-sm bg-background text-foreground border-primary/50" autoFocus />
                            <div className="flex gap-2 justify-end">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={s.handleCancelEdit}>Cancelar</Button>
                              <Button size="sm" className="h-7 px-2 text-xs" onClick={s.handleSaveEdit}>Salvar</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {repliedMsg && (
                              <div 
                                className={cn(
                                  "text-[10px] mb-2 px-2 py-1.5 rounded bg-muted/30 border-l-2 border-primary/50 cursor-pointer hover:bg-muted/50 transition-colors",
                                  isMine ? "bg-white/10" : "bg-muted/50"
                                )}
                                onClick={() => {
                                  const el = document.getElementById(`msg-${msg.reply_to_id}`);
                                  if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    el.classList.add('animate-pulse-subtle');
                                    setTimeout(() => el.classList.remove('animate-pulse-subtle'), 2000);
                                  }
                                }}
                              >
                                <span className="font-bold block text-[9px] uppercase tracking-wider opacity-70">
                                  {repliedMsg.sender?.name || 'Usuário'}
                                </span>
                                <p className="truncate opacity-90 flex items-center gap-1 italic">
                                  {repliedMsg.media_type && <MediaTypeIcon type={repliedMsg.media_type} />}
                                  {repliedMsg.content || 'Mídia'}
                                </p>
                              </div>
                            )}
                            {hasMedia && <MediaContent msg={msg} />}
                            {msg.content && (!hasMedia || msg.media_type === 'document') && (
                              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                <MarkdownPreview text={msg.content} className="inline" />
                              </div>
                            )}
                            {msg.content && hasMedia && msg.media_type !== 'document' && !['🎨 Figurinha', '🎵 Áudio meme', '😀 Emoji', '🎤 Mensagem de áudio'].includes(msg.content) && (
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mt-1">{msg.content}</p>
                            )}
                            <div className={cn("flex items-center gap-1 mt-1", isMine ? "justify-end" : "justify-between")}>
                              {cleanText && (
                                <button 
                                  onClick={() => isThisTtsPlaying ? s.tts.stop() : s.tts.speak(msg.content, msg.id)} 
                                  className={cn(
                                    "opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-black/5", 
                                    isMine ? "text-primary-foreground/80 hover:bg-white/10" : "text-muted-foreground hover:text-foreground"
                                  )}
                                  title={isThisTtsPlaying ? 'Parar' : 'Ouvir'}
                                >
                                  {isThisTtsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : isThisTtsPlaying ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                                </button>
                              )}
                              <span className={cn("text-[10px] tabular-nums opacity-70 font-medium", isMine ? "text-primary-foreground" : "text-muted-foreground")}>
                                {formatTime(msg.created_at)}{msg.is_edited && ' · editado'}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => s.setReplyTo(msg)} className="gap-2"><Reply className="w-3.5 h-3.5" /> Responder</ContextMenuItem>
                  {msg.content && <ContextMenuItem onClick={() => s.handleCopyMessage(msg.content)} className="gap-2"><Copy className="w-3.5 h-3.5" /> Copiar</ContextMenuItem>}
                  {cleanText && <ContextMenuItem onClick={() => isThisTtsPlaying ? s.tts.stop() : s.tts.speak(msg.content, msg.id)} className="gap-2"><Volume2 className="w-3.5 h-3.5" /> {isThisTtsPlaying ? 'Parar' : 'Ouvir'}</ContextMenuItem>}
                  {isMine && !isEditing && (<><ContextMenuSeparator />{!hasMedia && <ContextMenuItem onClick={() => s.handleStartEdit(msg)} className="gap-2"><Pencil className="w-3.5 h-3.5" /> Editar</ContextMenuItem>}<ContextMenuItem onClick={() => s.handleDelete(msg.id)} className="gap-2 text-destructive focus:text-destructive"><Trash2 className="w-3.5 h-3.5" /> Excluir</ContextMenuItem></>)}
                </ContextMenuContent>
              </ContextMenu>
            );
          })
        )}
      </div>

      {s.showScrollDown && <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10"><Button size="icon" variant="secondary" className="rounded-full shadow-lg h-8 w-8" onClick={s.scrollToBottom}><ArrowDown className="w-4 h-4" /></Button></div>}

      <TeamChatInputArea conversationId={conversation.id} text={s.text} setText={s.setText} replyTo={s.replyTo}
        isRecordingAudio={s.isRecordingAudio} isPending={s.sendMutation.isPending} onSend={s.handleSend}
        onCancelReply={() => s.setReplyTo(null)} onRecordToggle={() => s.setIsRecordingAudio(!s.isRecordingAudio)}
        onAudioSend={s.handleAudioSend} onSendSticker={s.handleSendSticker} onSendAudioMeme={s.handleSendAudioMeme}
        onSendCustomEmoji={s.handleSendCustomEmoji} onFileSent={s.handleFileSent} />

      <AddMembersDialog open={s.showAddMembers} onOpenChange={s.setShowAddMembers} conversation={conversation} />
    </div>
  );
}
