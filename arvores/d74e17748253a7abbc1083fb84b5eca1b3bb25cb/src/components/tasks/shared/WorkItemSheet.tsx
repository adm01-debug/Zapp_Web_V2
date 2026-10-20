import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BellRing, CalendarIcon, CheckCircle2, ChevronDown, PauseCircle, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Calendar } from '@/components/ui/calendar';
import { KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';
import { useNarrowViewport } from './pointerMedia';
import type { Priority, WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput } from '@/hooks/tasks/useMyWorkItems';

/** Abaixo de `md` o Sheet desce para a base (etapa 23) — mesmo corte do quadro. */
const PRIORIDADES: Priority[] = ['low', 'medium', 'high', 'urgent'];

/** `yyyy-MM-dd` de um ISO, sem sofrer com fuso. */
function diaLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function horaLocal(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Sem hora escolhida, o prazo vale o dia inteiro (convenção do módulo). */
function compor(dia: string | null, hora: string): string | null {
  if (!dia) return null;
  return `${dia}T${hora || '23:59'}:00`;
}

/**
 * Etapa 65: espelha o cálculo de `snooze` do hook só para o Sheet refletir o
 * novo alarme na hora (a prop `item` não é reconstruída após adiar).
 */
function quandoAdiar(minutes: number | 'tomorrow9'): Date {
  if (minutes === 'tomorrow9') {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }
  return new Date(Date.now() + Math.max(1, minutes) * 60_000);
}

interface SheetProps {
  item: WorkItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Salva os campos que não são estado nem alarme. */
  onSave: (item: WorkItem, patch: Partial<WorkItemInput>) => void;
  onMove: (item: WorkItem, to: WorkItemStatus, waitingReason?: string) => void;
  onSnooze: (item: WorkItem, minutes: number | 'tomorrow9') => void;
  onSetReminder: (item: WorkItem, iso: string | null) => void;
  onCancel: (item: WorkItem) => void;
  contactOptions: Array<{ id: string; name: string }>;
  doingCount: number;
  /** Etapa 28 (B2): o DnD/kebab abre o Sheet já pedindo o motivo.
   *  Etapa 31: "Lembrar-me → Escolher…" abre no campo alarme. */
  focusField?: 'waiting_reason' | 'remind_at';
}

export function WorkItemSheet(props: SheetProps) {
  const { item, open, onOpenChange, focusField } = props;
  const narrow = useNarrowViewport();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={narrow ? 'bottom' : 'right'}
        data-testid="work-item-sheet"
        className={narrow ? 'h-[90vh] overflow-y-auto' : 'w-[420px] sm:max-w-[420px] overflow-y-auto'}
        onEscapeKeyDown={() => onOpenChange(false)}
      >
        {item && (
          <Formulario
            key={item.id + (focusField ?? '')}
            {...props}
            item={item}
            onOpenChange={onOpenChange}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

type FormProps = Omit<SheetProps, 'item' | 'open'> & { item: WorkItem };

function Formulario({
  item,
  onOpenChange,
  onSave,
  onMove,
  onSnooze,
  onSetReminder,
  onCancel,
  contactOptions,
  doingCount,
  focusField,
}: FormProps) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  const [prioridade, setPrioridade] = useState<Priority>(item.priority);
  const [contactId, setContactId] = useState<string>(item.contact_id ?? '');
  // Etapa 28 (B2): quem abre o Sheet pelo portão do Aguardando (DnD/kebab) já
  // entra com o estado em "Aguardando", para o campo de motivo aparecer pedido.
  const [status, setStatus] = useState<WorkItemStatus>(
    focusField === 'waiting_reason' ? 'waiting' : item.status
  );
  const [motivo, setMotivo] = useState(item.waiting_reason ?? '');
  const [dia, setDia] = useState<string | null>(item.due_date ? diaLocal(item.due_date) : null);
  const [hora, setHora] = useState(item.due_date ? horaLocal(item.due_date) : '');
  const [alarmeDia, setAlarmeDia] = useState<string | null>(
    item.remind_at ? diaLocal(item.remind_at) : null
  );
  const [alarmeHora, setAlarmeHora] = useState(item.remind_at ? horaLocal(item.remind_at) : '09:00');
  // Etapa 65: o "Avisado em" some quando o "Adiar" rearma o alarme — `snooze`
  // zera `notified_at` no banco, mas a prop `item` não é reconstruída no Sheet.
  const [avisadoEm, setAvisadoEm] = useState<string | null>(item.notified_at);
  const [mostraDescricao, setMostraDescricao] = useState(Boolean(item.description));
  const [erro, setErro] = useState<string | null>(null);

  const doingCheio = doingCount >= 3 && item.status !== 'doing';
  const motivoObrigatorio = status === 'waiting';

  const mudou = useMemo(() => {
    const due = compor(dia, hora);
    const remind = compor(alarmeDia, alarmeHora);
    return (
      title !== item.title ||
      (description || null) !== (item.description ?? null) ||
      prioridade !== item.priority ||
      (contactId || null) !== item.contact_id ||
      status !== item.status ||
      (motivo || null) !== (item.waiting_reason ?? null) ||
      due !== (item.due_date ?? null) ||
      remind !== (item.remind_at ?? null)
    );
  }, [
    title, description, prioridade, contactId, status, motivo,
    dia, hora, alarmeDia, alarmeHora, item,
  ]);

  /** Etapa 65: adia e reflete o novo alarme no Sheet. */
  function adiar(minutes: number | 'tomorrow9') {
    onSnooze(item, minutes);
    const quando = quandoAdiar(minutes);
    setAlarmeDia(diaLocal(quando.toISOString()));
    setAlarmeHora(horaLocal(quando.toISOString()));
    setAvisadoEm(null);
  }

  function salvar() {
    if (motivoObrigatorio && !motivo.trim()) {
      setErro('Diga por que parou');
      return;
    }
    setErro(null);

    const due = compor(dia, hora);
    const remind = compor(alarmeDia, alarmeHora);

    // Estado é do `move` (máquina de estados); o resto vai por patch (etapa 25).
    if (status !== item.status) {
      onMove(item, status, motivoObrigatorio ? motivo.trim() : undefined);
    }
    const patch: Partial<WorkItemInput> = {};
    if (title !== item.title) patch.title = title;
    if ((description || null) !== (item.description ?? null)) patch.description = description || null;
    if (prioridade !== item.priority) patch.priority = prioridade;
    if ((contactId || null) !== item.contact_id) patch.contactId = contactId || null;
    if (motivoObrigatorio && (motivo || null) !== (item.waiting_reason ?? null)) patch.waitingReason = motivo.trim();
    if (due !== (item.due_date ?? null)) patch.dueDate = due;
    if (remind !== (item.remind_at ?? null)) patch.remindAt = remind;
    if (Object.keys(patch).length > 0) onSave(item, patch);

    onOpenChange(false);
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <SheetHeader>
        <SheetTitle>Editar tarefa</SheetTitle>
      </SheetHeader>

      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="sheet-titulo">Título</Label>
          <Input
            id="sheet-titulo"
            data-testid="sheet-titulo"
            autoFocus={focusField !== 'remind_at'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1.5 bg-input/40 border-border/70"
          />
        </div>

        <div>
          <Label>Estado</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as WorkItemStatus)}>
            <SelectTrigger data-testid="sheet-estado" className="mt-1.5 bg-input/40 border-border/70">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KANBAN_COLUMNS.map((c) => {
                const bloqueado = c.status === 'doing' && doingCheio;
                return (
                  <SelectItem key={c.status} value={c.status} disabled={bloqueado}>
                    {bloqueado ? `${c.label} está cheio (${doingCount}/3)` : c.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {motivoObrigatorio && (
          <div>
            <Label htmlFor="sheet-motivo">Motivo de espera</Label>
            <Textarea
              id="sheet-motivo"
              data-testid="sheet-motivo"
              autoFocus={focusField === 'waiting_reason'}
              value={motivo}
              onChange={(e) => { setMotivo(e.target.value); setErro(null); }}
              placeholder="Por que parou? Ex.: aguardando aprovação do cliente"
              className="mt-1.5 bg-input/40 border-border/70"
            />
            {erro && <p data-testid="sheet-motivo-erro" className="mt-1 text-2xs text-destructive">{erro}</p>}
          </div>
        )}

        <div>
          <Label>Prioridade</Label>
          <div className="mt-1.5 flex gap-1.5">
            {PRIORIDADES.map((p) => (
              <button
                key={p}
                type="button"
                data-testid={`sheet-prio-${p}`}
                aria-pressed={prioridade === p}
                onClick={() => setPrioridade(p)}
                className={`h-7 px-2.5 rounded-full border text-2xs font-medium transition-colors ${
                  prioridade === p
                    ? 'bg-primary/15 border-primary/50 text-primary-glow'
                    : 'bg-input/40 border-border/70 text-muted-foreground hover:text-foreground'
                }`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Contato</Label>
          <Select
            value={contactId || 'sem'}
            onValueChange={(v) => setContactId(v === 'sem' ? '' : v)}
          >
            <SelectTrigger data-testid="sheet-contato" className="mt-1.5 bg-input/40 border-border/70">
              <SelectValue placeholder="Sem contato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sem">Sem contato</SelectItem>
              {contactOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name || 'Sem nome'}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Prazo</Label>
          <div className="mt-1.5 flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  data-testid="sheet-prazo"
                  className="flex-1 justify-start bg-input/40 border-border/70 font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dia ? format(new Date(`${dia}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR }) : 'Sem prazo'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={dia ? new Date(`${dia}T12:00:00`) : undefined}
                  onSelect={(d) => setDia(d ? diaLocal(d.toISOString()) : null)}
                />
                <div className="flex items-center gap-2 border-t border-border/50 p-2">
                  <Input
                    type="time"
                    data-testid="sheet-prazo-hora"
                    value={hora}
                    onChange={(e) => setHora(e.target.value)}
                    className="h-8 bg-input/40"
                  />
                  <Button variant="ghost" size="sm" onClick={() => { setDia(null); setHora(''); }}>
                    Limpar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div>
          <Label>Alarme</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  data-testid="sheet-alarme"
                  autoFocus={focusField === 'remind_at'}
                  className="flex-1 justify-start bg-input/40 border-border/70 font-normal"
                >
                  {avisadoEm && alarmeDia
                    ? <BellRing className="mr-2 h-4 w-4 text-destructive" />
                    : <CalendarIcon className="mr-2 h-4 w-4" />}
                  {alarmeDia
                    ? `${format(new Date(`${alarmeDia}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR })} ${alarmeHora}`
                    : 'Sem alarme'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={alarmeDia ? new Date(`${alarmeDia}T12:00:00`) : undefined}
                  onSelect={(d) => setAlarmeDia(d ? diaLocal(d.toISOString()) : null)}
                />
                <div className="flex items-center gap-2 border-t border-border/50 p-2">
                  <Input
                    type="time"
                    data-testid="sheet-alarme-hora"
                    value={alarmeHora}
                    onChange={(e) => setAlarmeHora(e.target.value)}
                    className="h-8 bg-input/40"
                  />
                  <Button variant="ghost" size="sm" onClick={() => setAlarmeDia(null)}>Limpar</Button>
                </div>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="sheet-adiar" className="shrink-0 gap-1">
                  Adiar <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-testid="sheet-adiar-15" onClick={() => adiar(15)}>15 min</DropdownMenuItem>
                <DropdownMenuItem data-testid="sheet-adiar-60" onClick={() => adiar(60)}>1 hora</DropdownMenuItem>
                <DropdownMenuItem data-testid="sheet-adiar-amanha" onClick={() => adiar('tomorrow9')}>Amanhã 9h</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {avisadoEm && (
            <p data-testid="sheet-avisado" className="mt-1 text-2xs text-muted-foreground">
              Avisado em {format(new Date(avisadoEm), 'dd/MM HH:mm', { locale: ptBR })}
            </p>
          )}
          {alarmeDia && (
            <button
              type="button"
              data-testid="sheet-remover-alarme"
              onClick={() => { setAlarmeDia(null); setAvisadoEm(null); onSetReminder(item, null); }}
              className="mt-1 text-2xs text-muted-foreground hover:text-destructive"
            >
              Remover alarme
            </button>
          )}
        </div>

        <div>
          <button
            type="button"
            data-testid="sheet-toggle-descricao"
            onClick={() => setMostraDescricao((v) => !v)}
            className="text-2xs text-muted-foreground hover:text-foreground"
          >
            {mostraDescricao ? '− Descrição' : '+ Descrição'}
          </button>
          {mostraDescricao && (
            <Textarea
              data-testid="sheet-descricao"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5 bg-input/40 border-border/70"
              rows={3}
            />
          )}
        </div>
      </div>

      <SheetFooter className="mt-auto flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="ghost"
          data-testid="sheet-concluir"
          onClick={() => { onMove(item, 'done'); onOpenChange(false); }}
          className="bg-success/15 text-success hover:bg-success/25"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" /> Concluir
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="sheet-cancelar"
          onClick={() => { onCancel(item); onOpenChange(false); }}
          className="text-destructive hover:bg-destructive/10"
        >
          <X className="mr-2 h-4 w-4" /> Cancelar tarefa
        </Button>
        <Button
          type="button"
          data-testid="sheet-salvar"
          disabled={!mudou}
          onClick={salvar}
          className="sm:ml-auto bg-primary"
          title="Ctrl+Enter salva"
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') salvar(); }}
        >
          Salvar
        </Button>
      </SheetFooter>

      {motivoObrigatorio && (
        <p className="flex items-center gap-1 text-2xs text-muted-foreground">
          <PauseCircle className="h-3 w-3" /> Tarefa em Aguardando exige o motivo.
        </p>
      )}
    </div>
  );
}
