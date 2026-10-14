import { useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
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
  showDoneToggle?: boolean;
  /** Etapa 044 (refazer 2): no Quadro e em telas estreitas, Prioridade e Contato
   *  entram no popover "Filtros" (imagem 05 do plano) e a barra fica com busca,
   *  Filtros, alarme, concluídas e Limpar. Fora desses casos os dois controles
   *  seguem soltos na barra, como antes. */
  agruparPrioContato?: boolean;
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
  showDoneToggle = true,
  agruparPrioContato = false,
}: Props) {
  const [contatoAberto, setContatoAberto] = useState(false);
  const contatoAtual = contactOptions.find(c => c.id === filters.contact) ?? null;

  /** Os dois controles que mudam de lugar (barra × popover Filtros): montados uma
   *  vez só para as duas disposições não divergirem com o tempo. */
  const prioridade = (
    <Select value={filters.prio} onValueChange={v => onPrio(v as Priority | 'all')}>
      <SelectTrigger
        aria-label="Prioridade"
        className={`h-11 rounded-xl ${agruparPrioContato ? 'w-full' : 'w-[150px]'}`}
      >
        <SelectValue placeholder="Prioridade" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Todas as prioridades</SelectItem>
        {(['urgent', 'high', 'medium', 'low'] as Priority[]).map(p => (
          <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const contato = (
    <Popover open={contatoAberto} onOpenChange={setContatoAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-label="Contato"
          className={`h-11 rounded-xl justify-start font-normal truncate ${agruparPrioContato ? 'w-full' : 'w-[170px]'}`}
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
  );

  // Quantos dos dois controles agrupados estão fora do padrão — o mesmo sinal que
  // a barra larga dá mostrando os valores escolhidos.
  const recorteAgrupado = (filters.prio !== 'all' ? 1 : 0) + (filters.contact !== null ? 1 : 0);

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

      {agruparPrioContato ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              aria-label="Filtros"
              data-testid="tasks-filter-popover"
              className="h-11 rounded-xl gap-1.5"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {recorteAgrupado > 0 && (
                <span
                  data-testid="tasks-filter-badge"
                  className="ml-0.5 rounded-full bg-primary px-1.5 text-2xs font-semibold tabular-nums text-primary-foreground"
                >
                  {recorteAgrupado}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[260px] space-y-3 p-3" data-testid="tasks-filter-popover-content">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Prioridade</p>
              {prioridade}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Contato</p>
              {contato}
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <>
          {prioridade}
          {contato}
        </>
      )}

      <label className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border bg-input text-[13px]">
        <Switch checked={filters.alarm} onCheckedChange={onToggleAlarm} aria-label="Com alarme" />
        Com alarme
      </label>

      {showDoneToggle && (
        <label className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border bg-input text-[13px]">
          <Switch checked={filters.done} onCheckedChange={onToggleDone} aria-label="Mostrar concluídas" />
          Mostrar concluídas
        </label>
      )}

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
