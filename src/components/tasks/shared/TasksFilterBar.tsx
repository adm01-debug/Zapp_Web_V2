import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';
import type { Priority } from '@/hooks/tasks/workItem.types';
import type { TasksFilters } from '@/hooks/tasks/workItemFilters';

/** Etapa 45: a barra de filtros do módulo — busca (debounce de 200ms em
 *  `useTasksFilters`), prioridade, contato com busca, alarme, concluídas e o
 *  "Limpar", que só aparece quando algum filtro sai do padrão. */

interface Props {
  filters: TasksFilters;
  /** Texto do campo de busca (imediato; o filtro em si é debounced). */
  searchText: string;
  /** Contatos que aparecem nas tarefas carregadas — fonte local, sem query nova. */
  contactOptions: Array<{ id: string; name: string }>;
  onSearch: (value: string) => void;
  onPrio: (value: Priority | 'all') => void;
  onContact: (value: string | null) => void;
  onToggleAlarm: () => void;
  onToggleDone: () => void;
  onClear: () => void;
  isActive: boolean;
}

/** Fase F (auditoria): nome vazio não pode virar gatilho em branco, e um contato
 *  fora da lista carregada não pode se passar por "Todos os contatos". */
function rotuloContato(contactId: string | null, contato: { id: string; name: string } | null): string {
  if (contactId === null) return 'Todos os contatos';
  if (contato === null) return 'Contato indisponível';
  if (contato.name === '') return 'Sem nome';
  return contato.name;
}

export function TasksFilterBar({
  filters, searchText, contactOptions,
  onSearch, onPrio, onContact, onToggleAlarm, onToggleDone, onClear, isActive,
}: Props) {
  const [contatoAberto, setContatoAberto] = useState(false);
  const contatoAtual = contactOptions.find(c => c.id === filters.contact) ?? null;

  return (
    <div data-testid="tasks-filter-bar" className="flex items-center gap-2 flex-wrap">
      <div className="relative flex-1 min-w-[200px] max-w-[320px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          value={searchText}
          onChange={e => onSearch(e.target.value)}
          placeholder="Buscar tarefa…"
          aria-label="Buscar tarefa"
          className="h-11 rounded-xl bg-input border-border pl-9 text-[15px]"
        />
      </div>

      <Select value={filters.prio} onValueChange={v => onPrio(v as Priority | 'all')}>
        <SelectTrigger aria-label="Prioridade" className="h-11 w-[150px] rounded-xl">
          <SelectValue placeholder="Prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as prioridades</SelectItem>
          {(['urgent', 'high', 'medium', 'low'] as Priority[]).map(p => (
            <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={contatoAberto} onOpenChange={setContatoAberto}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label="Contato"
            className="h-11 w-[170px] rounded-xl justify-start font-normal truncate"
          >
            {rotuloContato(filters.contact, contatoAtual)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="p-0 w-[240px]">
          <Command>
            <CommandInput placeholder="Buscar contato…" />
            <CommandList>
              <CommandEmpty>Nenhum contato</CommandEmpty>
              <CommandItem value="todos" onSelect={() => { onContact(null); setContatoAberto(false); }}>
                Todos os contatos
              </CommandItem>
              {contactOptions.map(c => (
                <CommandItem
                  key={c.id}
                  value={`${c.name || c.id} ${c.id}`}
                  onSelect={() => { onContact(c.id); setContatoAberto(false); }}
                >
                  {c.name || 'Sem nome'}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <label className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border bg-input text-[13px]">
        <Switch checked={filters.alarm} onCheckedChange={onToggleAlarm} aria-label="Com alarme" />
        Com alarme
      </label>

      <label className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border bg-input text-[13px]">
        <Switch checked={filters.done} onCheckedChange={onToggleDone} aria-label="Mostrar concluídas" />
        Mostrar concluídas
      </label>

      {isActive && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-11 rounded-xl text-muted-foreground"
        >
          <X className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      )}
    </div>
  );
}
