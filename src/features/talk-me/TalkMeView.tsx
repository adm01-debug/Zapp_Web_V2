import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, useReducedMotion } from 'framer-motion';
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
import './talk-me-layout.css';

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

  const nameId = `talk-me-main-name-${item.contactId}`;
  const companyId = `talk-me-main-company-${item.contactId}`;
  const jobTitleId = `talk-me-main-job-title-${item.contactId}`;
  const detailsId = `talk-me-main-details-${item.contactId}`;

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
        'talk-me-contact flex h-full w-full flex-col overflow-hidden rounded-[22px] border text-left shadow-2xl',
        'bg-card/95 backdrop-blur-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        active ? 'border-primary/50 shadow-primary/10' : 'border-border/70',
      )}
    >
      <div className="talk-me-identity relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-4 py-2 text-center">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-70"
          style={{
            background: `radial-gradient(circle at 50% 10%, ${item.queueColor ?? '#2563eb'}33, transparent 52%)`,
          }}
        />
        <Avatar className="talk-me-avatar relative h-16 w-16 shrink-0 border-2 border-white/20 shadow-2xl sm:h-20 sm:w-20">
          <AvatarImage src={item.avatarUrl ?? undefined} alt="" className="object-cover" />
          <AvatarFallback className={cn('text-2xl font-bold', colors.bg, colors.text)}>
            {getInitials(item.name || '?')}
          </AvatarFallback>
        </Avatar>
        <div className="talk-me-identity-text relative mt-2 min-w-0 max-w-full">
          <h3 id={nameId} className="truncate text-base font-black tracking-tight text-foreground sm:text-xl">{item.name || 'Contato sem nome'}</h3>
          <p id={companyId} className="mt-1 flex items-center justify-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
            <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.company || 'Empresa não informada'}</span>
          </p>
          <p id={jobTitleId} className="mt-0.5 truncate text-xs text-muted-foreground sm:mt-1">{item.jobTitle || 'Cargo não informado'}</p>
        </div>
      </div>

      <div id={detailsId} className="talk-me-details relative shrink-0 border-t border-border/70 bg-background/75 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            Aguardando há {waitingLabel(item.waitingSince)}
          </span>
          <span className="text-foreground">#{item.position}</span>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/35 p-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-foreground">
            {isAudio ? <Volume2 className="h-3.5 w-3.5" /> : <MessageCircleMore className="h-3.5 w-3.5" />}
            Última mensagem
          </div>
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-foreground">
            {messagePreview(item)}
          </p>
          {item.pendingMessageCount > 1 && (
            <p className="mt-1 text-xs font-semibold text-foreground">
              {item.pendingMessageCount} mensagens aguardando resposta
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function TalkMeQueueCard({ item, active, disabled, onSelect, onMove, buttonRef }: {
  item: TalkMeWaitingContact;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  buttonRef: (node: HTMLButtonElement | null) => void;
}) {
  const nameId = `talk-me-queue-name-${item.contactId}`;
  const detailsId = `talk-me-queue-details-${item.contactId}`;

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') { event.preventDefault(); onMove(-1); }
        if (event.key === 'ArrowRight') { event.preventDefault(); onMove(1); }
      }}
      disabled={disabled}
      aria-label={`Selecionar ${item.name || 'contato sem nome'}`}
      aria-describedby={detailsId}
      aria-pressed={active}
      className={cn(
        'talk-me-queue-card group relative flex h-[211px] w-[173px] shrink-0 snap-center flex-col overflow-hidden rounded-[20px] border bg-black text-left shadow-lg',
        'transition-[border-color,box-shadow,transform] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
        'motion-reduce:transition-none',
        active
          ? 'border-white/80 shadow-[0_0_0_2px_rgba(255,255,255,0.16),0_20px_45px_rgba(0,0,0,0.45)]'
          : 'border-white/15 hover:-translate-y-1 hover:border-white/40',
      )}
    >
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-3 py-2 text-center">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.12),transparent_60%)]" />
        <Avatar className="talk-me-queue-avatar relative h-16 w-16 shrink-0 border border-white/25 shadow-xl">
          <AvatarImage src={item.avatarUrl ?? undefined} alt="" loading="lazy" decoding="async" className="object-cover grayscale" />
          <AvatarFallback className="bg-zinc-200 text-zinc-900">
            {getInitials(item.name || '?')}
          </AvatarFallback>
        </Avatar>
        <h3 id={nameId} className="relative mt-2 w-full truncate text-sm font-black text-white">
          {item.name || 'Contato sem nome'}
        </h3>
        <p className="relative mt-1 w-full truncate text-xs text-zinc-400">
          {item.company || 'Empresa não informada'}
        </p>
      </div>
      <div id={detailsId} className="shrink-0 border-t border-white/10 bg-zinc-950 px-2.5 py-2">
        <div className="flex items-center justify-between gap-2 text-2xs font-semibold text-zinc-300">
          <span className="inline-flex min-w-0 items-center gap-1">
            <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{waitingLabel(item.waitingSince)}</span>
          </span>
          <span className="shrink-0 text-zinc-400">#{item.position}</span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-8 break-words text-xs leading-4 text-zinc-200">
          {messagePreview(item)}
        </p>
      </div>
      {active && <span aria-hidden="true" className="absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-white" />}
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
    loadMoreError,
    reconciling,
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
  const queueCardRefs = useRef(new Map<string, HTMLButtonElement>());
  const queueViewportRef = useRef<HTMLDivElement>(null);
  const queueDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);
  const suppressQueueClickRef = useRef(false);
  const pendingForwardRef = useRef<{ contactId: string; moveFocus: boolean } | null>(null);
  const selectedContactId = selection?.scopeKey === scopeKey ? selection.contactId : null;
  const notifiedMissingRef = useRef<string | null>(null);

  const activeIndex = useMemo(
    () => items.findIndex((item) => item.contactId === selectedContactId),
    [items, selectedContactId],
  );
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;
  const activeItem = items[safeIndex] ?? null;

  useEffect(() => {
    if (!open || items.length === 0 || itemsLoading || reconciling) return;
    if (selectedContactId && items.some((item) => item.contactId === selectedContactId)) return;
    if (selectedContactId && notifiedMissingRef.current !== selectedContactId) {
      toast.info('O atendimento anterior saiu da fila. Exibimos o próximo disponível.');
      notifiedMissingRef.current = selectedContactId;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a lista remota removeu/trocou o alvo; a seleção precisa apontar para uma identidade ainda elegível.
    setSelection({ scopeKey, contactId: items[0].contactId });
  }, [items, itemsLoading, open, reconciling, scopeKey, selectedContactId]);

  useEffect(() => {
    pendingForwardRef.current = null;
  }, [open, scopeKey]);

  const move = useCallback((direction: -1 | 1, moveFocus = false) => {
    if (items.length === 0 || claimingContactId || reconciling) return;
    if (direction === 1 && safeIndex >= items.length - 1 && hasMore) {
      if (!loadingMore && !pendingForwardRef.current) {
        pendingForwardRef.current = { contactId: activeItem?.contactId ?? '', moveFocus };
        void loadMore().then((loaded) => {
          if (!loaded && pendingForwardRef.current?.contactId === activeItem?.contactId) {
            pendingForwardRef.current = null;
          }
        });
      }
      return;
    }
    const nextIndex = Math.min(items.length - 1, Math.max(0, safeIndex + direction));
    setSelection({ scopeKey, contactId: items[nextIndex].contactId });
    if (moveFocus) requestAnimationFrame(() => cardRefs.current.get(items[nextIndex].contactId)?.focus());
    if (direction === 1 && nextIndex >= items.length - 3 && hasMore && !loadingMore) void loadMore();
  }, [activeItem?.contactId, claimingContactId, hasMore, items, loadMore, loadingMore, reconciling, safeIndex, scopeKey]);

  const selectQueueItem = useCallback((index: number, moveFocus = false) => {
    if (claimingContactId || reconciling || index < 0 || index >= items.length) return;
    const item = items[index];
    setSelection({ scopeKey, contactId: item.contactId });
    if (moveFocus) requestAnimationFrame(() => queueCardRefs.current.get(item.contactId)?.focus());
    if (index >= items.length - 3 && hasMore && !loadingMore) void loadMore();
  }, [claimingContactId, hasMore, items, loadMore, loadingMore, reconciling, scopeKey]);

  const moveQueueViewport = useCallback((direction: -1 | 1) => {
    const viewport = queueViewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({ left: direction * Math.max(240, viewport.clientWidth * 0.78), behavior: reduceMotion ? 'auto' : 'smooth' });
    if (direction === 1 && hasMore && !loadingMore) {
      const remaining = viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft;
      if (remaining <= viewport.clientWidth * 1.5) void loadMore();
    }
  }, [hasMore, loadMore, loadingMore, reduceMotion]);

  useEffect(() => {
    const pending = pendingForwardRef.current;
    if (!pending) return;
    const previousIndex = items.findIndex((item) => item.contactId === pending.contactId);
    const nextItem = previousIndex >= 0 ? items[previousIndex + 1] : undefined;
    if (nextItem) {
      pendingForwardRef.current = null;
      setSelection({ scopeKey, contactId: nextItem.contactId });
      if (pending.moveFocus) requestAnimationFrame(() => cardRefs.current.get(nextItem.contactId)?.focus());
    } else if (!loadingMore) {
      pendingForwardRef.current = null;
    }
  }, [items, loadingMore, scopeKey]);

  useEffect(() => {
    if (!activeItem) return;
    const viewport = queueViewportRef.current;
    const card = queueCardRefs.current.get(activeItem.contactId);
    if (!viewport || !card) return;
    const left = card.offsetLeft - (viewport.clientWidth - card.clientWidth) / 2;
    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }, [activeItem, reduceMotion]);

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
        className="talk-me-view h-[calc(100dvh-16px)] max-h-none w-[calc(100vw-16px)] max-w-none overflow-hidden rounded-2xl border-border/70 bg-background/96 p-0 sm:h-[calc(100dvh-32px)] sm:w-[calc(100vw-32px)] sm:rounded-[28px]"
      >
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden opacity-35">
            <div className="absolute -left-48 -top-48 h-[520px] w-[520px] rounded-full bg-primary/25 blur-3xl" />
            <div className="absolute -bottom-56 -right-40 h-[560px] w-[560px] rounded-full bg-violet-500/20 blur-3xl" />
          </div>

          <header className="relative z-20 flex shrink-0 flex-col gap-2 border-b border-border/70 bg-background/70 px-4 py-2 backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between lg:px-5 lg:py-1">
            <div className="flex min-w-0 items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => onOpenChange(false)} className="h-8 w-8 shrink-0 rounded-full" aria-label="Voltar para o Inbox">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <DialogTitle className="truncate text-2xl font-black leading-7 tracking-tight">
                  TALK <span className="text-primary">ME</span>
                </DialogTitle>
                <DialogDescription id="talk-me-description" className="truncate text-xs leading-4">
                  Escolha um contato aguardando e assuma a conversa com segurança.
                </DialogDescription>
              </div>
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-row lg:max-w-3xl lg:justify-end">
              <Select value={selectedQueueId ?? undefined} onValueChange={setSelectedQueueId} disabled={queuesLoading || queues.length === 0}>
                <SelectTrigger className="h-8 min-w-0 rounded-xl bg-background/80 text-xs sm:w-44" aria-label="Departamento">
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
                  className="h-8 rounded-xl bg-background/80 pl-9 text-xs"
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => void refresh()} disabled={showInitialLoading} className="col-start-2 row-start-1 h-8 w-8 shrink-0 rounded-xl sm:col-auto sm:row-auto" aria-label="Atualizar fila">
                <RefreshCw className={cn('h-4 w-4', showInitialLoading && 'animate-spin motion-reduce:animate-none')} />
              </Button>
            </div>
          </header>

          <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2 sm:px-4">
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
                <Skeleton className="h-[min(344px,40dvh)] w-full rounded-[22px]" />
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
              <div className="mx-auto flex w-full max-w-[1184px] shrink-0 flex-col gap-3">
                <section
                  data-testid="talk-me-main-stage"
                  aria-label="Atendimento em destaque"
                  className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[#050507] px-2 pb-3 pt-2 shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:px-4"
                >
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
                    <div className="absolute -left-28 -top-36 h-80 w-80 rounded-full bg-blue-600/10 blur-3xl" />
                    <div className="absolute -bottom-48 -right-20 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
                  </div>

                  <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-2 text-xs text-zinc-400">
                    <span aria-live="polite">
                      {selectedQueue ? <><strong className="text-white">{totalCount}</strong> aguardando em {selectedQueue.name}</> : 'Nenhum departamento disponível'}
                    </span>
                    {activeItem && <span>Atendimento {activeItem.position} de {totalCount}</span>}
                  </div>

                  <div className="talk-me-track relative mx-auto mt-1 flex w-full max-w-5xl items-start justify-center overflow-hidden pt-2 [perspective:1200px]">
                    {items.map((item, index) => {
                        const offset = index - safeIndex;
                        if (Math.abs(offset) > 1) return null;
                        const active = offset === 0;
                        return (
                          <motion.div
                            key={item.contactId}
                            initial={reduceMotion ? false : { opacity: 0, scale: 0.86 }}
                            animate={{
                              x: `${offset * 58}%`,
                              scale: active ? 1 : 0.8,
                              rotateY: reduceMotion ? 0 : offset * -11,
                              opacity: active ? 1 : 0.52,
                              filter: active || reduceMotion ? 'blur(0px)' : 'blur(3px)',
                              zIndex: active ? 20 : 10,
                            }}
                            transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 230, damping: 28 }}
                            aria-hidden={!active}
                            className="talk-me-main-card absolute w-[min(288px,calc(100%-76px))]"
                          >
                            <TalkMeCard
                              item={item}
                              active={active}
                              onSelect={() => !claimingContactId && setSelection({ scopeKey, contactId: item.contactId })}
                              onMove={(direction) => move(direction, true)}
                              buttonRef={(node) => {
                                if (node) cardRefs.current.set(item.contactId, node);
                                else cardRefs.current.delete(item.contactId);
                              }}
                            />
                          </motion.div>
                        );
                    })}

                    <Button variant="outline" size="icon" onClick={() => move(-1)} disabled={safeIndex <= 0 || !!claimingContactId || reconciling} className="absolute left-1 top-[42%] z-30 h-11 w-11 rounded-full border-white/15 bg-black/90 text-white hover:bg-zinc-900 sm:left-8" aria-label="Atendimento anterior">
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => move(1)} disabled={(safeIndex >= items.length - 1 && !hasMore) || !!claimingContactId || reconciling} className="absolute right-1 top-[42%] z-30 h-11 w-11 rounded-full border-white/15 bg-black/90 text-white hover:bg-zinc-900 sm:right-8" aria-label="Próximo atendimento">
                      {loadingMore ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <ChevronRight className="h-5 w-5" />}
                    </Button>
                  </div>

                  <div className="mx-auto mt-1.5 flex w-full max-w-[360px] justify-center px-3">
                    <Button
                      size="lg"
                      onClick={() => void handleClaim()}
                      disabled={!activeItem || !!claimingContactId || itemsLoading || searchPending || reconciling}
                      className="h-10 w-full rounded-full px-5 text-xs font-bold shadow-lg shadow-primary/20"
                    >
                      {isClaiming ? <Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" /> : <MessageCircleMore className="mr-2 h-5 w-5" />}
                      {isClaiming ? 'Assumindo…' : 'Aceitar e conversar'}
                    </Button>
                  </div>
                </section>

                <section
                  data-testid="talk-me-waiting-strip"
                  aria-labelledby="talk-me-waiting-title"
                  className="rounded-[22px] border border-white/10 bg-[#070709] px-2 py-3 shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:px-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3 px-2 sm:px-12">
                    <div>
                      <h2 id="talk-me-waiting-title" className="text-sm font-black text-white">Aguardando atendimento</h2>
                      <p className="text-xs text-zinc-400">Selecione um contato para revisar os dados acima.</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-300">
                      {items.length} de {totalCount}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <Button variant="outline" size="icon" onClick={() => moveQueueViewport(-1)} disabled={items.length <= 1 || !!claimingContactId || reconciling} className="h-11 w-11 shrink-0 rounded-full border-white/15 bg-black text-white hover:bg-zinc-900" aria-label="Ver contatos anteriores na fila">
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div
                      ref={queueViewportRef}
                      onPointerDown={(event) => {
                        if (!event.isPrimary || claimingContactId || reconciling) return;
                        queueDragRef.current = {
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          startY: event.clientY,
                          startScrollLeft: event.currentTarget.scrollLeft,
                          moved: false,
                        };
                      }}
                      onPointerMove={(event) => {
                        const drag = queueDragRef.current;
                        if (!drag || drag.pointerId !== event.pointerId) return;
                        const deltaX = event.clientX - drag.startX;
                        const deltaY = event.clientY - drag.startY;
                        if (!drag.moved && (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY))) return;
                        if (!drag.moved) {
                          drag.moved = true;
                          event.currentTarget.setPointerCapture?.(event.pointerId);
                        }
                        event.preventDefault();
                        event.currentTarget.scrollLeft = drag.startScrollLeft - deltaX;
                      }}
                      onPointerUp={(event) => {
                        const drag = queueDragRef.current;
                        if (!drag || drag.pointerId !== event.pointerId) return;
                        if (drag.moved) {
                          suppressQueueClickRef.current = true;
                          window.setTimeout(() => { suppressQueueClickRef.current = false; }, 0);
                        }
                        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                        queueDragRef.current = null;
                      }}
                      onPointerCancel={() => { queueDragRef.current = null; }}
                      onClickCapture={(event) => {
                        if (!suppressQueueClickRef.current) return;
                        event.preventDefault();
                        event.stopPropagation();
                        suppressQueueClickRef.current = false;
                      }}
                      onScroll={(event) => {
                        const viewport = event.currentTarget;
                        const remaining = viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft;
                        if (remaining <= viewport.clientWidth && hasMore && !loadingMore && !claimingContactId && !reconciling) void loadMore();
                      }}
                      className="flex min-w-0 flex-1 cursor-grab snap-x snap-mandatory touch-pan-y select-none gap-2.5 overflow-x-auto px-1 pb-2 pt-1 active:cursor-grabbing scrollbar-none"
                      aria-label="Contatos aguardando atendimento"
                    >
                      {items.map((item, index) => (
                        <TalkMeQueueCard
                          key={item.contactId}
                          item={item}
                          active={index === safeIndex}
                          disabled={!!claimingContactId || reconciling}
                          onSelect={() => selectQueueItem(index)}
                          onMove={(direction) => selectQueueItem(index + direction, true)}
                          buttonRef={(node) => {
                            if (node) queueCardRefs.current.set(item.contactId, node);
                            else queueCardRefs.current.delete(item.contactId);
                          }}
                        />
                      ))}
                      {loadingMore && (
                        <div role="status" aria-label="Carregando mais atendimentos" className="talk-me-queue-card flex w-24 shrink-0 items-center justify-center text-zinc-400">
                          <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" />
                        </div>
                      )}
                    </div>
                    <Button variant="outline" size="icon" onClick={() => moveQueueViewport(1)} disabled={items.length <= 1 || !!claimingContactId || reconciling} className="h-11 w-11 shrink-0 rounded-full border-white/15 bg-black text-white hover:bg-zinc-900" aria-label="Ver próximos contatos na fila">
                      {loadingMore ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" /> : <ChevronRight className="h-5 w-5" />}
                    </Button>
                  </div>
                  {loadMoreError && (
                    <div role="alert" className="mt-3 flex items-center justify-center gap-3 text-xs text-zinc-300">
                      <span>{loadMoreError}</span>
                      <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore} className="h-8 rounded-full border-white/15 bg-black text-white">
                        Tentar novamente
                      </Button>
                    </div>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
