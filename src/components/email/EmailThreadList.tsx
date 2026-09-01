import { useState, useMemo } from 'react';
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
  Paperclip, MailX
} from 'lucide-react';
import type { EmailThread } from '@/hooks/integrations/useGmail';
import { cn } from '@/lib/utils';

// E17: Cor determinística de avatar por endereço
const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
];

function getAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  if (email) return email[0]?.toUpperCase() || '?';
  return '?';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
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
  labels: { id: string; name: string; gmail_label_id: string; label_type: string; unread_count: number }[];
  unreadCount: number;
  selectedThreadId: string | null;
  activeAccountEmail: string;
  onSelectThread: (thread: EmailThread) => void;
  onNewEmail: () => void;
  onSync: () => void;
  isSyncing: boolean;
}

export function EmailThreadList({
  threads, threadsLoading, labels, unreadCount,
  selectedThreadId, activeAccountEmail,
  onSelectThread, onNewEmail, onSync, isSyncing
}: EmailThreadListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');

  const filteredThreads = useMemo(() => {
    let result = threads;
    if (filter === 'unread') result = result.filter(t => t.is_unread);
    if (filter === 'starred') result = result.filter(t => t.is_starred);
    if (labelFilter !== 'all') {
      result = result.filter(t => t.label_ids?.includes(labelFilter));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.subject?.toLowerCase().includes(q) ||
        t.snippet?.toLowerCase().includes(q) ||
        t.contact?.name?.toLowerCase().includes(q) ||
        t.contact?.email?.toLowerCase().includes(q) ||
        t.last_from_name?.toLowerCase().includes(q) ||
        t.last_from_address?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [threads, filter, labelFilter, searchQuery]);

  return (
    <>
      {/* Toolbar */}
      <div className="p-3 border-b border-border/30 space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-destructive shrink-0" />
          <h2 className="text-sm font-semibold flex-1">Email</h2>
          {unreadCount > 0 && (
            <Badge variant="default" className="text-[10px] px-1.5 py-0">{unreadCount}</Badge>
          )}
          <Button variant="default" size="sm" className="h-7 text-xs" onClick={onNewEmail}>
            <Pencil className="w-3 h-3 mr-1" />
            Novo
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={onSync} disabled={isSyncing}>
            <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
          </Button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar..."
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unread">Não lidos</SelectItem>
              <SelectItem value="starred">Favoritos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* E31: Label filter chips com max-w e title */}
        {labels.length > 0 && (
          <div className="relative">
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
              <Badge
                variant={labelFilter === 'all' ? 'default' : 'outline'}
                className="text-[10px] px-2 py-0.5 cursor-pointer shrink-0 hover:bg-primary/10"
                onClick={() => setLabelFilter('all')}
              >
                Todos
              </Badge>
              {labels
                .filter(l => l.label_type === 'user' || ['INBOX', 'SENT', 'IMPORTANT', 'DRAFT'].includes(l.gmail_label_id))
                .map((label) => (
                  <Badge
                    key={label.id}
                    variant={labelFilter === label.gmail_label_id ? 'default' : 'outline'}
                    className="text-[10px] px-2 py-0.5 cursor-pointer shrink-0 hover:bg-primary/10 max-w-[140px]"
                    title={label.name}
                    onClick={() => setLabelFilter(label.gmail_label_id)}
                  >
                    <span className="truncate">{label.name}</span>
                    {label.unread_count > 0 && (
                      <span className="ml-1 text-[9px] opacity-70 shrink-0">{label.unread_count}</span>
                    )}
                  </Badge>
                ))
              }
            </div>
          </div>
        )}
      </div>

      {/* Thread list */}
      <ScrollArea className="flex-1">
        {threadsLoading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
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
            {searchQuery ? (
              <>
                <MailX className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">Nenhum resultado</p>
                <p className="text-xs text-center">Tente buscar por outro termo ou remova os filtros.</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => { setSearchQuery(''); setFilter('all'); setLabelFilter('all'); }}>
                  Limpar filtros
                </Button>
              </>
            ) : filter !== 'all' || labelFilter !== 'all' ? (
              <>
                <Inbox className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm font-medium mb-1">Nenhum email neste filtro</p>
                <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => { setFilter('all'); setLabelFilter('all'); }}>
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
          filteredThreads.map(thread => (
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
      <div className="p-2 border-t border-border/30 text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
        <Mail className="w-3 h-3" />
        <span className="truncate">{activeAccountEmail}</span>
      </div>
    </>
  );
}

function ThreadItem({ thread, isSelected, onClick }: {
  thread: EmailThread;
  isSelected: boolean;
  onClick: () => void;
}) {
  // E16: cadeia de fallback correta — NUNCA snippet.split(' ')[0]
  const displayName =
    thread.contact?.name ||
    thread.last_from_name ||
    thread.last_from_address?.split('@')[0] ||
    'Remetente desconhecido';

  // E17: seed para a cor — usar endereço estável
  const avatarSeed =
    thread.contact?.email ||
    thread.last_from_address ||
    thread.id;

  const avatarColor = getAvatarColor(avatarSeed);

  return (
    // E29: overflow-hidden no botão para conter o truncate
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 flex items-center gap-3 transition-all border-b border-border/10 overflow-hidden',
        isSelected ? 'bg-accent' : 'hover:bg-muted/50',
        thread.is_unread && 'font-medium'
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarFallback className={cn('text-xs font-medium', thread.is_unread ? avatarColor : 'bg-muted text-muted-foreground')}>
            {getInitials(
              thread.contact?.name || thread.last_from_name,
              thread.contact?.email || thread.last_from_address
            )}
          </AvatarFallback>
        </Avatar>
        {thread.is_unread && (
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
        )}
      </div>

      {/* E29: min-w-0 garantido + gap reservado */}
      <div className="flex-1 min-w-0">
        {/* E30: hierarquia clara — remetente > assunto > snippet */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            'text-sm min-w-0 truncate',
            thread.is_unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80'
          )}>
            {displayName}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {thread.last_message_at && formatDate(thread.last_message_at)}
          </span>
        </div>
        <p className={cn(
          'text-xs truncate mt-0.5',
          thread.is_unread ? 'text-foreground font-medium' : 'text-muted-foreground'
        )}>
          {thread.subject || '(Sem assunto)'}
        </p>
        <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5 leading-snug">
          {thread.snippet}
        </p>
      </div>

      {/* E29: coluna de badges com largura mínima reservada */}
      <div className="flex flex-col items-end gap-1 shrink-0 min-w-[20px]">
        {thread.message_count > 1 && (
          <Badge variant="secondary" className="text-[9px] px-1 py-0">{thread.message_count}</Badge>
        )}
        <div className="flex items-center gap-0.5">
          {thread.is_starred && <Star className="w-3 h-3 text-amber-500 fill-current" />}
          {thread.label_ids?.includes('HAS_ATTACHMENT') && <Paperclip className="w-3 h-3 text-muted-foreground" />}
        </div>
      </div>
    </motion.button>
  );
}
