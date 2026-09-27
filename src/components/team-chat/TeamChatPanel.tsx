import { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowDown, Search, X, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TeamChatInputArea } from './TeamChatInputArea';
import { TeamMessageBubble } from './TeamMessageBubble';
import { useTeamChatPanel } from '@/hooks/team-chat/useTeamChatPanel';
import { TeamConversation } from '@/hooks/team-chat/teamChatTypes';

interface Props {
  conversation: TeamConversation;
}

export function TeamChatPanel({ conversation }: Props) {
  const s = useTeamChatPanel(conversation);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isDeptChannel = !!conversation.department_id;
  const profileDeptId = (s.profile as { department_id?: string | null } | null)?.department_id;
  const isChannelMember = !isDeptChannel || profileDeptId === conversation.department_id || s.canTransfer;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    scrollToBottom('instant');
  }, [conversation.id, scrollToBottom]);

  useEffect(() => {
    if (s.messages.length > 0) {
      scrollToBottom();
    }
  }, [s.messages.length, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 200);
  }, []);

  const filteredMessages = searchQuery
    ? s.messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    : s.messages;

  if (!isChannelMember) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold truncate">{conversation.name ?? 'Canal'}</h2>
          </div>
        </div>
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
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{conversation.name ?? 'Canal'}</h2>
        </div>
        {searchOpen ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder="Buscar mensagens..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-7 w-48 text-sm"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSearchOpen(true)} aria-label="Buscar">
            <Search className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
      >
        {s.isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {searchQuery ? 'Nenhuma mensagem encontrada' : 'Nenhuma mensagem ainda'}
          </div>
        ) : (
          filteredMessages.map((msg, idx) => (
            <TeamMessageBubble
              key={msg.id}
              message={msg}
              previousMessage={idx > 0 ? filteredMessages[idx - 1] : undefined}
              currentUserId={s.currentUserId}
              onReply={s.setReplyTo}
              onEdit={s.setEditing}
              onDelete={s.deleteMessage}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {showScrollDown && (
        <Button
          size="icon"
          variant="secondary"
          className="absolute bottom-20 right-6 rounded-full shadow-md h-8 w-8"
          onClick={() => scrollToBottom()}
          aria-label="Rolar para o final"
        >
          <ArrowDown className="w-4 h-4" />
        </Button>
      )}

      <TeamChatInputArea
        conversationId={conversation.id}
        replyTo={s.replyTo}
        editing={s.editing}
        onCancelReply={() => s.setReplyTo(null)}
        onCancelEdit={() => s.setEditing(null)}
        onSend={s.sendMessage}
        onEdit={s.editMessage}
        currentUserId={s.currentUserId}
      />
    </div>
  );
}
