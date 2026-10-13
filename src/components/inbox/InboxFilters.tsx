import { useState, useCallback } from 'react';
import { SlidersHorizontal, X, Calendar, User, Tag, MessageCircle, Users, Headphones, Inbox, RefreshCw, BookmarkPlus, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { format } from 'date-fns';
import { appDayEnd, appDayStart, appMonthStart } from '@/lib/localDay';
import { ptBR } from 'date-fns/locale';
import { useInboxFilterTags } from '@/hooks/inbox/useInboxFilterTags';
import { useAgents } from '@/hooks/crm/useAgents';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useQueues } from '@/hooks/business/useQueues';
import { useSavedFilters, type SavedFilter } from '@/hooks/chat/useSavedFilters';
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
  { label: 'Hoje', getValue: () => ({ from: appDayStart(0), to: appDayEnd(0) }) },
  { label: '7 dias', getValue: () => ({ from: appDayStart(7), to: appDayEnd(0) }) },
  { label: '30 dias', getValue: () => ({ from: appDayStart(30), to: appDayEnd(0) }) },
  { label: 'Mês', getValue: () => ({ from: appMonthStart(), to: appDayEnd(0) }) },
];

/**
 * Converte o JSON gravado em `saved_filters.filters` para o estado que a lista
 * entende. As datas vão como ISO (o JSON do banco não guarda `Date`) e voltam
 * como `Date` na leitura — sem isso o filtro salvo nunca reaplicava o período.
 */
function savedFilterToState(filters: Record<string, unknown>): InboxFiltersState {
  const range = (filters.dateRange ?? {}) as { from?: string | null; to?: string | null };
  return {
    status: Array.isArray(filters.status) ? (filters.status as string[]) : [],
    tags: Array.isArray(filters.tags) ? (filters.tags as string[]) : [],
    agentId: typeof filters.agentId === 'string' ? filters.agentId : null,
    dateRange: {
      from: range.from ? new Date(range.from) : null,
      to: range.to ? new Date(range.to) : null,
    },
  };
}

export function InboxFilters({
  filters, onFiltersChange,
  showAll = false, onShowAllChange,
  selectedContactType = null, onContactTypeChange,
  selectedQueueId = null, onQueueChange,
  onRefetch, isRefetching = false,
}: InboxFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNamingFilter, setIsNamingFilter] = useState(false);
  const [filterName, setFilterName] = useState('');
  const { agents } = useAgents();
  const { data: tags = [] } = useInboxFilterTags();
  const { isAdmin, isSupervisor } = useUserRole();
  const { queues } = useQueues();
  const { filters: savedFilters, saveFilter, deleteFilter, isSaving } = useSavedFilters('inbox');
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

  // Reaplica um filtro salvo: devolve ao formulário e à lista tudo o que foi
  // gravado (status, etiquetas, agente, período, tipo de contato, fila).
  const applySavedFilter = useCallback((saved: SavedFilter) => {
    onFiltersChange(savedFilterToState(saved.filters));
    if (onContactTypeChange) {
      onContactTypeChange(typeof saved.filters.contactType === 'string' ? saved.filters.contactType : null);
    }
    if (onQueueChange) {
      onQueueChange(typeof saved.filters.queueId === 'string' ? saved.filters.queueId : null);
    }
    if (onShowAllChange) onShowAllChange(saved.filters.showAll === true);
    setIsOpen(false);
  }, [onFiltersChange, onContactTypeChange, onQueueChange, onShowAllChange]);

  // Grava o filtro atual com o nome digitado. As datas saem em ISO porque o
  // JSON do banco não guarda `Date`.
  const saveCurrentFilters = useCallback(() => {
    const name = filterName.trim();
    if (!name) return;
    saveFilter({
      name,
      filters: {
        status: filters.status,
        tags: filters.tags,
        agentId: filters.agentId,
        contactType: selectedContactType,
        queueId: selectedQueueId,
        showAll,
        dateRange: {
          from: filters.dateRange.from ? filters.dateRange.from.toISOString() : null,
          to: filters.dateRange.to ? filters.dateRange.to.toISOString() : null,
        },
      },
    });
    setFilterName('');
    setIsNamingFilter(false);
  }, [filterName, saveFilter, filters, selectedContactType, selectedQueueId, showAll]);

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

            {/* Filtros salvos */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Bookmark className="h-3 w-3" /> Filtros salvos
                </Label>
                {!isNamingFilter && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setIsNamingFilter(true)}
                    disabled={activeFiltersCount === 0}
                    title={activeFiltersCount === 0 ? 'Aplique algum filtro antes de salvar' : 'Salvar os filtros atuais'}
                  >
                    <BookmarkPlus className="h-3 w-3 mr-1" /> Salvar
                  </Button>
                )}
              </div>

              {isNamingFilter && (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveCurrentFilters(); if (e.key === 'Escape') setIsNamingFilter(false); }}
                    placeholder="Nome do filtro"
                    aria-label="Nome do filtro"
                    className="h-7 text-xs"
                  />
                  <Button size="sm" className="h-7 text-xs" onClick={saveCurrentFilters} disabled={isSaving || !filterName.trim()}>
                    Salvar
                  </Button>
                </div>
              )}

              {savedFilters.length > 0 ? (
                <div className="space-y-1" data-testid="inbox-filtros-salvos">
                  {savedFilters.map((saved) => (
                    <div key={saved.id} className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 flex-1 justify-start text-xs truncate"
                        onClick={() => applySavedFilter(saved)}
                        title={saved.is_shared ? `${saved.name} (compartilhado)` : saved.name}
                      >
                        {saved.is_default && <Bookmark className="h-3 w-3 mr-1 shrink-0" />}
                        <span className="truncate">{saved.name}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={`Remover filtro ${saved.name}`}
                        onClick={() => deleteFilter(saved.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum filtro salvo.</p>
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
                    <SelectTrigger className="h-8 text-xs" aria-label="Fila">
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
                    <SelectTrigger className="h-8 text-xs" aria-label="Agente">
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
                    aria-label="Mostrar todos"
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
