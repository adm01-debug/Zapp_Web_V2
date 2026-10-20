import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { Search, X, Plus, MessageSquare, Users, Hash, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TeamConversation } from '@/hooks/team-chat/teamChatTypes';
import { useActiveDepartments, ActiveDepartment } from '@/hooks/team-chat/useActiveDepartments';
import { DepartmentManagementDialog } from './DepartmentManagementDialog';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FilterType = 'all' | 'direct' | 'group' | 'department';

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'direct', label: 'Diretas' },
  { key: 'group', label: 'Grupos' },
  { key: 'department', label: 'Deptos' },
];

interface Props {
  conversations: TeamConversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewConversation?: () => void;
  currentUserId?: string;
  canManageDepartments?: boolean;
  currentUserName?: string;
}

export function TeamConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  currentUserId,
  canManageDepartments,
  currentUserName,
}: Props) {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [managingDept, setManagingDept] = useState<ActiveDepartment | null>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const { data: departments = [] } = useActiveDepartments(activeFilter === 'department' || !!managingDept);

  const filtered = (() => {
    let result = conversations;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => (c.name ?? '').toLowerCase().includes(q));
    }
    if (activeFilter === 'direct') result = result.filter(c => c.type === 'direct');
    else if (activeFilter === 'group') result = result.filter(c => c.type === 'group');
    else if (activeFilter === 'department') result = result.filter(c => !!c.department_id);
    return result;
  })();

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      itemRefs.current[index + 1]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      itemRefs.current[index - 1]?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const conv = filtered[index];
      if (conv) onSelect(conv.id);
    }
  }, [filtered, onSelect]);

  return (
    <div className="flex flex-col h-full bg-inbox-panel">
      <div className="flex items-center gap-2 px-3 py-3 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-muted/40 border-0 focus-visible:ring-1"
          />
          {search && (
            <Button
              size="icon"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
              onClick={() => setSearch('')}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
        {onNewConversation && (
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onNewConversation} aria-label="Nova conversa">
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="flex gap-1 px-3 pb-2 shrink-0" role="tablist" aria-label="Filtros de conversa">
        {FILTERS.map(f => (
          <button
            key={f.key}
            role="tab"
            aria-selected={activeFilter === f.key}
            onClick={() => setActiveFilter(f.key)}
            className={cn(
              'px-2.5 py-1 rounded text-xs font-medium transition-colors',
              activeFilter === f.key
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto" role="listbox" aria-label="Conversas">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground gap-2">
            <MessageSquare className="w-6 h-6 opacity-40" />
            <span>Nenhuma conversa</span>
          </div>
        ) : (
          filtered.map((conv, idx) => {
            const isSelected = conv.id === selectedId;
            const dept = conv.department_id
              ? departments.find(d => d.id === conv.department_id)
              : undefined;

            return (
              <div
                key={conv.id}
                ref={el => { itemRefs.current[idx] = el; }}
                role="option"
                aria-selected={isSelected}
                tabIndex={0}
                onClick={() => onSelect(conv.id)}
                onKeyDown={e => handleKeyDown(e, idx)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors group',
                  isSelected ? 'bg-primary/10' : 'hover:bg-muted/40',
                )}
              >
                <div className="relative shrink-0">
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={conv.avatar_url ?? undefined} />
                    <AvatarFallback className={cn(
                      'text-xs font-semibold',
                      conv.type === 'direct' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                      conv.department_id ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                    )}>
                      {conv.type === 'direct'
                        ? <MessageSquare className="w-4 h-4" />
                        : conv.department_id
                          ? <Hash className="w-4 h-4" />
                          : <Users className="w-4 h-4" />
                      }
                    </AvatarFallback>
                  </Avatar>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 justify-between">
                    <span className="text-sm font-medium truncate">
                      {conv.name ?? (conv.type === 'direct' ? 'Conversa direta' : 'Grupo')}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {conv.last_message && (
                        <span className="text-xs text-muted-foreground/60 tabular-nums">
                          {formatDistanceToNow(new Date(conv.last_message.created_at), { addSuffix: false, locale: ptBR })}
                        </span>
                      )}
                      {(conv.unread_count ?? 0) > 0 && (
                        <Badge variant="default" className="h-4 min-w-4 px-1 text-3xs rounded-full">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 justify-between">
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.last_message?.content ?? (dept ? dept.description ?? dept.name : '')}
                    </p>
                    {conv.department_id && canManageDepartments && dept && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                        onClick={e => { e.stopPropagation(); setManagingDept(dept); }}
                        aria-label={`Gerenciar departamento ${dept.name}`}
                      >
                        <Settings2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {managingDept && (
        <DepartmentManagementDialog
          open={!!managingDept}
          onOpenChange={open => { if (!open) setManagingDept(null); }}
          department={managingDept}
          currentUserName={currentUserName ?? ''}
          isAdmin={!!canManageDepartments}
        />
      )}
    </div>
  );
}
