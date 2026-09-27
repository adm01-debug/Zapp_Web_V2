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
import { useInboxFilterTags } from '@/hooks/inbox/useInboxFilterTags';
import { useAgents } from '@/hooks/crm/useAgents';
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
  const { data: tags = [] } = useInboxFilterTags();
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

  const clearFilters = useCallback(() => {
    onFiltersChange({ status: [], tags: [], agentId: null, dateRange: { from: null, to: null } });
    if (onShowAllChange) onShowAllChange(false);
    if (onContactTypeChange) onContactTypeChange(null);
    if (onQueueChange) onQueueChange(null);
  }, [onFiltersChange, onShowAllChange, onContactTypeChange, onQueueChange]);

  return (
    <div className="flex items-center gap-2">
      {onRefetch && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onRefetch}
          disabled={isRefetching}
          title="Atualizar"
        >
          <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
        </Button>
      )}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="relative">
            <SlidersHorizontal className="h-4 w-4 mr-2" />
            Filtros
            {triggerBadgeCount > 0 && (
              <Badge variant="default" className="ml-1 h-4 min-w-4 px-1 text-xs">
                {triggerBadgeCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" align="end">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Filtros</h4>
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 text-xs">
                  <X className="h-3 w-3 mr-1" /> Limpar
                </Button>
              )}
            </div>

            <Separator />

            {/* Status */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <MessageCircle className="h-3 w-3" /> Status
              </Label>
              <div className="flex flex-wrap gap-1">
                {STATUS_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    variant={filters.status.includes(opt.value) ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => toggleStatus(opt.value)}
                  >
                    {opt.icon} {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Tipo de contato */}
            {onContactTypeChange && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Users className="h-3 w-3" /> Tipo de Contato
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {FILTER_OPTIONS.map(opt => (
                      <Button
                        key={opt.value ?? 'all'}
                        variant={selectedContactType === opt.value ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onContactTypeChange(opt.value)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Fila */}
            {onQueueChange && queues.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Headphones className="h-3 w-3" /> Fila
                  </Label>
                  <Select
                    value={selectedQueueId ?? 'all'}
                    onValueChange={v => onQueueChange(v === 'all' ? null : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todas as filas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as filas</SelectItem>
                      {queues.map(q => (
                        <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Separator />
              </>
            )}

            {/* Etiquetas */}
            {tags.length > 0 && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Etiquetas
                  </Label>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {tags.map(tag => (
                      <Button
                        key={tag.id}
                        variant={filters.tags.includes(tag.id) ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.name}
                      </Button>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Agente */}
            {canShowAll && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <User className="h-3 w-3" /> Agente
                  </Label>
                  <Select
                    value={filters.agentId ?? 'all'}
                    onValueChange={v => onFiltersChange({ ...filters, agentId: v === 'all' ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Todos os agentes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os agentes</SelectItem>
                      {agents.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                    <Inbox className="h-3 w-3" /> Mostrar todos
                  </Label>
                  <Switch
                    checked={showAll}
                    onCheckedChange={onShowAllChange}
                    className="scale-75"
                  />
                </div>
                <Separator />
              </>
            )}

            {/* Data */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Período
              </Label>
              <div className="flex flex-wrap gap-1">
                {DATE_PRESETS.map(preset => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => onFiltersChange({ ...filters, dateRange: preset.getValue() })}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              {filters.dateRange.from && (
                <p className="text-xs text-muted-foreground">
                  {format(filters.dateRange.from, "dd/MM/yyyy", { locale: ptBR })}
                  {filters.dateRange.to && ` — ${format(filters.dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`}
                </p>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
