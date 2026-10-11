import { useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowUpRight, BellRing, CalendarIcon, CheckCircle2, ChevronDown, Maximize2, Minimize2, PauseCircle, X } from 'lucide-react';
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
import { StatusPill } from './StatusPill';
import { PriorityPill } from './PriorityPill';
import { ContactAvatar } from './ContactAvatar';
import { openContactChat } from '@/components/catalog/useSendProduct';
import { useNarrowViewport } from './pointerMedia';
import { comporLocal, diaLocal, horaLocal, mesmoInstante } from './localDateTime';
import { aceitaLembrete, MOTIVO_SEM_LEMBRETE } from './cardActions';
import type { Priority, WorkItem, WorkItemStatus } from '@/hooks/tasks/workItem.types';
import type { WorkItemInput } from '@/hooks/tasks/useMyWorkItems';

/** Abaixo de `md` o Sheet desce para a base (etapa 23) — mesmo corte do quadro. */
const PRIORIDADES: Priority[] = ['low', 'medium', 'high', 'urgent'];

/**
 * Etapa 134: o "ícone colorido" dos selects é um ponto com os MESMOS tokens das
 * pílulas (`StatusPill`/`PriorityPill`, D12) — nenhuma cor literal nova.
 */
const PONTO_ESTADO: Record<WorkItemStatus, string> = {
  backlog:   'bg-muted-foreground',
  todo:      'bg-primary',
  doing:     'bg-primary',
  waiting:   'bg-warning',
  done:      'bg-success',
  cancelled: 'bg-muted-foreground',
};

const PONTO_PRIORIDADE: Record<Priority, string> = {
  low:    'bg-muted-foreground',
  medium: 'bg-primary',
  high:   'bg-warning',
  urgent: 'bg-destructive',
};

/** Sem hora escolhida, o prazo vale o dia inteiro (convenção do módulo). */
function compor(dia: string | null, hora: string): string | null {
  return dia ? comporLocal(dia, hora) : null;
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
  /** Salva os campos que não são estado nem alarme.
   *  R2-MOD-051: devolve a promessa da gravação — o Sheet só fecha quando ela
   *  conclui, e uma falha mantém o formulário aberto com o que foi digitado. */
  onSave: (item: WorkItem, patch: Partial<WorkItemInput>) => void | Promise<void>;
  /** Muda o estado (a máquina de estados valida o destino e o motivo).
   *  R2-MOD-051: idem — a promessa é aguardada antes do patch e do fechamento. */
  onMove: (item: WorkItem, to: WorkItemStatus, waitingReason?: string) => void | Promise<void>;
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
  // Etapa 132: "expandir" do cabeçalho alarga o painel no desktop. Persistir a
  // escolha é da etapa 146 (outro cartão) — aqui é só o controle.
  const [expandido, setExpandido] = useState(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={narrow ? 'bottom' : 'right'}
        data-testid="work-item-sheet"
        className={
          narrow
            ? 'h-[90vh] overflow-y-auto'
            : `overflow-y-auto ${expandido ? 'w-[min(720px,90vw)] sm:max-w-[720px]' : 'w-[420px] sm:max-w-[420px]'}`
        }
        onEscapeKeyDown={() => onOpenChange(false)}
      >
        {item && (
          <Formulario
            key={item.id + (focusField ?? '')}
            {...props}
            item={item}
            onOpenChange={onOpenChange}
            expandido={expandido}
            onAlternarExpansao={() => setExpandido((v) => !v)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

type FormProps = Omit<SheetProps, 'item' | 'open'> & {
  item: WorkItem;
  expandido: boolean;
  onAlternarExpansao: () => void;
};

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
  expandido,
  onAlternarExpansao,
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
  // R2-MOD-051: o Salvar espera a escrita terminar. Enquanto isso o botão fica
  // travado (state) e o guarda síncrono (ref) fecha a porta de um duplo envio.
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const salvandoRef = useRef(false);

  const doingCheio = doingCount >= 3 && item.status !== 'doing';
  const motivoObrigatorio = status === 'waiting';
  // #425 / R2-MOD-057: o executor (`notify_due_tasks`) ignora done/cancelled —
  // em estado terminal o Sheet não oferece alarme nem "Adiar" (o card já esconde
  // o RemindChip aí); mostra o motivo no lugar dos controles.
  const lembreteElegivel = aceitaLembrete(item.status);

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
      !mesmoInstante(due, item.due_date) ||
      !mesmoInstante(remind, item.remind_at)
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

  /**
   * R2-MOD-051: o Salvar não fecha com escrita pendente nem dispara estado e
   * campos em paralelo. O estado vai primeiro (a máquina de estados valida o
   * destino e o motivo) e só depois o patch dos campos, os dois aguardados; o
   * Sheet fecha apenas quando a edição inteira conclui. Qualquer falha mantém o
   * formulário aberto com tudo o que foi digitado, para a retentativa.
   */
  async function salvar() {
    if (salvandoRef.current) return;
    if (motivoObrigatorio && !motivo.trim()) {
      setErro('Diga por que parou');
      return;
    }
    setErro(null);
    setErroSalvar(null);

    const due = compor(dia, hora);
    const remind = compor(alarmeDia, alarmeHora);

    const patch: Partial<WorkItemInput> = {};
    if (title !== item.title) patch.title = title;
    if ((description || null) !== (item.description ?? null)) patch.description = description || null;
    if (prioridade !== item.priority) patch.priority = prioridade;
    if ((contactId || null) !== item.contact_id) patch.contactId = contactId || null;
    if (motivoObrigatorio && (motivo || null) !== (item.waiting_reason ?? null)) patch.waitingReason = motivo.trim();
    if (!mesmoInstante(due, item.due_date)) patch.dueDate = due;
    if (!mesmoInstante(remind, item.remind_at)) patch.remindAt = remind;

    // Estado é do `move` (máquina de estados); o resto vai por patch (etapa 25).
    const mudaEstado = status !== item.status;

    salvandoRef.current = true;
    setSalvando(true);
    try {
      if (mudaEstado) await onMove(item, status, motivoObrigatorio ? motivo.trim() : undefined);
      if (Object.keys(patch).length > 0) await onSave(item, patch);
    } catch {
      setErroSalvar('Não foi possível salvar. Seus dados continuam aqui — tente de novo.');
      return;
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }

    onOpenChange(false);
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Etapa 132: cabeçalho — ícone calendário em quadrado primary, "Detalhes
          da tarefa" e expandir. O fechar é o X que o próprio SheetContent já
          posiciona no topo-direito (alvo de 40 px, rótulo acessível). */}
      <SheetHeader className="space-y-0">
        <div data-testid="sheet-cabecalho" className="flex items-start gap-3 pr-8">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"
          >
            <CalendarIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-base">Detalhes da tarefa</SheetTitle>
            {/* Etapa 133: badges de estado e prioridade no topo, lendo o mesmo
                estado que os campos editam — por isso acompanham a edição. */}
            <p data-testid="sheet-badges" className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusPill status={status} />
              <PriorityPill priority={prioridade} />
            </p>
          </div>
          <button
            type="button"
            data-testid="sheet-expandir"
            aria-pressed={expandido}
            aria-label={expandido ? 'Recolher painel' : 'Expandir painel'}
            title={expandido ? 'Recolher painel' : 'Expandir painel'}
            onClick={onAlternarExpansao}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {expandido ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </SheetHeader>

      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="sheet-titulo">Título</Label>
          {/* Etapa 134: título como input grande (é o que a imagem 03 mostra). */}
          <Input
            id="sheet-titulo"
            data-testid="sheet-titulo"
            autoFocus={!focusField}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1.5 h-11 text-base font-semibold bg-input/40 border-border/70"
          />
        </div>

        {/* Etapa 134: Estado e Prioridade lado a lado, cada um um select com o
            ícone colorido (ponto com os tokens D12) e a opção bloqueada pelo
            limite explicada no próprio rótulo. */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="sheet-estado">Estado</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as WorkItemStatus)}>
              <SelectTrigger id="sheet-estado" data-testid="sheet-estado" className="mt-1.5 bg-input/40 border-border/70">
                <span aria-hidden className={`mr-1.5 h-2 w-2 shrink-0 rounded-full ${PONTO_ESTADO[status]}`} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KANBAN_COLUMNS.map((c) => {
                  const bloqueado = c.status === 'doing' && doingCheio;
                  return (
                    <SelectItem key={c.status} value={c.status} disabled={bloqueado}>
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PONTO_ESTADO[c.status]}`} />
                        {bloqueado ? `${c.label} está cheio (${doingCount}/3)` : c.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="sheet-prioridade">Prioridade</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Priority)}>
              <SelectTrigger
                id="sheet-prioridade"
                data-testid="sheet-prioridade"
                data-priority={prioridade}
                className="mt-1.5 bg-input/40 border-border/70"
              >
                <span aria-hidden className={`mr-1.5 h-2 w-2 shrink-0 rounded-full ${PONTO_PRIORIDADE[prioridade]}`} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p} value={p}>
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${PONTO_PRIORIDADE[p]}`} />
                      {PRIORITY_LABELS[p]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {motivoObrigatorio && (
          <div
            data-testid="sheet-motivo-caixa"
            className="rounded-lg border border-warning/40 bg-warning/5 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="sheet-motivo" className="text-[hsl(var(--warning-text))]">
                Motivo da espera
              </Label>
              <span
                data-testid="sheet-motivo-obrigatorio"
                className="rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-2xs font-semibold leading-none text-[hsl(var(--warning-text))]"
              >
                Obrigatório
              </span>
            </div>
            <Textarea
              id="sheet-motivo"
              data-testid="sheet-motivo"
              autoFocus={focusField === 'waiting_reason'}
              value={motivo}
              onChange={(e) => { setMotivo(e.target.value); setErro(null); }}
              placeholder="Por que parou? Ex.: aguardando aprovação do cliente"
              className="mt-1.5 bg-background/60 border-warning/40"
            />
            {erro && <p data-testid="sheet-motivo-erro" className="mt-1 text-2xs text-destructive">{erro}</p>}
          </div>
        )}

        {/* Etapa 136: Contato com avatar no select e "Abrir conversa ↗" ao lado,
            pelo mesmo mecanismo do card (`openContactChat`). */}
        <div>
          <Label htmlFor="sheet-contato">Contato</Label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Select
              value={contactId || 'sem'}
              onValueChange={(v) => setContactId(v === 'sem' ? '' : v)}
            >
              <SelectTrigger id="sheet-contato" data-testid="sheet-contato" className="min-w-0 flex-1 bg-input/40 border-border/70">
                <SelectValue placeholder="Sem contato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sem">Sem contato</SelectItem>
                {contactOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      {/* Decorativo dentro da opção: o nome acessível fica no
                          texto, para o leitor de tela não repetir o contato. */}
                      <span aria-hidden>
                        <ContactAvatar name={c.name} size="sm" />
                      </span>
                      {c.name || 'Sem nome'}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              data-testid="sheet-abrir-conversa"
              disabled={!contactId}
              onClick={() => { if (contactId) openContactChat(contactId); }}
              className="shrink-0 gap-1 border-border/70 text-xs"
            >
              Abrir conversa <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
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
          {lembreteElegivel ? (
            <>
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
            </>
          ) : (
            <p data-testid="sheet-alarme-indisponivel" className="mt-1.5 text-2xs text-muted-foreground">
              {MOTIVO_SEM_LEMBRETE}
            </p>
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
            <>
              <Label htmlFor="sheet-descricao" className="mt-1.5 block">Descrição da tarefa</Label>
              <Textarea
                id="sheet-descricao"
                data-testid="sheet-descricao"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 bg-input/40 border-border/70"
                rows={3}
              />
            </>
          )}
        </div>
      </div>

      {erroSalvar && (
        <p data-testid="sheet-erro-salvar" role="alert" className="text-2xs text-destructive">
          {erroSalvar}
        </p>
      )}

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
          disabled={!mudou || salvando}
          aria-busy={salvando}
          onClick={() => { void salvar(); }}
          className="sm:ml-auto bg-primary"
          title="Ctrl+Enter salva"
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') void salvar(); }}
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
