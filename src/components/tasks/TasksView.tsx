import { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Clock, CheckCircle2, CalendarClock, CalendarCheck, Search, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/auth/useAuth';
import { useUserRole } from '@/hooks/system/useUserRole';
import { useMyTasks } from '@/hooks/tasks/useMyTasks';
import { useTeamProfiles } from '@/hooks/crm/useTeamProfiles';
import { ContactService } from '@/services/contact.service';
import { KpiStrip } from '@/components/inbox/tabs/KpiStrip';
import { TaskColumn } from '@/components/inbox/tabs/TaskColumn';
import { TaskCard } from '@/components/inbox/tabs/TaskCard';
import type { ConversationTask } from '@/hooks/chat/useConversationTasks';

interface ContactOption { id: string; name: string; phone: string | null; }

/**
 * Tela "Tarefas" (menu principal) — as mesmas 3 colunas da aba de tarefas da
 * conversa (TasksTab), cruzando todos os contatos do usuário. RLS já faz o
 * recorte: agent/special_agent vê só as dele; admin/supervisor, a da equipe.
 */
export function TasksView() {
  const { profile } = useAuth();
  const { isAdmin, isSupervisor } = useUserRole();
  const isStaff = isAdmin || isSupervisor;
  const { overdue, today, upcoming, completed7d, toggleTask, deleteTask, createTask, isCreating, isLoading } = useMyTasks();
  const { data: teamProfiles = [] } = useTeamProfiles(isStaff);

  const [search, setSearch] = useState('');
  const [showNewTask, setShowNewTask] = useState(false);

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of teamProfiles as Array<{ id: string; name: string }>) map.set(p.id, p.name);
    if (profile?.id && profile.name) map.set(profile.id, profile.name);
    return map;
  }, [teamProfiles, profile]);

  const bySearch = (list: ConversationTask[]) =>
    search.trim() ? list.filter((t) => t.title.toLowerCase().includes(search.trim().toLowerCase())) : list;

  const hoje = bySearch([...overdue, ...today]);
  const proximas = bySearch(upcoming);
  const concluidas = bySearch(completed7d);

  const contactNameFor = (t: ConversationTask) => {
    const withContact = t as ConversationTask & { contact?: { name: string } | null };
    return withContact.contact?.name;
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Tarefas"
        subtitle={isStaff ? 'Tarefas da equipe, cruzando todos os contatos' : 'Suas tarefas, cruzando todos os seus contatos'}
        actions={<Button onClick={() => setShowNewTask(true)} className="gap-2"><Plus className="w-4 h-4" /> Nova tarefa</Button>}
      />

      <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <KpiStrip
            className="flex-1"
            cells={[
              { icon: AlertCircle, label: 'Atrasadas', value: overdue.length, tone: 'red', sublabel: 'Requer atenção' },
              { icon: Clock, label: 'Para hoje', value: today.length, tone: 'yellow', sublabel: 'Vencem hoje' },
              { icon: CheckCircle2, label: 'Concluídas', value: completed7d.length, tone: 'green', sublabel: 'Últimos 7 dias' },
            ]}
          />
          <div className="relative shrink-0 w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por título..." className="pl-9 h-[34px]" />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">Carregando tarefas...</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <TaskColumn icon={Clock} title="Hoje" count={hoje.length} subtitle="Atrasadas + vencem hoje" emptyLabel="Nenhuma tarefa para hoje">
              {hoje.map((t) => (
                <TaskCard key={t.id} task={t} assigneeName={t.assigned_to ? profileNameById.get(t.assigned_to) : undefined} contactName={contactNameFor(t)} onToggle={toggleTask} onDelete={deleteTask} />
              ))}
            </TaskColumn>
            <TaskColumn icon={CalendarClock} title="Próximas" count={proximas.length} subtitle="Sem prazo vencido" emptyLabel="Nenhuma tarefa futura">
              {proximas.map((t) => (
                <TaskCard key={t.id} task={t} assigneeName={t.assigned_to ? profileNameById.get(t.assigned_to) : undefined} contactName={contactNameFor(t)} onToggle={toggleTask} onDelete={deleteTask} />
              ))}
            </TaskColumn>
            <TaskColumn icon={CalendarCheck} title="Concluídas recentes" count={concluidas.length} subtitle="Últimos 7 dias" emptyLabel="Nenhuma tarefa concluída nos últimos 7 dias">
              {concluidas.map((t) => (
                <TaskCard key={t.id} task={t} assigneeName={t.assigned_to ? profileNameById.get(t.assigned_to) : undefined} contactName={contactNameFor(t)} onToggle={toggleTask} onDelete={deleteTask} />
              ))}
            </TaskColumn>
          </div>
        )}
      </div>

      <NewTaskDialog
        open={showNewTask}
        onOpenChange={setShowNewTask}
        isStaff={isStaff}
        myProfileId={profile?.id ?? ''}
        teamProfiles={teamProfiles as Array<{ id: string; name: string }>}
        onCreate={async (input) => { await createTask(input); setShowNewTask(false); }}
        isCreating={isCreating}
      />
    </div>
  );
}

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isStaff: boolean;
  myProfileId: string;
  teamProfiles: Array<{ id: string; name: string }>;
  onCreate: (input: { title: string; contactId?: string | null; priority?: string; dueDate?: string | null; assignedTo?: string | null; createdBy?: string | null; description?: string | null }) => Promise<void>;
  isCreating: boolean;
}

/** Diálogo de criação — contato opcional: sem contato vira tarefa pessoal (policy de INSERT aceita contact_id nulo quando created_by é o próprio usuário). */
function NewTaskDialog({ open, onOpenChange, isStaff, myProfileId, teamProfiles, onCreate, isCreating }: NewTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [noContact, setNoContact] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reset dos campos no fechamento — dentro do handler de onOpenChange, nunca
  // num useEffect (setState síncrono em efeito dispara render em cascata).
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setTitle(''); setDescription(''); setPriority('medium'); setDueDate('');
      setAssignedTo(isStaff ? '' : myProfileId);
      setContactQuery(''); setDebouncedQuery(''); setSelectedContact(null); setNoContact(false);
    }
    onOpenChange(next);
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(contactQuery), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [contactQuery]);

  const { data: contactResults = [], isFetching: searchingContacts } = useQuery({
    queryKey: ['tasks-new-contact-search', debouncedQuery],
    queryFn: async (): Promise<ContactOption[]> => {
      const { data, error } = await ContactService.searchContacts({ search_term: debouncedQuery, page_size: 8 });
      if (error) throw error;
      return (data || []).map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
    },
    enabled: open && debouncedQuery.trim().length >= 2,
  });

  const submit = async () => {
    if (!title.trim() || (!selectedContact && !noContact)) return;
    await onCreate({
      title: title.trim(),
      contactId: noContact ? null : selectedContact?.id,
      priority,
      dueDate: dueDate || null,
      assignedTo: assignedTo || myProfileId,
      createdBy: myProfileId,
      description: description.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Label>Título *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="O que precisa ser feito" /></div>

          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <Label>{noContact ? 'Contato' : 'Contato *'}</Label>
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setNoContact(!noContact); setSelectedContact(null); setContactQuery(''); }}>
                {noContact ? 'Vincular a um contato' : 'Tarefa pessoal, sem contato'}
              </button>
            </div>
            {noContact ? null : selectedContact ? (
              <div className="h-9 rounded-md border border-border bg-muted/40 px-3 flex items-center justify-between text-sm">
                <span className="truncate">{selectedContact.name}{selectedContact.phone ? ` · ${selectedContact.phone}` : ''}</span>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground shrink-0 ml-2" onClick={() => setSelectedContact(null)}>Trocar</button>
              </div>
            ) : (
              <div className="relative">
                <Input value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} placeholder="Buscar contato (min. 2 letras)..." className="h-9" />
                {debouncedQuery.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-48 overflow-y-auto">
                    {searchingContacts && <div className="px-3 py-2 text-xs text-muted-foreground">Buscando...</div>}
                    {!searchingContacts && contactResults.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum contato encontrado</div>}
                    {contactResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60"
                        onClick={() => { setSelectedContact(c); setContactQuery(''); }}
                      >
                        {c.name}{c.phone ? <span className="text-muted-foreground text-xs ml-1">{c.phone}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div><Label>Prioridade</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="high">Alta</SelectItem></SelectContent></Select></div>
          <div><Label>Prazo</Label><Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>

          <div className="col-span-2">
            <Label>Responsável</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo} disabled={!isStaff}>
              <SelectTrigger><SelectValue placeholder="Você" /></SelectTrigger>
              <SelectContent>
                {isStaff && teamProfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2"><Label>Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!title.trim() || (!selectedContact && !noContact) || isCreating}>{isCreating ? 'Criando...' : 'Criar tarefa'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
