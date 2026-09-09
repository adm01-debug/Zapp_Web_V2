import { useState, useCallback } from 'react';
import { SlidersHorizontal, X, Calendar, User, Tag, MessageCircle, Users, Headphones, Inbox, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAgents } from '@/hooks/crm/useAgents';
import { useTags } from '@/hooks/crm/useTags';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useQueues } from '@/hooks/business/useQueues';
import { FILTER_OPTIONS } from './ContactTypeFilter';

export interface InboxFiltersState {
  status: string[];
  tags: string[];
  agentId: string | null;
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
}

interface InboxFiltersProps {
  filters: InboxFiltersState;
  onFiltersChange: (filters: InboxFiltersState) => void;
  showAll?: boolean;
  onShowAllChange?: (v: boolean) => void;
  selectedContactType?: string | null;
  onContactTypeChange?: (v: string | null) => void;
  selectedQueueId?: string | null;
  onQueueChange?: (v: string | null) => void;
  onRefetch?: () => void;
  isRefetching?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'unread', label: 'Não lidas', icon: '🔵' },
  { value: 'read', label: 'Lidas', icon: '✓' },
  { value: 'pending', label: 'Pendentes', icon: '⏳' },
  { value: 'resolved', label: 'Resolvidas', icon: '✅' },
];

const DATE_PRESETS = [
  { label: 'Hoje', getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: '7 dias', getValue: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) }) },
  { label: '30 dias', getValue: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) }) },
  { label: 'Mês', getValue: () => ({ from: startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), to: endOfDay(new Date()) }) },
];

export function InboxFilters({
  filters, onFiltersChange,
  showAll = false, onShowAllChange,
  selectedContactType = null, onContactTypeChange,
  selectedQueueId = null, onQueueChange,
  onRefetch, isRefetching = false,
}: InboxFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { agents } = useAgents();
  const { tags } = useTags();
  const { isAdmin, isSupervisor } = useUserRole();
  const { queues } = useQueues();
  const canShowAll = isAdmin || isSupervisor;

  const activeFiltersCount =
    filters.status.length +
    filters.tags.length +
    (filters.agentId ? 1 : 0) +
    (filters.dateRange.from ? 1 : 0) +
    (selectedContactType ? 1 : 0) +
    (selectedQueueId ? 1 : 0) +
    (showAll ? 1 : 0);

  const triggerBadgeCount = activeFiltersCount;

  const toggleStatus = useCallback((status: string) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status];
    onFiltersChange({ ...filters, status: newStatus });
  }, [filters, onFiltersChange]);

  const toggleTag = useCallback((tagId: string) => {
    const newTags = filters.tags.includes(tagId)
      ? filters.tags.filter(t => t !== tagId)
      : [...filters.tags, tagId];
    onFiltersChange({ ...filters, tags: newTags });
  }, [filters, onFiltersChange]);

  const setAgent = useCallback((agentId: string | null) => {
    onFiltersChange({ ...filters, agentId: agentId === 'all' ? null : agentId });
  }, [filters, onFiltersChange]);

  const setDateRange = useCallback((range: { from: Date | null; to: Date | null }) => {
    onFiltersChange({ ...filters, dateRange: range });
  }, [filters, onFiltersChange]);

  const clearFilters = useCallback(() => {
    onFiltersChange({ status: [], tags: [], agentId: null, dateRange: { from: null, to: null } });
    onContactTypeChange?.(null);
    onQueueChange?.(null);
    onShowAllChange?.(false);
  }, [onFiltersChange, onContactTypeChange, onQueueChange, onShowAllChange]);

  const removeFilter = useCallback((type: 'status' | 'tag' | 'agent' | 'date', value?: string) => {
    switch (type) {
      case 'status':
        onFiltersChange({ ...filters, status: filters.status.filter(s => s !== value) });
        break;
      case 'tag':
        onFiltersChange({ ...filters, tags: filters.tags.filter(t => t !== value) });
        break;
      case 'agent':
        onFiltersChange({ ...filters, agentId: null });
        break;
      case 'date':
        onFiltersChange({ ...filters, dateRange: { from: null, to: null } });
        break;
    }
  }, [filters, onFiltersChange]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            data-testid="conversation-filter-button"
            className={cn(
              'relative w-10 h-10 rounded-xl border-border bg-input shrink-0',
              triggerBadgeCount > 0 ? 'text-primary border-primary/40' : 'text-muted-foreground'
            )}
            aria-label="Filtros"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {triggerBadgeCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">
                {triggerBadgeCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Filtros</span>
            <div className="flex items-center gap-2">
              {onRefetch && (
                <button
                  onClick={onRefetch}
                  disabled={isRefetching}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className={cn('w-3 h-3', isRefetching && 'animate-spin')} />
                  Atualizar
                </button>
              )}
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                >
                  Limpar tudo
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[360px] overflow-y-auto p-3 pb-4 space-y-4">
            {/* Mostrar Todos */}
            {canShowAll && (
              <>
                <section className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    <Label htmlFor="show-all" className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Mostrar Todos</Label>
                  </div>
                  <Switch id="show-all" checked={showAll} onCheckedChange={onShowAllChange} />
                </section>
                <Separator className="opacity-50" />
              </>
            )}

            {/* Tipo de contato */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Headphones className="w-3 h-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tipo de contato</Label>
              </div>
              <Select
                value={selectedContactType ?? 'all'}
                onValueChange={(v) => onContactTypeChange?.(v === 'all' ? null : v)}
              >
                <SelectTrigger className="h-7 text-[11px] bg-muted/40 border-0 rounded-md">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <Separator className="opacity-50" />

            {/* Fila */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Inbox className="w-3 h-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Fila</Label>
              </div>
              <Select
                value={selectedQueueId ?? 'all'}
                onValueChange={(v) => onQueueChange?.(v === 'all' ? null : v)}
              >
                <SelectTrigger className="h-7 text-[11px] bg-muted/40 border-0 rounded-md">
                  <SelectValue placeholder="Todas as filas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filas</SelectItem>
                  {queues.map(q => (
                    <SelectItem key={q.id} value={q.id}>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: q.color || 'hsl(var(--primary))' }} />
                        {q.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <Separator className="opacity-50" />

            {/* Status */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-3 h-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Status</Label>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {STATUS_OPTIONS.map(status => (
                  <button
                    key={status.value}
                    onClick={() => toggleStatus(status.value)}
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] transition-all border',
                      filters.status.includes(status.value)
                        ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                        : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <span className="text-[10px]">{status.icon}</span>
                    {status.label}
                  </button>
                ))}
              </div>
            </section>

            <Separator className="opacity-50" />

            {/* Tags */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Tag className="w-3 h-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Etiquetas</Label>
              </div>
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {tags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all',
                        filters.tags.includes(tag.id)
                          ? 'ring-1.5 ring-primary shadow-sm'
                          : 'hover:opacity-80'
                      )}
                      style={{
                        backgroundColor: `${tag.color}18`,
                        color: tag.color,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground/60 italic">Nenhuma etiqueta</p>
              )}
            </section>

            <Separator className="opacity-50" />

            {/* Agent */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <User className="w-3 h-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Atendente</Label>
              </div>
              <Select
                value={filters.agentId || 'all'}
                onValueChange={setAgent}
              >
                <SelectTrigger className="h-7 text-[11px] bg-muted/40 border-0 rounded-md">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os atendentes</SelectItem>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <span className="flex items-center gap-1.5">
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          agent.status === 'online' ? 'bg-success' :
                          agent.status === 'away' ? 'bg-warning' : 'bg-muted-foreground/40'
                        )} />
                        {agent.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <Separator className="opacity-50" />

            {/* Date */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Período</Label>
              </div>
              <div className="flex flex-wrap gap-1">
                {DATE_PRESETS.map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => setDateRange(preset.getValue())}
                    className="px-2 py-1 rounded-md text-[10px] font-medium bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {filters.dateRange.from && (
                <div className="text-[10px] text-muted-foreground bg-muted/30 rounded px-2 py-1">
                  {format(filters.dateRange.from, "dd/MM/yyyy", { locale: ptBR })}
                  {filters.dateRange.to && ` → ${format(filters.dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`}
                </div>
              )}
            </section>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter chips — inline, compact */}
      {filters.status.map(status => {
        const opt = STATUS_OPTIONS.find(s => s.value === status);
        return (
          <Badge
            key={status}
            variant="secondary"
            className="h-5 gap-0.5 px-1.5 text-[10px] cursor-pointer hover:bg-destructive/15 hover:text-destructive transition-colors"
            onClick={() => removeFilter('status', status)}
          >
            {opt?.label}
            <X className="w-2.5 h-2.5 ml-0.5" />
          </Badge>
        );
      })}

      {filters.tags.map(tagId => {
        const tag = tags.find(t => t.id === tagId);
        return tag ? (
          <Badge
            key={tagId}
            variant="secondary"
            className="h-5 gap-0.5 px-1.5 text-[10px] cursor-pointer hover:bg-destructive/15 transition-colors"
            style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
            onClick={() => removeFilter('tag', tagId)}
          >
            {tag.name}
            <X className="w-2.5 h-2.5 ml-0.5" />
          </Badge>
        ) : null;
      })}

      {filters.agentId && (
        <Badge
          variant="secondary"
          className="h-5 gap-0.5 px-1.5 text-[10px] cursor-pointer hover:bg-destructive/15 hover:text-destructive transition-colors"
          onClick={() => removeFilter('agent')}
        >
          {agents.find(a => a.id === filters.agentId)?.name || 'Atendente'}
          <X className="w-2.5 h-2.5 ml-0.5" />
        </Badge>
      )}

      {filters.dateRange.from && (
        <Badge
          variant="secondary"
          className="h-5 gap-0.5 px-1.5 text-[10px] cursor-pointer hover:bg-destructive/15 hover:text-destructive transition-colors"
          onClick={() => removeFilter('date')}
        >
          {format(filters.dateRange.from, "dd/MM", { locale: ptBR })}
          {filters.dateRange.to && `–${format(filters.dateRange.to, "dd/MM", { locale: ptBR })}`}
          <X className="w-2.5 h-2.5 ml-0.5" />
        </Badge>
      )}
    </div>
  );
}
