import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
import { useAcceptDepartmentInvite } from '@/hooks/team-chat/useDepartmentManagement';

/* eslint-disable react-hooks/refs, react-hooks/immutability */

/**
 * F79 — motivos tipados da RPC `accept_department_invite` (a RPC responde
 * `ok: false` com o motivo, que o hook converte em mensagem de erro).
 */
const JOIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_or_expired_code: 'Código inválido ou expirado.',
  invite_exhausted: 'Este convite já atingiu o limite de usos.',
  not_authenticated: 'Sessão expirada. Entre novamente para usar o código.',
};

function joinErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  return JOIN_ERROR_MESSAGES[message] ?? 'Não foi possível validar o código. Tente novamente.';
}

/**
 * F79 — entrada por código para quem está fora do departamento. A submissão passa
 * pela função do hook `useAcceptDepartmentInvite` (RPC `accept_department_invite`),
 * que move o perfil e invalida o cache; a tela não escreve em `profiles`.
 *
 * Este bloco é um componente próprio de propósito: o hook lê o cache do
 * react-query, e o painel também é montado onde não há provider (o teste de wiring
 * do Panel renderiza um canal comum, sem provider e sem convite).
 */
function DepartmentJoinByCode() {
  const acceptInvite = useAcceptDepartmentInvite();
  const [code, setCode] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    acceptInvite.mutate(trimmed);
  };

  if (acceptInvite.isSuccess) {
    return (
      <p role="status" className="text-sm font-medium text-foreground">
        Código aceito. Você entrou no departamento.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 w-full max-w-xs">
      <form className="flex w-full items-center gap-2" onSubmit={handleSubmit}>
        <Input
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Ex.: AB12CD34"
          aria-label="Código do convite"
          name="invite-code"
          autoComplete="off"
          spellCheck={false}
          className="h-9 font-mono uppercase tracking-widest"
          disabled={acceptInvite.isPending}
        />
        <Button type="submit" size="sm" className="shrink-0" disabled={acceptInvite.isPending || code.trim().length === 0}>
          {acceptInvite.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 motion-safe:animate-spin" aria-hidden />}
          Entrar
        </Button>
      </form>
      {acceptInvite.isError && (
        <p role="alert" className="text-xs text-destructive">{joinErrorMessage(acceptInvite.error)}</p>
      )}
    </div>
  );
}

interface Props { conversation: TeamConversation; onBack: () => void; onToggleDetails?: () => void; showDetails?: boolean; }

export function TeamChatPanel({ conversation, onBack, onToggleDetails, showDetails }: Props) {
  const s = useTeamChatPanel(conversation);

  // E68: department channel access check
  const convAny = conversation as unknown as Record<string, unknown>;
  const isDeptChannel = !!(convAny.department_id);
  const profileDeptId = (s.profile as Record<string, unknown>)?.department_id as string | null | undefined;
  // E68/F79: o canal de departamento é fechado para quem está fora, mas o
  // caminho de entrada é o código do convite — quem não é membro vê o fluxo
  // "Entrar via código" abaixo, não só o aviso.
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
    s.filteredMessages.forEach((msg, idx) => {
      const k = format(new Date(msg.created_at), 'yyyy-MM-dd');
      if (!seen.has(k)) {
        seen.add(k);
        result.add(idx);
      }
    });
    return result;
  }, [s.filteredMessages]);

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
              Este canal é exclusivo para membros do departamento. Informe o código do convite para entrar.
            </p>
          </div>
          <DepartmentJoinByCode />
        </div>
      </div>
    );
  }

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

      <div ref={s.scrollRef} className="flex-1 overflow-auto p-4 space-y-1 bg-muted/5" onScroll={handleScroll} role="log" aria-label="Mensagens da conversa" aria-live="polite">
        {s.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}><Skeleton className="h-10 rounded-2xl" style={{ width: 120 + (i % 3) * 60 }} /></div>)}</div>
        ) : s.filteredMessages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-12">{s.searchQuery ? 'Nenhuma mensagem encontrada' : 'Envie a primeira mensagem!'}</div>
        ) : (
          <>
            {s.hasOlderMessages && !s.searchQuery && (
              <div className="flex justify-center py-2">
                <Button variant="ghost" size="sm" className="gap-2 text-xs text-muted-foreground" disabled={s.isFetchingOlder} onClick={() => { void s.fetchOlderMessages(); }}>
                  {s.isFetchingOlder && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
                  Carregar mensagens anteriores
                </Button>
              </div>
            )}
            {s.filteredMessages.map((msg, idx) => {
              const showDate = dateFirstIndexes.has(idx);
              const isMine = msg.sender_id === s.profile?.id;
              const isEditing = s.editingId === msg.id;
              const repliedMsg = msg.reply_to_id ? s.messages.find(m => m.id === msg.reply_to_id) ?? null : null;
              const isThisTtsPlaying = s.tts.isPlaying && s.tts.currentMessageId === msg.id;
              const isThisTtsLoading = s.tts.isLoading && s.tts.currentMessageId === msg.id;

              return (
                <TeamMessageItem
                  key={msg.id}
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
              );
            })}
          </>
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
