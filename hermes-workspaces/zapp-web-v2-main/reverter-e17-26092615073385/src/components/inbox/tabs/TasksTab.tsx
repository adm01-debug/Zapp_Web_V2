import { useMemo, useState } from 'react';
import { AlertCircle, Clock, CheckCircle2, ListTodo, CalendarClock, CalendarCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/auth/useAuth';
import { useConversationTasks } from '@/hooks/chat/useConversationTasks';
import { useTeamProfiles } from '@/hooks/crm/useTeamProfiles';
import { KpiStrip } from './KpiStrip';
import { TaskCard } from './TaskCard';
import { TaskColumn } from './TaskColumn';

type AssignFilter = 'all' | 'mine' | 'others';

interface TasksTabProps {
  contactId: string;
}

/** Aba Tarefas (2.9) — banner + KPIs + 3 colunas (Hoje/Próximas/Concluídas recentes). */
export function TasksTab({ contactId }: TasksTabProps) {
  const { profile } = useAuth();
  const { overdue, today, upcoming, completed7d, toggleTask, deleteTask, createTask } = useConversationTasks(contactId);
  const { data: teamProfiles = [] } = useTeamProfiles();
  const [filter, setFilter] = useState<AssignFilter>('all');
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of teamProfiles as Array<{ id: string; name: string }>) map.set(p.id, p.name);
    return map;
  }, [teamProfiles]);

  const byFilter = <T extends { assigned_to: string | null }>(list: T[]) =>
    filter === 'all' ? list
      : filter === 'mine' ? list.filter((t) => t.assigned_to === profile?.id)
        : list.filter((t) => t.assigned_to && t.assigned_to !== profile?.id);

  const hoje = byFilter([...overdue, ...today]);
  const proximas = byFilter(upcoming);
  const concluidas = byFilter(completed7d);

  const todayLabel = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR });

  const submitNewTask = () => {
    if (!title.trim()) return;
    createTask({ title: title.trim(), createdBy: profile?.id, assignedTo: profile?.id });
    setTitle('');
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-4" data-testid="tasks-tab">
      <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 flex items-center gap-3">
        <span className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center shrink-0"><ListTodo className="w-5 h-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">Tarefas desta conversa</p>
          <p className="text-[13px] text-muted-foreground truncate">Organize e acompanhe todas as ações relacionadas a este cliente.</p>
        </div>
        <button type="button" className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shrink-0" onClick={() => setAdding(true)}>
          + Nova tarefa
        </button>
      </div>

      {adding && (
        <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da tarefa..."
            className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm"
            onKeyDown={(e) => { if (e.key === 'Enter') submitNewTask(); if (e.key === 'Escape') setAdding(false); }}
          />
          <button type="button" className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50" disabled={!title.trim()} onClick={submitNewTask}>
            Salvar
          </button>
          <button type="button" className="h-9 px-3 rounded-lg text-xs text-muted-foreground" onClick={() => setAdding(false)}>
            Cancelar
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <KpiStrip
          className="flex-1"
          cells={[
            { icon: AlertCircle, label: 'Atrasadas', value: overdue.length, tone: 'red', sublabel: 'Requer atenção' },
            { icon: Clock, label: 'Para hoje', value: today.length, tone: 'yellow', sublabel: 'Vencem hoje' },
            { icon: CheckCircle2, label: 'Concluídas', value: completed7d.length, tone: 'green', sublabel: 'Últimos 7 dias' },
          ]}
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as AssignFilter)}>
          <SelectTrigger className="h-9 w-[220px] shrink-0 bg-input border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tarefas</SelectItem>
            <SelectItem value="mine">Minhas</SelectItem>
            <SelectItem value="others">Atribuídas a outros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <TaskColumn icon={Clock} title="Hoje" count={hoje.length} subtitle={todayLabel} emptyLabel="Nenhuma tarefa para hoje">
          {hoje.map((t) => <TaskCard key={t.id} task={t} assigneeName={t.assigned_to ? profileNameById.get(t.assigned_to) : undefined} onToggle={toggleTask} onDelete={deleteTask} />)}
        </TaskColumn>

        <TaskColumn icon={CalendarClock} title="Próximas" count={proximas.length} subtitle="Esta semana" emptyLabel="Nenhuma tarefa futura">
          {proximas.map((t) => <TaskCard key={t.id} task={t} assigneeName={t.assigned_to ? profileNameById.get(t.assigned_to) : undefined} onToggle={toggleTask} onDelete={deleteTask} />)}
        </TaskColumn>

        <TaskColumn icon={CalendarCheck} title="Concluídas recentes" count={concluidas.length} subtitle="Últimos 7 dias" emptyLabel="Nenhuma tarefa concluída nos últimos 7 dias">
          {concluidas.map((t) => <TaskCard key={t.id} task={t} assigneeName={t.assigned_to ? profileNameById.get(t.assigned_to) : undefined} onToggle={toggleTask} onDelete={deleteTask} />)}
        </TaskColumn>
      </div>
    </div>
  );
}
