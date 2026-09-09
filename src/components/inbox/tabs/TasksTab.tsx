import { useMemo, useState } from 'react';
import { AlertCircle, Clock, CheckCircle2, ListTodo } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/auth/useAuth';
import { useConversationTasks } from '@/hooks/chat/useConversationTasks';
import { useTeamProfiles } from '@/hooks/crm/useTeamProfiles';
import { KpiStrip } from './KpiStrip';
import { TaskColumn } from './TaskColumn';

type AssignFilter = 'all' | 'mine' | 'others';

interface TasksTabProps {
  contactId: string;
}

/** Aba Tarefas (2.9) — banner + KPIs + 3 colunas (Hoje/Próximas/Concluídas recentes). */
export function TasksTab({ contactId }: TasksTabProps) {
  const { profile } = useAuth();
  const { overdue, today, upcoming, completed7d, toggleTask, deleteTask, createTask, isCreating, isLoading } = useConversationTasks(contactId);
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

  const closeComposer = () => {
    setTitle('');
    setAdding(false);
  };

  const submitNewTask = async () => {
    if (!title.trim()) return;
    try {
      await createTask({ title: title.trim(), createdBy: profile?.id, assignedTo: profile?.id });
      closeComposer();
    } catch {
      // O hook apresenta o erro; manter o formulário aberto preserva o texto para nova tentativa.
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="tasks-tab">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4">
        <span className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center shrink-0"><ListTodo className="w-5 h-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground">Tarefas desta conversa</p>
          <p className="text-[13px] text-muted-foreground">Organize e acompanhe todas as ações relacionadas a este cliente.</p>
        </div>
        <button type="button" className="h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => setAdding(true)}>
          + Nova tarefa
        </button>
      </div>

      {adding && (
        <form className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3" onSubmit={(event) => { event.preventDefault(); void submitNewTask(); }}>
          <label htmlFor="conversation-task-title" className="sr-only">Título da nova tarefa</label>
          <input
            id="conversation-task-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da tarefa..."
            className="h-10 min-w-[12rem] flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); closeComposer(); } }}
          />
          <button type="submit" className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold outline-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring" disabled={!title.trim() || isCreating}>
            Salvar
          </button>
          <button type="button" className="h-10 px-3 rounded-lg text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" onClick={closeComposer}>
            Cancelar
          </button>
        </form>
      )}

      {isLoading ? (
        <div role="status" aria-live="polite" className="grid min-h-40 place-items-center rounded-xl border border-border bg-card/40">
          <span className="text-sm text-muted-foreground">Carregando tarefas…</span>
        </div>
      ) : (
      <>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
        <KpiStrip
          cells={[
            { icon: AlertCircle, label: 'Atrasadas', value: overdue.length, iconClassName: 'bg-destructive/15 text-destructive' },
            { icon: Clock, label: 'Para hoje', value: today.length, iconClassName: 'bg-warning/15 text-warning' },
            { icon: CheckCircle2, label: 'Concluídas', value: completed7d.length, iconClassName: 'bg-success/15 text-success' },
          ]}
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as AssignFilter)}>
          <SelectTrigger className="h-10 w-full" aria-label="Filtrar tarefas por responsável"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tarefas</SelectItem>
            <SelectItem value="mine">Minhas</SelectItem>
            <SelectItem value="others">Atribuídas a outros</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div data-testid="task-columns" className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
        <TaskColumn title="Hoje" subtitle={todayLabel} tasks={hoje} emptyText="Nenhuma tarefa para hoje" profileNameById={profileNameById} onToggle={toggleTask} onDelete={deleteTask} />
        <TaskColumn title="Próximas" tasks={proximas} emptyText="Nenhuma tarefa futura" profileNameById={profileNameById} onToggle={toggleTask} onDelete={deleteTask} />
        <TaskColumn title="Concluídas recentes" tasks={concluidas} emptyText="Nenhuma tarefa concluída nos últimos 7 dias" profileNameById={profileNameById} onToggle={toggleTask} onDelete={deleteTask} />
      </div>
      </>
      )}
    </div>
  );
}
