import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Mail, Search, RefreshCw, Pencil, Inbox, Star,
  ChevronLeft, ChevronRight, MailX, Paperclip, X
} from 'lucide-react';
import type { EmailThread } from '@/hooks/integrations/useGmail';
import { cn } from '@/lib/utils';

function getInitials(name?: string | null, email?: string): string {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (email) return email[0]?.toUpperCase() || '?';
  return '?';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 86400000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800000) {
    return date.toLocaleDateString('pt-BR', { weekday: 'short' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

interface EmailThreadListProps {
  threads: EmailThread[];
  threadsLoading: boolean;
  threadsError?: Error | null;
  labels: { id: string; name: string; gmail_label_id: string; label_type: string; unread_count: number }[];
  unreadCount: number;
  globalSearchQuery?: string;
  onClearGlobalSearch?: () => void;
  selectedThreadId: string | null;
  activeAccountEmail: string;
  onSelectThread: (thread: EmailThread) => void;
  onNewEmail: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export function EmailThreadList({
  threads, threadsLoading, threadsError, labels, unreadCount, globalSearchQuery = '', onClearGlobalSearch,
  selectedThreadId, activeAccountEmail,
  onSelectThread, onNewEmail, onSync, isSyncing
}: EmailThreadListProps) {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [searchQuery, setSearchQuery] = useState(() => initialParams.get('emailQuery') || '');
  const [filter, setFilter] = useState(() => ['all', 'unread', 'starred'].includes(initialParams.get('emailFilter') || '') ? initialParams.get('emailFilter')! : 'all');
  const [hasAttachmentFilter, setHasAttachmentFilter] = useState(() => initialParams.get('emailAttachment') === 'true' || initialParams.get('emailFilter') === 'has_attachment');
  const [labelFilter, setLabelFilter] = useState(() => initialParams.get('emailLabel') || 'all');
  const [periodFilter, setPeriodFilter] = useState(() => ['all', 'today', '7d', '30d'].includes(initialParams.get('emailPeriod') || '') ? initialParams.get('emailPeriod')! : 'all');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const filteredThreads = useMemo(() => {
    let result = threads;
    if (filter === 'unread') result = result.filter(t => t.is_unread);
    if (filter === 'starred') result = result.filter(t => t.is_starred);
    if (hasAttachmentFilter) result = result.filter(t => t.has_attachments);
    if (labelFilter !== 'all') {
      result = result.filter(t => t.label_ids?.includes(labelFilter));
    }
    if (periodFilter !== 'all') {
      const cutoff = new Date();
      if (periodFilter === 'today') cutoff.setHours(0, 0, 0, 0);
      else cutoff.setDate(cutoff.getDate() - Number.parseInt(periodFilter, 10));
      result = result.filter(thread => new Date(thread.last_message_at).getTime() >= cutoff.getTime());
    }
    const effectiveSearch = (globalSearchQuery || searchQuery).trim();
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase();
      result = result.filter(t =>
        t.subject?.toLowerCase().includes(q) ||
        t.snippet?.toLowerCase().includes(q) ||
        t.last_from_name?.toLowerCase().includes(q) ||
        t.last_from_address?.toLowerCase().includes(q) ||
        t.contact?.name?.toLowerCase().includes(q) ||
        t.contact?.email?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [threads, filter, hasAttachmentFilter, labelFilter, periodFilter, searchQuery, globalSearchQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredThreads.length / pageSize));
  const effectivePage = Math.min(page, pageCount);
  const visibleThreads = filteredThreads.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);

  useEffect(() => {
    const url = new URL(window.location.href);
    const setOrDelete = (name: string, value: string, defaultValue: string) => value === defaultValue ? url.searchParams.delete(name) : url.searchParams.set(name, value);
    setOrDelete('emailFilter', filter, 'all');
    setOrDelete('emailAttachment', String(hasAttachmentFilter), 'false');
    setOrDelete('emailLabel', labelFilter, 'all');
    setOrDelete('emailPeriod', periodFilter, 'all');
    setOrDelete('emailQuery', searchQuery.trim(), '');
    window.history.replaceState(window.history.state, '', url);
  }, [filter, hasAttachmentFilter, labelFilter, periodFilter, searchQuery]);

  return (
    <>
      {/* Toolbar */}
      <div className="shrink-0 space-y-2 border-b border-cyan-300/10 bg-[#051725] p-3">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 shrink-0 text-blue-400" />
          <h2 className="flex-1 text-sm font-semibold text-slate-100">Conversas</h2>
          {unreadCount > 0 && (
            <Badge variant="default" className="text-3xs px-1.5 py-0">
              {unreadCount}
            </Badge>
          )}
          <Button variant="default" size="sm" className="h-7 bg-blue-600 text-xs hover:bg-blue-500" onClick={onNewEmail}>
            <Pencil className="w-3 h-3 mr-1" />
            Novo
          </Button>
          <Button
            variant="outline" size="icon" className="h-7 w-7 border-cyan-300/10 bg-[#081c2d] text-slate-300"
            onClick={onSync}
            disabled={isSyncing}
            aria-label="Sincronizar conversas"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              aria-label="Buscar nas conversas"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Buscar..."
              className="h-8 border-cyan-300/10 bg-[#071a2a] pl-8 text-sm text-slate-100 placeholder:text-slate-500"
            />
          </div>
          <Select value={filter} onValueChange={value => { setFilter(value); setPage(1); }}>
            <SelectTrigger aria-label="Filtrar conversas" className="h-8 w-[112px] border-cyan-300/10 bg-[#071a2a] text-xs text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unread">Não lidos</SelectItem>
              <SelectItem value="starred">Favoritos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={labelFilter} onValueChange={value => { setLabelFilter(value); setPage(1); }}>
            <SelectTrigger aria-label="Pasta ou marcador" className="h-7 min-w-[120px] flex-1 border-cyan-300/10 bg-[#071a2a] text-3xs text-slate-200"><SelectValue placeholder="Pasta/marcador" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os e-mails</SelectItem>
              {labels.filter(label => label.label_type === 'user' || ['INBOX', 'SENT', 'IMPORTANT', 'DRAFT', 'TRASH', 'SPAM'].includes(label.gmail_label_id)).map(label => (
                <SelectItem key={label.id} value={label.gmail_label_id} title={label.name}>{label.name}{label.unread_count > 0 ? ` (${label.unread_count})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant={hasAttachmentFilter ? 'default' : 'outline'} size="sm" aria-pressed={hasAttachmentFilter} className="h-7 shrink-0 border-cyan-300/10 px-2 text-3xs" onClick={() => { setHasAttachmentFilter(current => !current); setPage(1); }}><Paperclip className="mr-1 h-3 w-3" />Com anexo</Button>
          <Select value={periodFilter} onValueChange={value => { setPeriodFilter(value); setPage(1); }}>
            <SelectTrigger aria-label="Filtrar por período" className="h-7 w-[94px] shrink-0 border-cyan-300/10 bg-[#071a2a] text-3xs text-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Qualquer data</SelectItem><SelectItem value="today">Hoje</SelectItem><SelectItem value="7d">7 dias</SelectItem><SelectItem value="30d">30 dias</SelectItem></SelectContent>
          </Select>
          {(filter !== 'all' || hasAttachmentFilter || labelFilter !== 'all' || periodFilter !== 'all' || searchQuery) && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-3xs text-slate-400" onClick={() => { setSearchQuery(''); onClearGlobalSearch?.(); setFilter('all'); setHasAttachmentFilter(false); setLabelFilter('all'); setPeriodFilter('all'); setPage(1); }}><X className="mr-1 h-3 w-3" />Limpar</Button>}
        </div>
      </div>

      {/* Thread list */}
      <ScrollArea className="flex-1">
        {threadsError ? (
          <div role="alert" className="flex flex-col items-center justify-center px-6 py-16 text-center text-slate-400">
            <MailX className="mb-3 h-10 w-10 text-red-400/80" />
            <p className="text-sm font-medium text-slate-200">Falha ao carregar conversas</p>
            <p className="mt-1 text-xs">Sincronize novamente ou confira a conexão da conta.</p>
            <Button variant="outline" size="sm" className="mt-4 border-cyan-300/10 bg-[#071a2a]" onClick={onSync}>Tentar novamente</Button>
          </div>
        ) : threadsLoading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
                <Skeleton className="h-3 w-10" />
              </div>
            ))}
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground px-6">
            {searchQuery || globalSearchQuery ? (
              <>
                <MailX className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">Nenhum resultado</p>
                <p className="text-xs text-center">Tente buscar por outro termo ou remova os filtros.</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => { setSearchQuery(''); onClearGlobalSearch?.(); setFilter('all'); setHasAttachmentFilter(false); setLabelFilter('all'); setPeriodFilter('all'); }}>
                  Limpar filtros
                </Button>
              </>
            ) : filter !== 'all' || hasAttachmentFilter || labelFilter !== 'all' || periodFilter !== 'all' ? (
              <>
                <Inbox className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">Nenhum email neste filtro</p>
                <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => { setFilter('all'); setHasAttachmentFilter(false); setLabelFilter('all'); setPeriodFilter('all'); }}>
                  Ver todos
                </Button>
              </>
            ) : (
              <>
                <Inbox className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">Inbox vazio</p>
                <p className="text-xs text-center">Sincronize seus emails para começar.</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={onSync}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Sincronizar agora
                </Button>
              </>
            )}
          </div>
        ) : (
          visibleThreads.map(thread => (
            <ThreadItem
              key={thread.id}
              thread={thread}
              isSelected={selectedThreadId === thread.id}
              onClick={() => onSelectThread(thread)}
            />
          ))
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="flex shrink-0 items-center gap-1 border-t border-cyan-300/10 bg-[#041421] p-2 text-3xs text-slate-400">
        <Mail className="w-3 h-3" />
        <span className="truncate">{activeAccountEmail}</span>
        <span className="ml-auto shrink-0">{filteredThreads.length === 0 ? 0 : (effectivePage - 1) * pageSize + 1}–{Math.min(effectivePage * pageSize, filteredThreads.length)} de {filteredThreads.length}</span>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Página anterior" disabled={effectivePage <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}><ChevronLeft className="h-3 w-3" /></Button>
        <span aria-label={`Página ${effectivePage} de ${pageCount}`}>{effectivePage}/{pageCount}</span>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label="Próxima página" disabled={effectivePage >= pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))}><ChevronRight className="h-3 w-3" /></Button>
      </div>
    </>
  );
}

function ThreadItem({ thread, isSelected, onClick }: { thread: EmailThread; isSelected: boolean; onClick: () => void }) {
  // h538172: nunca mais "1ª palavra do snippet" como nome — usa o remetente
  // real da thread (colunas last_from_* já existem no banco e chegam no select('*')).
  const name = thread.contact?.name
    || thread.last_from_name
    || thread.last_from_address
    || thread.contact?.email
    || 'Desconhecido';
  // Mesma cadeia do nome para as iniciais (ordem idêntica: contact.name →
  // last_from_name → last_from_address → contact.email)
  const initialsSource = thread.contact?.name || thread.last_from_name || thread.last_from_address || thread.contact?.email || undefined;

  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClick}
      className={cn(
        'w-full min-h-[72px] border-b border-cyan-300/5 p-3 text-left flex items-center gap-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
        isSelected ? 'bg-blue-600/20 shadow-[inset_3px_0_0_#3b82f6]' : 'hover:bg-cyan-300/5',
        thread.is_unread && 'font-medium'
      )}
    >
      <div className="relative">
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className={cn(
            'text-xs',
            thread.is_unread ? 'bg-primary/10 text-primary font-bold' : 'bg-muted'
          )}>
            {getInitials(initialsSource, undefined)}
          </AvatarFallback>
        </Avatar>
        {thread.is_unread && (
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-sm truncate">{name}</span>
          <span className="text-3xs text-muted-foreground shrink-0" title={thread.last_message_at ? new Date(thread.last_message_at).toLocaleString('pt-BR') : undefined}>
            {thread.last_message_at && formatDate(thread.last_message_at)}
          </span>
        </div>
        <p className={cn(
          'text-xs truncate',
          thread.is_unread ? 'text-foreground font-medium' : 'text-muted-foreground'
        )}>
          {thread.subject || '(Sem assunto)'}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-snug mt-0.5 text-left">
          {thread.snippet}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        {thread.message_count > 1 && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0">{thread.message_count}</Badge>
        )}
        <div className="flex items-center gap-0.5">
          {thread.is_starred && <Star className="w-3 h-3 text-accent-foreground fill-current" />}
          {thread.label_ids?.includes('SENT') && <Mail className="w-3 h-3 text-muted-foreground" />}
        </div>
      </div>
    </motion.button>
  );
}
