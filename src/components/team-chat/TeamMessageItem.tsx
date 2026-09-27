import { memo, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Trash2, Reply, Copy, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { MarkdownPreview } from '@/components/inbox/chat/MarkdownPreview';
import { TeamMessage } from '@/hooks/team-chat/teamChatTypes';
import { formatTime, formatDateSep, MediaContent, MediaTypeIcon } from './teamChatParts';
import { TeamReactionBar, TeamQuickReactionBarWrapper } from './TeamMessageReactionsWrapper';
import type { ReactionGroup } from '@/components/ui/message-reactions';

interface Props {
  msg: TeamMessage;
  isMine: boolean;
  showDate: boolean;
  conversationType: 'direct' | 'group';
  repliedMsg: TeamMessage | null;
  isEditing: boolean;
  editText: string;
  ttsIsPlaying: boolean;
  ttsIsLoading: boolean;
  reactions?: ReactionGroup[];
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onTtsToggle: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  setEditText: (v: string) => void;
  onToggleReaction?: (emoji: string) => void;
}

export const TeamMessageItem = memo(function TeamMessageItem({
  msg, isMine, showDate, conversationType, repliedMsg,
  isEditing, editText, ttsIsPlaying, ttsIsLoading,
  reactions = [], onReply, onEdit, onDelete, onCopy, onTtsToggle,
  onSaveEdit, onCancelEdit, setEditText, onToggleReaction,
}: Props) {
  const hasMedia = !!(msg.media_url || (msg.media_bucket && msg.media_path));
  const cleanText = msg.content?.replace(/\[.*?\]/g, '').replace(/https?:\/\/\S+/g, '').trim();
  const DEFAULT_CAPTIONS = ['🎨 Figurinha', '🎵 Áudio meme', '😀 Emoji', '🎤 Mensagem de áudio'];
  const hasReactions = reactions.length > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div id={`msg-${msg.id}`} className="scroll-mt-20">
          {showDate && (
            <div className="flex justify-center py-4" role="separator" aria-label={formatDateSep(msg.created_at)}>
              <span className="text-3xs font-bold uppercase tracking-widest text-muted-foreground bg-muted/30 px-4 py-1.5 rounded-full border border-border/10">
                {formatDateSep(msg.created_at)}
              </span>
            </div>
          )}
          <div
            className={cn('flex gap-3 py-1 group/msg relative', isMine ? 'flex-row-reverse' : 'flex-row')}
            aria-label={`Mensagem de ${msg.sender?.name || 'usuário'} às ${formatTime(msg.created_at)}`}
          >
            {!isMine && (
              <Avatar className="w-8 h-8 mt-1 shrink-0 border border-border/10 shadow-sm">
                <AvatarImage src={msg.sender?.avatar_url || undefined} alt={msg.sender?.name || 'Remetente'} />
                <AvatarFallback className="text-3xs font-bold bg-primary/10 text-primary">
                  {msg.sender?.name?.charAt(0) || '?'}
                </AvatarFallback>
              </Avatar>
            )}
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm relative transition-all duration-300',
                hasReactions && 'pb-5',
                isMine
                  ? 'bg-primary text-primary-foreground rounded-tr-none border border-primary/20'
                  : 'bg-card border border-border/50 text-foreground rounded-tl-none',
              )}
            >
              {/* Quick reaction strip on hover */}
              {onToggleReaction && (
                <TeamQuickReactionBarWrapper onToggle={onToggleReaction} isMine={isMine} />
              )}

              {!isMine && conversationType === 'group' && (
                <p className="text-3xs font-bold mb-1 text-primary/80 uppercase tracking-tighter">{msg.sender?.name}</p>
              )}
              {isEditing ? (
                <div className="space-y-1.5 min-w-[150px]">
                  <Input
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
                    className="h-8 text-sm bg-background text-foreground border-primary/50"
                    autoFocus
                    aria-label="Editar mensagem"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancelEdit}>Cancelar</Button>
                    <Button size="sm" className="h-7 px-2 text-xs" onClick={onSaveEdit}>Salvar</Button>
                  </div>
                </div>
              ) : (
                <>
                  {repliedMsg && (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label={`Ir para mensagem respondida de ${repliedMsg.sender?.name || 'usuário'}`}
                      className={cn(
                        'text-3xs mb-2 px-2 py-1.5 rounded border-l-2 border-primary/50 cursor-pointer hover:bg-muted/50 transition-colors',
                        isMine ? 'bg-white/10' : 'bg-muted/50',
                      )}
                      onClick={() => {
                        const el = document.getElementById(`msg-${msg.reply_to_id}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.classList.add('animate-pulse-subtle');
                          setTimeout(() => el.classList.remove('animate-pulse-subtle'), 2000);
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          const el = document.getElementById(`msg-${msg.reply_to_id}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                  {msg.content && hasMedia && msg.media_type !== 'document' && !DEFAULT_CAPTIONS.includes(msg.content) && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mt-1">{msg.content}</p>
                  )}
                  <div className={cn('flex items-center gap-1 mt-1', isMine ? 'justify-end' : 'justify-between')}>
                    {cleanText && (
                      <button
                        onClick={onTtsToggle}
                        className={cn(
                          'opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-full',
                          isMine
                            ? 'text-primary-foreground/80 hover:bg-white/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-black/5',
                        )}
                        title={ttsIsPlaying ? 'Parar' : 'Ouvir mensagem'}
                        aria-label={ttsIsPlaying ? 'Parar leitura' : 'Ouvir mensagem'}
                      >
                        {ttsIsLoading
                          ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                          : ttsIsPlaying
                            ? <VolumeX className="w-3 h-3" aria-hidden />
                            : <Volume2 className="w-3 h-3" aria-hidden />}
                      </button>
                    )}
                    <span className={cn('text-3xs tabular-nums opacity-70 font-medium', isMine ? 'text-primary-foreground' : 'text-muted-foreground')}>
                      {formatTime(msg.created_at)}{msg.is_edited && ' · editado'}
                    </span>
                  </div>

                  {/* Reaction bar below message */}
                  {onToggleReaction && (
                    <div className={cn('absolute -bottom-3 left-2 right-2 flex', isMine ? 'justify-end' : 'justify-start')}>
                      <TeamReactionBar reactions={reactions} onToggle={onToggleReaction} isMine={isMine} />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onReply} className="gap-2">
          <Reply className="w-3.5 h-3.5" aria-hidden /> Responder
        </ContextMenuItem>
        {msg.content && (
          <ContextMenuItem onClick={onCopy} className="gap-2">
            <Copy className="w-3.5 h-3.5" aria-hidden /> Copiar
          </ContextMenuItem>
        )}
        {cleanText && (
          <ContextMenuItem onClick={onTtsToggle} className="gap-2">
            <Volume2 className="w-3.5 h-3.5" aria-hidden /> {ttsIsPlaying ? 'Parar' : 'Ouvir'}
          </ContextMenuItem>
        )}
        {isMine && !isEditing && (
          <>
            <ContextMenuSeparator />
            {!hasMedia && (
              <ContextMenuItem onClick={onEdit} className="gap-2">
                <Pencil className="w-3.5 h-3.5" aria-hidden /> Editar
              </ContextMenuItem>
            )}
            <ContextMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
              <Trash2 className="w-3.5 h-3.5" aria-hidden /> Excluir
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});
