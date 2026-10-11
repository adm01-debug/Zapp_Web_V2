import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, CalendarIcon, Maximize2, Minimize2, PauseCircle } from 'lucide-react';
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
import { KANBAN_COLUMNS } from '@/hooks/tasks/workItem.types';
import { PRIORITY_LABELS } from '@/hooks/tasks/workItemLabels';
import { StatusPill } from './StatusPill';
import { PriorityPill } from './PriorityPill';
import { ContactAvatar } from './ContactAvatar';
import { openContactChat } from '@/components/catalog/useSendProduct';
import { useNarrowViewport } from './pointerMedia';
import { comporLocal, diaLocal, horaLocal, mesmoInstante } from './localDateTime';
import { aceitaLembrete, MOTIVO_SEM_LEMBRETE } from './cardActions';
import { PlanejamentoSection } from './sheet/PlanejamentoSection';
import { formatCriadaEm } from './sheet/planejamento';
import { PainelRodape } from './sheet/PainelRodape';
import {
  classeDeLargura,
  gravarExpandidoArmazenado,
  lerExpandidoArmazenado,
  painelNaoModal,
} from './sheet/painel';
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
   *  Etapa 31: "Lembrar-me → Escolher…" abre no campo alarme.
   *  Etapa 144 / D14: o `Esc` fecha e devolve o foco ao cartão da tarefa; o F6
   *  alterna painel ↔ lista/quadro. Etapa 145: no desktop o painel é não modal,
   *  então não há armadilha de foco — no bottom sheet do celular segue modal e
   *  o Radix prende o foco dentro dele. */
  focusField?: 'waiting_reason' | 'remind_at';
}

export function WorkItemSheet(props: SheetProps) {
  const { item, open, onOpenChange, focusField } = props;
  const narrow = useNarrowViewport();
  // Etapa 145 (D14): de `md` para cima o painel é NÃO modal — sem overlay, com
  // o Quadro visível e clicável; abaixo disso segue o bottom sheet modal.
  const naoModal = painelNaoModal(narrow);
  // Etapa 146: o "expandir" do cabeçalho alarga o painel (≈70% da janela) e a
  // escolha é lembrada pelo navegador (D11). Lida uma vez, na montagem.
  const [expandido, setExpandido] = useState(lerExpandidoArmazenado);
  const conteudoRef = useRef<HTMLDivElement>(null);
  // Etapa 143: a mudança pendente vive no formulário; o guarda mora aqui para
  // que Esc, o clique fora e o X do SheetContent caiam na MESMA proteção.
  const alteradoRef = useRef(false);
  // Guarda o id (e não só um booleano): trocar de tarefa no painel limpa a
  // confirmação sozinho, sem setState dentro de efeito.
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const confirmando = item !== null && confirmandoId === item.id;

  const sincronizarMudanca = useCallback((mudou: boolean) => {
    alteradoRef.current = mudou;
  }, []);

  const pedirConfirmacao = useCallback(() => {
    setConfirmandoId(item?.id ?? null);
  }, [item?.id]);

  const descartar = useCallback(() => {
    setConfirmandoId(null);
    onOpenChange(false);
  }, [onOpenChange]);

  /** Etapa 144: fecha e devolve o foco ao card da tarefa na lista/quadro. */
  const fecharDevolvendoFoco = useCallback(() => {
    const id = item?.id;
    onOpenChange(false);
    if (!id) return;
    // Depois do unmount do painel o Radix ainda repõe o foco no gatilho — este
    // agendamento roda por último e devolve o foco ao item.
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-item-id="${id}"]`)?.focus?.();
    }, 0);
  }, [item?.id, onOpenChange]);

  /** Etapa 144: F6 alterna painel ↔ lista/quadro (vale nos dois modos da 145). */
  useEffect(() => {
    if (!open) return;
    function aoTeclar(event: KeyboardEvent) {
      if (event.key !== 'F6') return;
      event.preventDefault();
      const dentro = conteudoRef.current?.contains(document.activeElement) ?? false;
      if (dentro) {
        const id = item?.id;
        const alvo =
          (id ? document.querySelector<HTMLElement>(`[data-item-id="${id}"]`) : null) ??
          document.querySelector<HTMLElement>('[data-item-id]');
        alvo?.focus?.();
        return;
      }
      conteudoRef.current?.focus?.();
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [open, item?.id]);

  return (
    <Sheet
      open={open}
      // Etapa 145: não modal no desktop (sem overlay e sem armadilha de foco; o
      // Quadro continua clicável atrás) e modal no bottom sheet do celular.
      modal={!naoModal}
      onOpenChange={(proximo) => {
        // Etapa 143: o X do SheetContent (e qualquer fechamento do próprio
        // Radix) passa por aqui — com edição pendente, pede confirmação em vez
        // de fechar. Os fechamentos programáticos (Salvar/Concluir/Cancelar)
        // usam o `onOpenChange` cru recebido pelo formulário.
        if (!proximo && alteradoRef.current) {
          pedirConfirmacao();
          return;
        }
        onOpenChange(proximo);
      }}
    >
      <SheetContent
        ref={conteudoRef}
        side={narrow ? 'bottom' : 'right'}
        data-testid="work-item-sheet"
        data-nao-modal={naoModal ? 'true' : 'false'}
        className={
          narrow
            ? 'h-[90vh] overflow-y-auto'
            : `overflow-y-auto ${classeDeLargura(expandido)}`
        }
        onEscapeKeyDown={(event) => {
          if (alteradoRef.current) {
            // Etapa 143: com edição pendente o Esc não fecha — pede confirmação.
            event.preventDefault();
            pedirConfirmacao();
            return;
          }
          fecharDevolvendoFoco();
        }}
        onInteractOutside={(event) => {
          // O menu ⋮ abre em portal: clicar nele não é "clicar fora".
          const alvo = event.target as HTMLElement | null;
          if (alvo?.closest?.('[data-radix-popper-content-wrapper]')) return;
          // Etapa 145: no painel não modal o clique fora NÃO fecha o painel — é
          // exatamente assim que se troca de tarefa: clicar em outro cartão do
          // Quadro troca o item do painel (D14). Sem overlay, também não existe
          // "clique fora" que jogue edição fora; a proteção da etapa 143 segue
          // no Esc, no X e em qualquer fechamento pedido pelo próprio painel.
          if (naoModal) {
            event.preventDefault();
            return;
          }
          if (alteradoRef.current) {
            event.preventDefault();
            pedirConfirmacao();
          }
        }}
      >
        {item && (
          <Formulario
            key={item.id + (focusField ?? '')}
            {...props}
            item={item}
            onOpenChange={onOpenChange}
            onMudouChange={sincronizarMudanca}
            expandido={expandido}
            onAlternarExpansao={() => {
              // Etapa 146: alterna e grava a preferência (D11).
              const proximo = !expandido;
              setExpandido(proximo);
              gravarExpandidoArmazenado(proximo);
            }}
          />
        )}

        {confirmando && (
          <div
            data-testid="sheet-descartar"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="sheet-descartar-titulo"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center"
          >
            <p id="sheet-descartar-titulo" className="text-sm font-semibold">
              Descartar alterações?
            </p>
            <p className="text-2xs text-muted-foreground">
              As alterações não salvas serão perdidas.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                data-testid="sheet-descartar-continuar"
                onClick={() => setConfirmandoId(null)}
                className="h-10"
              >
                Continuar editando
              </Button>
              <Button
                type="button"
                variant="destructive"
                data-testid="sheet-descartar-confirmar"
                onClick={descartar}
                className="h-10"
              >
                Descartar
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

type FormProps = Omit<SheetProps, 'item' | 'open'> & {
  item: WorkItem;
  expandido: boolean;
  onAlternarExpansao: () => void;
  /** Etapa 143: avisa o painel se há edição pendente (guarda do fechamento). */
  onMudouChange: (mudou: boolean) => void;
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
  onMudouChange,
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
  // Etapa 140: "Criada em 9 out. 2026", discreto no fim da seção.
  const criadaEm = formatCriadaEm(item.created_at);

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

  // Etapa 143: mantém o guarda do painel em sincronia com o rascunho.
  useEffect(() => {
    onMudouChange(mudou);
  }, [mudou, onMudouChange]);

  /** Etapa 65: adia e reflete o novo alarme no Sheet. */
  function adiar(minutes: number | 'tomorrow9') {
    onSnooze(item, minutes);
    const quando = quandoAdiar(minutes);
    setAlarmeDia(diaLocal(quando.toISOString()));
    setAlarmeHora(horaLocal(quando.toISOString()));
    setAvisadoEm(null);
  }

  /** Etapa 139: "Remover" da linha do lembrete — limpa o alarme e desarma o
   *  "Avisado em" (o banco também zera `notified_at` no `setReminder(null)`). */
  function removerAlarme() {
    setAlarmeDia(null);
    setAvisadoEm(null);
    onSetReminder(item, null);
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
    <div
      className="flex flex-col gap-4 h-full"
      // Etapa 141/142: o Ctrl+Enter salva de qualquer campo do painel (a dica
      // do rodapé aponta para cá) — o botão só recebia a tecla em foco.
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault();
          if (mudou && !salvando) void salvar();
        }
      }}
    >
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

        {/* Etapas 137–139: a seção "Planejamento" (os dois cartões, a validação
            do lembrete contra o prazo e a linha Agendado · Adiar · Remover)
            mora em `sheet/PlanejamentoSection.tsx` — este arquivo está no teto
            de linhas do CI e não pode crescer. */}
        <PlanejamentoSection
          prazoDia={dia}
          prazoHora={hora}
          onPrazoDia={setDia}
          onPrazoHora={setHora}
          avisoDia={alarmeDia}
          avisoHora={alarmeHora}
          onAvisoDia={setAlarmeDia}
          onAvisoHora={setAlarmeHora}
          lembreteElegivel={lembreteElegivel}
          motivoIndisponivel={MOTIVO_SEM_LEMBRETE}
          focoAviso={focusField === 'remind_at'}
          avisadoEm={avisadoEm}
          onAdiar={adiar}
          onRemover={removerAlarme}
        />


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
              {/* Etapa 140: caixa redimensionável (`resize-y`) com contador. */}
              <Textarea
                id="sheet-descricao"
                data-testid="sheet-descricao"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1.5 resize-y bg-input/40 border-border/70"
                rows={3}
              />
              <p
                data-testid="sheet-descricao-contador"
                className="mt-1 text-2xs text-muted-foreground"
              >
                {description.length} {description.length === 1 ? 'caractere' : 'caracteres'}
              </p>
            </>
          )}
          {/* Etapa 140: "Criada em 9 out. 2026", discreto. */}
          {criadaEm && (
            <p data-testid="sheet-criada-em" className="mt-1 text-2xs text-muted-foreground">
              {criadaEm}
            </p>
          )}
        </div>
      </div>

      {erroSalvar && (
        <p data-testid="sheet-erro-salvar" role="alert" className="text-2xs text-destructive">
          {erroSalvar}
        </p>
      )}

      {/* Etapas 141–142: estado de edição e ações do rodapé moram em
          `sheet/PainelRodape.tsx` para este arquivo não crescer mais. */}
      <SheetFooter className="mt-auto flex-col gap-2">
        <PainelRodape
          item={item}
          mudou={mudou}
          salvando={salvando}
          onConcluir={() => { onMove(item, 'done'); onOpenChange(false); }}
          onSalvar={() => { void salvar(); }}
          onCancelar={() => { onCancel(item); onOpenChange(false); }}
          onReabrir={() => { onMove(item, 'todo'); onOpenChange(false); }}
        />
      </SheetFooter>

      {motivoObrigatorio && (
        <p className="flex items-center gap-1 text-2xs text-muted-foreground">
          <PauseCircle className="h-3 w-3" /> Tarefa em Aguardando exige o motivo.
        </p>
      )}
    </div>
  );
}
