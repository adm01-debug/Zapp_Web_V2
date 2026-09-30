import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  ArrowLeft,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  Loader2,
  MessageCircleMore,
  RefreshCw,
  Search,
  UserRoundCheck,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { TalkMeConflictError, type TalkMeWaitingContact } from './types';
import type { TalkMeQueueController } from './useTalkMeQueue';

interface TalkMeViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  controller: TalkMeQueueController;
  onAccepted: (contactId: string) => Promise<void> | void;
}

function waitingLabel(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: false, locale: ptBR });
}

function messagePreview(item: TalkMeWaitingContact) {
  const text = item.lastMessageCaption?.trim() || item.lastMessageContent?.trim();
  if (text) return text;
  const type = item.lastMessageType.toLowerCase();
  if (type.includes('audio')) return 'Mensagem de áudio';
  if (type.includes('image')) return 'Imagem recebida';
  if (type.includes('video')) return 'Vídeo recebido';
  if (type.includes('document') || type.includes('file')) return 'Arquivo recebido';
  return 'Nova mensagem recebida';
}

function TalkMeCard({ item, active, onSelect, buttonRef, onMove }: {
  item: TalkMeWaitingContact;
  active: boolean;
  onSelect: () => void;
  buttonRef?: (node: HTMLButtonElement | null) => void;
  onMove?: (direction: -1 | 1) => void;
}) {
  const colors = getAvatarColor(item.name || '?');
  const isAudio = item.lastMessageType.toLowerCase().includes('audio');

  const nameId = `talk-me-name-${item.contactId}`;
  const companyId = `talk-me-company-${item.contactId}`;
  const jobTitleId = `talk-me-job-title-${item.contactId}`;
  const detailsId = `talk-me-details-${item.contactId}`;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); onMove?.(-1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); onMove?.(1); }
      }}
      tabIndex={active ? 0 : -1}
      aria-labelledby={nameId}
      aria-describedby={`${companyId} ${jobTitleId} ${detailsId}`}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-[28px] border text-left shadow-2xl',
        'bg-card/95 backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active ? 'border-primary/50 shadow-primary/10' : 'border-border/70',
      )}
    >
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-3 text-center sm:px-6 sm:py-7">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-70"
          style={{
            background: `radial-gradient(circle at 50% 10%, ${item.queueColor ?? '#2563eb'}33, transparent 52%)`,
          }}
        />
        <Avatar className="relative h-16 w-16 border-2 border-white/20 shadow-2xl sm:h-32 sm:w-32">
          <AvatarImage src={item.avatarUrl ?? undefined} alt="" className="object-cover" />
          <AvatarFallback className={cn('text-2xl font-bold', colors.bg, colors.text)}>
            {getInitials(item.name || '?')}
          </AvatarFallback>
        </Avatar>
        <div className="relative mt-3 min-w-0 max-w-full sm:mt-5">
          <h3 id={nameId} className="truncate text-base font-black tracking-tight text-foreground sm:text-2xl">{item.name || 'Contato sem nome'}</h3>
          <p id={companyId} className="mt-1 flex items-center justify-center gap-1.5 truncate text-xs font-medium text-muted-foreground sm:text-sm">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.company || 'Empresa não informada'}</span>
          </p>
          <p id={jobTitleId} className="mt-0.5 truncate text-xs text-muted-foreground sm:mt-1">{item.jobTitle || 'Cargo não informado'}</p>
        </div>
      </div>

      <div id={detailsId} className="relative border-t border-border/70 bg-background/75 p-3 sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs sm:mb-3">
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            Aguardando há {waitingLabel(item.waitingSince)}
          </span>
          <span className="text-muted-foreground">#{item.position}</span>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/35 p-2.5 sm:p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            {isAudio ? <Volume2 className="h-3.5 w-3.5" /> : <MessageCircleMore className="h-3.5 w-3.5" />}
            Última mensagem
          </div>
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground sm:line-clamp-4">
            {messagePreview(item)}
          </p>
          {item.pendingMessageCount > 1 && (
            <p className="mt-2 text-xs font-semibold text-foreground">
              {item.pendingMessageCount} mensagens aguardando resposta
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

export function TalkMeView({ open, onOpenChange, controller, onAccepted }: TalkMeViewProps) {
  const {
    queues,
    selectedQueue,
    selectedQueueId,
    setSelectedQueueId,
    items,
    search,
    setSearch,
    queuesLoading,
    itemsLoading,
    loadingMore,
    claimingContactId,
    queuesError,
    itemsError,
    searchPending,
    totalCount,
    hasMore,
    loadMore,
    refresh,
    claim,
  } = controller;
  const reduceMotion = useReducedMotion() ?? false;
  const scopeKey = `${selectedQueueId ?? 'none'}:${search}`;
  const [selection, setSelection] = useState<{ scopeKey: string; contactId: string } | null>(null);
  const [, setClockTick] = useState(0);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectedContactId = selection?.scopeKey === scopeKey ? selection.contactId : null;
  const notifiedMissingRef = useRef<string | null>(null);

  const activeIndex = useMemo(
    () => items.findIndex((item) => item.contactId === selectedContactId),
    [items, selectedContactId],
  );
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeItem = items[safeIndex] ?? null;

  useEffect(() => {
    if (
      open
      && selectedContactId
      && items.length > 0
      && !items.some((item) => item.contactId === selectedContactId)
      && !itemsLoading
      && notifiedMissingRef.current !== selectedContactId
    ) {
      toast.info('O atendimento anterior saiu da fila. Exibimos o próximo disponível.');
      notifiedMissingRef.current = selectedContactId;
    }
  }, [items, itemsLoading, open, selectedContactId]);

  const move = useCallback((direction: -1 | 1, moveFocus = false) => {
    if (items.length === 0) return;
    const nextIndex = Math.min(items.length - 1, Math.max(0, safeIndex + direction));
    setSelection({ scopeKey, contactId: items[nextIndex].contactId });
    if (moveFocus) requestAnimationFrame(() => cardRefs.current.get(items[nextIndex].contactId)?.focus());
    if (direction === 1 && nextIndex >= items.length - 3 && hasMore && !loadingMore) void loadMore();
  }, [hasMore, items, loadMore, loadingMore, safeIndex, scopeKey]);

  const handleClaim = useCallback(async () => {
    if (!activeItem) return;
    const contactId = activeItem.contactId;
    try {
      await claim(contactId);
      toast.success(`Atendimento de ${activeItem.name} assumido.`);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof TalkMeConflictError) {
        toast.info('Este atendimento acabou de ser assumido ou deixou a fila.');
        await refresh();
        return;
      }
      toast.error('Não foi possível assumir o atendimento. Tente novamente.');
      return;
    }
    try {
      await onAccepted(contactId);
    } catch {
      toast.error('Atendimento assumido, mas a conversa não abriu. Atualize o Inbox.');
    }
  }, [activeItem, claim, onAccepted, onOpenChange, refresh]);

  const isClaiming = !!activeItem && claimingContactId === activeItem.contactId;
  const showInitialLoading = queuesLoading || searchPending || (itemsLoading && items.length === 0);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setClockTick((current) => current + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="full"
        showCloseButton={false}
        aria-describedby="talk-me-description"
        className="h-[calc(100dvh-16px)] max-h-none w-[calc(100vw-16px)] max-w-none overflow-hidden rounded-2xl border-border/70 bg-background/96 p-0 sm:h-[calc(100dvh-32px)] sm:w-[calc(100vw-32px)] sm:rounded-[28px]"
      >
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-35">
            <div className="absolute -left-48 -top-48 h-[520px] w-[520px] rounded-full bg-primary/25 blur-3xl" />
            <div className="absolute -bottom-56 -right-40 h-[560px] w-[560px] rounded-full bg-violet-500/20 blur-3xl" />
          </div>

          <header className="relative z-20 flex shrink-0 flex-col gap-4 border-b border-border/70 bg-background/70 px-4 py-4 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between lg:px-7">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => onOpenChange(false)} className="h-10 w-10 shrink-0 rounded-full" aria-label="Voltar para o Inbox">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <DialogTitle className="truncate text-2xl font-black tracking-tight sm:text-3xl">
                  TALK <span className="text-primary">ME</span>
                </DialogTitle>
                <DialogDescription id="talk-me-description" className="truncate text-xs sm:text-sm">
                  Escolha um contato aguardando e assuma a conversa com segurança.
                </DialogDescription>
              </div>
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-row lg:max-w-3xl lg:justify-end">
              <Select value={selectedQueueId ?? undefined} onValueChange={setSelectedQueueId} disabled={queuesLoading || queues.length === 0}>
                <SelectTrigger className="h-10 min-w-0 rounded-xl bg-background/80 sm:w-56" aria-label="Departamento">
                  <SelectValue placeholder="Selecione o departamento" />
                </SelectTrigger>
                <SelectContent>
                  {queues.map((queue) => (
                    <SelectItem key={queue.queueId} value={queue.queueId}>
                      {queue.name} · {queue.waitingCount}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative col-span-2 row-start-2 min-w-0 flex-1 sm:col-auto sm:row-auto sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar nome, empresa ou mensagem…"
                  aria-label="Buscar na fila TALK ME"
                  className="h-10 rounded-xl bg-background/80 pl-9"
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => void refresh()} disabled={showInitialLoading} className="col-start-2 row-start-1 h-10 w-10 shrink-0 rounded-xl sm:col-auto sm:row-auto" aria-label="Atualizar fila">
                <RefreshCw className={cn('h-4 w-4', showInitialLoading && 'animate-spin motion-reduce:animate-none')} />
              </Button>
            </div>
          </header>

          <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
            <div className="mx-auto mb-2 flex w-full max-w-5xl items-center justify-between gap-3 px-1 text-xs text-muted-foreground sm:text-sm">
              <span aria-live="polite">
                {selectedQueue ? <><strong className="text-foreground">{totalCount}</strong> aguardando em {selectedQueue.name}</> : 'Nenhum departamento disponível'}
              </span>
              {activeItem && <span>Atendimento {activeItem.position} de {totalCount}</span>}
            </div>
            <div className="sr-only" aria-live="polite" aria-atomic="true">
              {activeItem ? `${activeItem.name}, atendimento ${activeItem.position} de ${totalCount}` : ''}
            </div>

            {queuesError || itemsError ? (
              <div role="alert" className="m-auto flex max-w-md flex-col items-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><Inbox className="h-7 w-7" /></div>
                <h2 className="text-lg font-bold">Fila temporariamente indisponível</h2>
                <p className="mt-2 text-sm text-muted-foreground">{queuesError ?? itemsError}</p>
                <Button className="mt-5" onClick={() => void refresh()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
              </div>
            ) : showInitialLoading ? (
              <div role="status" aria-live="polite" aria-label="Carregando atendimentos" className="m-auto flex w-full max-w-sm flex-col items-center">
                <Skeleton className="h-[430px] w-full rounded-[28px]" />
                <Skeleton className="mt-5 h-11 w-52 rounded-full" />
              </div>
            ) : queues.length === 0 ? (
              <div className="m-auto max-w-md text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted"><Inbox className="h-7 w-7 text-muted-foreground" /></div>
                <h2 className="text-xl font-bold">Nenhuma fila disponível</h2>
                <p className="mt-2 text-sm text-muted-foreground">Seu perfil ainda não está vinculado a um departamento ativo.</p>
              </div>
            ) : items.length === 0 ? (
              <div className="m-auto max-w-md text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10"><UserRoundCheck className="h-7 w-7 text-success" /></div>
                <h2 className="text-xl font-bold">Tudo em dia</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {search.trim() ? 'Nenhum atendimento corresponde à sua busca.' : 'Não há contatos aguardando aceite neste departamento.'}
                </p>
              </div>
            ) : (
              <>
                <div className="relative mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-center justify-center overflow-hidden [perspective:1200px] [@media(max-height:600px)]:min-h-[300px] [@media(max-height:600px)]:flex-none">
                  <AnimatePresence initial={false}>
                    {items.map((item, index) => {
                      const offset = index - safeIndex;
                      if (Math.abs(offset) > 1) return null;
                      const active = offset === 0;
                      return (
                        <motion.div
                          key={item.contactId}
                          initial={reduceMotion ? false : { opacity: 0, scale: 0.86 }}
                          animate={{
                            x: `${offset * 55}%`,
                            scale: active ? 1 : 0.82,
                            rotateY: reduceMotion ? 0 : offset * -11,
                            opacity: 1,
                            filter: active || reduceMotion ? 'blur(0px)' : 'blur(3px)',
                            zIndex: active ? 20 : 10,
                          }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82 }}
                          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 28 }}
                          aria-hidden={!active}
                          className="absolute h-[min(440px,calc(100%-8px))] w-[min(340px,calc(100%-74px))] sm:h-[min(490px,calc(100%-12px))] sm:w-[360px] [@media(max-height:600px)]:h-[280px]"
                        >
                          <TalkMeCard
                            item={item}
                            active={active}
                            onSelect={() => setSelection({ scopeKey, contactId: item.contactId })}
                            onMove={(direction) => move(direction, true)}
                            buttonRef={(node) => {
                              if (node) cardRefs.current.set(item.contactId, node);
                              else cardRefs.current.delete(item.contactId);
                            }}
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  <Button variant="outline" size="icon" onClick={() => move(-1)} disabled={safeIndex <= 0} className="absolute left-1 z-30 h-11 w-11 rounded-full bg-background/75 backdrop-blur sm:left-8" aria-label="Atendimento anterior">
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => move(1)} disabled={safeIndex >= items.length - 1 && !hasMore} className="absolute right-1 z-30 h-11 w-11 rounded-full bg-background/75 backdrop-blur sm:right-8" aria-label="Próximo atendimento">
                    {loadingMore ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <ChevronRight className="h-5 w-5" />}
                  </Button>
                </div>

                <div className="mx-auto mt-3 flex w-full max-w-md shrink-0 flex-col items-stretch gap-2 px-3 sm:flex-row sm:justify-center">
                  <Button
                    size="lg"
                    onClick={() => void handleClaim()}
                    disabled={!activeItem || !!claimingContactId || itemsLoading || searchPending}
                    className="h-12 flex-1 rounded-full px-7 font-bold shadow-lg shadow-primary/20"
                  >
                    {isClaiming ? <Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" /> : <MessageCircleMore className="mr-2 h-5 w-5" />}
                    {isClaiming ? 'Assumindo…' : 'Aceitar e conversar'}
                  </Button>
                </div>
              </>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
