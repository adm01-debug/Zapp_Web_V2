import { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Users, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { format, isToday, isYesterday, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

type FilterType = 'all' | 'direct' | 'group';

interface Props {
  conversations: TeamConversation[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
}

function formatLastMessageTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Ontem';
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, 'EEE', { locale: ptBR });
  return format(d, 'dd/MM/yy');
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'direct', label: 'Diretas' },
  { key: 'group', label: 'Grupos' },
];

export function TeamConversationList({ conversations, isLoading, selectedId, onSelect, onNewConversation }: Props) {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = useMemo(() => {
    let result = conversations;
    if (activeFilter !== 'all') result = result.filter(c => c.type === activeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.last_message?.content.toLowerCase().includes(q)
      );
    }
    return result;
  }, [conversations, search, activeFilter]);

  const handleListKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const currentIdx = itemRefs.current.findIndex(el => el === document.activeElement);
    const nextIdx = e.key === 'ArrowDown'
      ? Math.min(currentIdx + 1, filtered.length - 1)
      : Math.max(currentIdx - 1, 0);
    itemRefs.current[nextIdx]?.focus();
  }, [filtered.length]);

  return (
    <>
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground text-lg">Teams</h2>
          <Button size="icon" variant="ghost" onClick={onNewConversation} title="Nova conversa">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            placeholder="Buscar conversas... (⌘F)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-9"
            aria-label="Buscar conversas"
          />
        </div>
        <div className="flex gap-1.5" role="group" aria-label="Filtrar por tipo">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              aria-pressed={activeFilter === f.key}
              className={cn(
                'px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors',
                activeFilter === f.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex-1 overflow-auto"
        role="listbox"
        aria-label="Lista de conversas"
        onKeyDown={handleListKeyDown}
      >
        {isLoading ? (
          <div className="space-y-1 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center text-muted-foreground text-sm py-12 px-4 gap-2">
            <Users className="w-8 h-8 text-muted-foreground/40" />
            <p>{search || activeFilter !== 'all' ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}</p>
            {!search && activeFilter === 'all' && (
              <p className="text-xs text-muted-foreground/60">Clique em + para iniciar uma nova conversa</p>
            )}
          </div>
        ) : (
          <div className="space-y-0.5 p-1">
            {filtered.map((conv, idx) => (
              <button
                key={conv.id}
                ref={el => { itemRefs.current[idx] = el; }}
                onClick={() => onSelect(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(conv.id); }
                }}
                role="option"
                aria-selected={selectedId === conv.id}
                aria-label={`${conv.type === 'group' ? 'Grupo' : 'Conversa'} ${conv.name || 'Sem nome'}${(conv.unread_count ?? 0) > 0 ? `, ${conv.unread_count} não lidas` : ''}`}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                  "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1",
                  selectedId === conv.id && "bg-accent"
                )}
              >
                <Avatar className="w-10 h-10 shrink-0">
                  <AvatarImage src={conv.avatar_url || undefined} alt={conv.name || 'Conversa'} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {conv.type === 'group' ? <Users className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-foreground truncate">
                      {conv.name || 'Sem nome'}
                    </span>
                    {conv.last_message && (
                      <span className="text-3xs text-muted-foreground shrink-0 tabular-nums">
                        {formatLastMessageTime(conv.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.last_message?.content || 'Sem mensagens'}
                    </p>
                    {(conv.unread_count ?? 0) > 0 && (
                      <Badge variant="default" className="ml-1 h-5 min-w-5 px-1.5 text-3xs shrink-0">
                        {conv.unread_count}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
