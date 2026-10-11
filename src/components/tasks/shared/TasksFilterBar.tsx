import { useEffect, useRef, useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ContactCombobox } from './ContactCombobox';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';
import type { Priority, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import { KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import type { DueFilter, TasksFilters } from '@/hooks/tasks/workItemFilters';
import { SEM_CONTATO } from '@/hooks/tasks/workItemFilters';
import type { TaskMode } from './ModeSwitcher';

/**
 * Etapas 033–039 da barra de filtros do módulo:
 *  033 — campo de busca com lupa, botão de limpar, atalho `/` e largura flexível;
 *  034 — dropdown de Prioridade (chevron + contador quando ativo);
 *  035 — dropdown de Contato (ContactCombobox) com "Sem contato";
 *  036 — botão Filtros com popover (estado, lembrete, prazo, concluídas) e badge;
 *  038 — toggle de concluídas rotulado por modo, com um só estado;
 *  039 — chips removíveis dos filtros ativos e "Limpar filtros".
 *
 * Os rótulos curtos com contador são a decisão do plano (incoerência 7): a
 * barra não repete o valor escolhido — quem conta o que está ativo são o
 * contador e os chips abaixo.
 */

interface Props {
  filters: TasksFilters;
  /** Texto do campo de busca (imediato; o filtro em si é debounced). */
  searchText: string;
  /** Contatos que aparecem nas tarefas carregadas — fonte local, sem query nova. */
  contactOptions: Array<{ id: string; name: string }>;
  /** Modo corrente: só muda o rótulo do toggle de concluídas (etapa 038). */
  mode?: TaskMode;
  onSearch: (value: string) => void;
  onPrio: (value: Priority | 'all') => void;
  onContact: (value: string | null) => void;
  onStatus: (value: WorkItemStatus | 'all') => void;
  onDue: (value: DueFilter) => void;
  onToggleAlarm: () => void;
  onToggleDone: () => void;
  onClear: () => void;
  isActive: boolean;
}

const PRAZO_LABELS: Record<DueFilter, string> = {
  all: 'Qualquer prazo',
  overdue: 'Atrasadas',
  today: 'Hoje',
  week: 'Esta semana',
  none: 'Sem prazo',
};

function rotuloEstado(status: WorkItemStatus | 'all'): string {
  if (status === 'all') return 'Todos os estados';
  return KANBAN_COLUMNS.find(c => c.status === status)?.label ?? status;
}

/** Fase F (auditoria): nome vazio não pode virar gatilho em branco, e um contato
 *  fora da lista carregada não pode se passar por "Todos os contatos". */
function rotuloContato(contactId: string | null, contato: { id: string; name: string } | null): string {
  if (contactId === null) return 'Todos os contatos';
  if (contactId === SEM_CONTATO) return 'Sem contato';
  if (contato === null) return 'Contato indisponível';
  if (contato.name === '') return 'Sem nome';
  return contato.name;
}

/** Contador do gatilho: quantos filtros aquele controle tem fora do padrão. */
function Contador({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
    >
      {children}
    </span>
  );
}

export function TasksFilterBar({
  filters, searchText, contactOptions, mode = 'list',
  onSearch, onPrio, onContact, onStatus, onDue, onToggleAlarm, onToggleDone, onClear, isActive,
}: Props) {
  const [filtrosAberto, setFiltrosAberto] = useState(false);
  const campoBusca = useRef<HTMLInputElement>(null);

  // Etapa 033: atalho `/` foca a busca — só fora de um campo de digitação, senão
  // a barra impediria escrever uma barra num texto qualquer.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
      if (digitando) return;
      e.preventDefault();
      campoBusca.current?.focus();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, []);

  const contatoAtual = contactOptions.find(c => c.id === filters.contact) ?? null;
  const statusAtual = filters.status ?? 'all';
  const dueAtual = filters.due ?? 'all';
  const rotuloConcluidas = mode === 'board' ? 'Concluídas' : 'Mostrar concluídas';

  // Etapa 036: o badge conta os filtros do popover (incluindo o toggle de
  // concluídas, que sai do padrão quando é desligado); prioridade e contato têm
  // os contadores deles no próprio gatilho.
  const ativosNoPopover =
    (statusAtual !== 'all' ? 1 : 0) +
    (dueAtual !== 'all' ? 1 : 0) +
    (filters.alarm ? 1 : 0) +
    (!filters.done ? 1 : 0);

  // Etapa 039: um chip por filtro ativo, cada um com o seu "remover".
  const chips: Array<{ key: string; label: string; remover: () => void }> = [];
  if (filters.q.trim() !== '') chips.push({ key: 'q', label: `Busca: ${filters.q.trim()}`, remover: () => onSearch('') });
  if (filters.prio !== 'all') chips.push({ key: 'prio', label: `Prioridade: ${PRIORITY_LABELS[filters.prio]}`, remover: () => onPrio('all') });
  if (filters.contact !== null) chips.push({ key: 'contact', label: `Contato: ${rotuloContato(filters.contact, contatoAtual)}`, remover: () => onContact(null) });
  if (filters.alarm) chips.push({ key: 'alarm', label: 'Com alarme', remover: onToggleAlarm });
  if (!filters.done) chips.push({ key: 'done', label: 'Concluídas ocultas', remover: onToggleDone });
  if (statusAtual !== 'all') chips.push({ key: 'status', label: `Estado: ${rotuloEstado(statusAtual)}`, remover: () => onStatus('all') });
  if (dueAtual !== 'all') chips.push({ key: 'due', label: `Prazo: ${PRAZO_LABELS[dueAtual]}`, remover: () => onDue('all') });

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div data-testid="tasks-filter-bar" className="flex items-center gap-2 flex-wrap">
        {/* Etapa 033: lupa, botão de limpar e largura flexível */}
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={campoBusca}
            type="search"
            value={searchText}
            onChange={e => onSearch(e.target.value)}
            placeholder="Buscar tarefa…"
            aria-label="Buscar tarefa"
            className="h-11 rounded-xl bg-input border-border pl-9 pr-9 text-[15px]"
          />
          {searchText !== '' && (
            <button
              type="button"
              aria-label="Limpar busca"
              data-testid="tasks-search-clear"
              onClick={() => onSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Etapa 034: Prioridade (o chevron é do próprio Select) */}
        <Select value={filters.prio} onValueChange={v => onPrio(v as Priority | 'all')}>
          <SelectTrigger aria-label="Prioridade" className="h-11 w-[150px] rounded-xl">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">
                {filters.prio === 'all' ? 'Prioridade' : PRIORITY_LABELS[filters.prio]}
              </span>
              {filters.prio !== 'all' && <Contador testId="prio-count">1</Contador>}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as prioridades</SelectItem>
            {(['urgent', 'high', 'medium', 'low'] as Priority[]).map(p => (
              <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Etapa 035: Contato pelo combobox com busca interna + "Sem contato" */}
        <div className="flex items-center gap-1">
          <ContactCombobox
            value={filters.contact}
            onChange={onContact}
            // O gatilho do combobox não repete o valor escolhido (incoerência 7,
            // rótulo curto com contador); quem nomeia o recorte é o chip abaixo.
            // O lookup por id fica desligado (`selectedContact` nunca é null com
            // contato escolhido): não queremos query nova nem id cru na tela.
            selectedContact={
              filters.contact === null
                ? undefined
                : { id: filters.contact, name: rotuloContato(filters.contact, contatoAtual) }
            }
            placeholder="Contato"
            testId="tasks-contact-filter"
            extraOptions={[
              { value: 'todos', label: 'Todos os contatos', selected: filters.contact === null, onSelect: () => onContact(null) },
              { value: 'sem', label: 'Sem contato', selected: filters.contact === SEM_CONTATO, onSelect: () => onContact(SEM_CONTATO) },
            ]}
          />
          {filters.contact !== null && <Contador testId="contact-count">1</Contador>}
        </div>

        {/* Etapa 036: popover com estado, lembrete, prazo e concluídas */}
        <Popover open={filtrosAberto} onOpenChange={setFiltrosAberto}>
          <PopoverTrigger asChild>
            <Button variant="outline" aria-label="Filtros" className="h-11 gap-1.5 rounded-xl">
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {ativosNoPopover > 0 && <Contador testId="filters-badge">{ativosNoPopover}</Contador>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3 p-3" data-testid="tasks-filters-popover">
            <div className="space-y-1">
              <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Estado</span>
              <Select value={statusAtual} onValueChange={v => onStatus(v as WorkItemStatus | 'all')}>
                <SelectTrigger aria-label="Estado" className="h-9 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os estados</SelectItem>
                  {KANBAN_COLUMNS.map(c => (
                    <SelectItem key={c.status} value={c.status}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Prazo</span>
              <Select value={dueAtual} onValueChange={v => onDue(v as DueFilter)}>
                <SelectTrigger aria-label="Prazo" className="h-9 rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRAZO_LABELS) as DueFilter[]).map(d => (
                    <SelectItem key={d} value={d}>{PRAZO_LABELS[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center justify-between gap-2 text-sm">
              <span>Com alarme</span>
              <Switch checked={filters.alarm} onCheckedChange={onToggleAlarm} aria-label="Com alarme" />
            </label>

            {/* Etapa 038: mesmo estado, rótulo do plano por modo */}
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>{rotuloConcluidas}</span>
              <Switch checked={filters.done} onCheckedChange={onToggleDone} aria-label={rotuloConcluidas} />
            </label>
          </PopoverContent>
        </Popover>
      </div>

      {/* Etapa 039: chips removíveis abaixo da barra + "Limpar filtros" */}
      {isActive && (
        <div data-testid="tasks-filter-chips" className="flex items-center gap-2 flex-wrap">
          {chips.map(c => (
            <span key={c.key} data-testid="filter-chip" className="chip-active pr-1">
              <span className="max-w-[180px] truncate">{c.label}</span>
              <button
                type="button"
                aria-label={`Remover filtro: ${c.label}`}
                data-testid={`filter-chip-remove-${c.key}`}
                onClick={c.remover}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 rounded-lg px-2 text-xs text-muted-foreground"
          >
            Limpar filtros
          </Button>
        </div>
      )}
    </div>
  );
}
