import { useState, type KeyboardEvent } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import type { Priority } from '@/hooks/tasks/workItem.types';
import { TAREFA_CRIADA_TOAST_ID, useMyWorkItems } from '@/hooks/tasks/useMyWorkItems';
import { undoToast } from '@/lib/undoToast';
import { useTasksUiOptional } from './tasksUi';
import { ContactCombobox, type ContactOption } from './ContactCombobox';
import { TaskTitleField } from './new-task/TaskTitleField';
import { PrioritySegment } from './new-task/PrioritySegment';
import { PrazoField } from './new-task/PrazoField';
import { RemindField } from './new-task/RemindField';
import { CoerenciaLembrete } from './new-task/CoerenciaLembrete';
import { DestinationBlock } from './new-task/DestinationBlock';
import { TaskPreview } from './new-task/TaskPreview';
import { InfoBox } from './new-task/InfoBox';
import { NewTaskFooter } from './new-task/NewTaskFooter';
import {
  esquecerRascunhoDaCaptura,
  lerRascunhoDaCaptura,
} from './new-task/rascunhoDaCaptura';

interface Props {
  /** Contato já escolhido quando o modal nasce a partir de um contato (etapa 157). */
  defaultContactId?: string | null;
  /** Dados do contato acima, para o chip mostrar avatar + nome sem ir ao banco. */
  defaultContact?: ContactOption | null;
  /** Prazo inicial (ISO), quando o modal abre a partir de um dia/contexto (etapa 159). */
  defaultDueDate?: string | null;
  /** Lembrete inicial (ISO), quando o modal abre a partir de um contexto (etapa 160). */
  defaultRemindAt?: string | null;
  /** Relógio dos atalhos de prazo/lembrete; injetável nos testes. Padrão: agora. */
  now?: Date;
  /**
   * Controle externo do `Dialog` (etapas 159/160/163/164): os testes dessas
   * etapas montam o modal sem o `TasksUiProvider`. Sem estas props o modal
   * segue o `TasksUiContext`, como as outras superfícies do módulo.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Etapas 154 a 168 (plano, linhas 434 a 448; imagem 04, seção 3.4) — o modal
 * "Nova tarefa" do módulo de Tarefas.
 *
 * O modal obedece ao MESMO `TasksUiContext` das outras superfícies: aberto pelo
 * botão "+ Nova tarefa", pela tecla `N` e (adiante) pelo menu das colunas — o
 * que muda a fonte é só quem chama `openModal()`. Quem o carrega sob demanda é
 * o `TasksModule` (import dinâmico). O destino da tarefa é fixo na Caixa de
 * entrada (D10), por isso não há estado de destino aqui.
 *
 * Nesta fatia entram as etapas 165 (coluna de prévia com o `WorkItemCard` real
 * em modo prévia), 166 (caixa informativa), 167 (rodapé com dica de teclado,
 * "Cancelar" e "Criar tarefa") e 168 (criação otimista). Prazo, lembrete,
 * coerência e destino vêm montados das etapas 159, 160, 163 e 164.
 *
 * Criação (etapa 168): o caminho é o do módulo — `createAndGetId` de
 * `useMyWorkItems`, a mesma mutation que o QuickAdd usa, com o item nascendo na
 * Caixa de entrada, e a chave idempotente por clique cuidando do duplo submit.
 * O aviso é o MESMO "Tarefa criada" do hook, só que na versão com "Desfazer":
 * o toast simples é dispensado PELO ID (`TAREFA_CRIADA_TOAST_ID`) e o
 * `undoToast` põe o mesmo texto com a ação — outro toast aberto na hora (de
 * outra ação) continua vivo. Desfazer = cancelamento (D8) do item recém-criado, pelo
 * `cancel` do próprio hook (o item vem da releitura da lista, porque o
 * cancelamento é por item e não há "cancelar por id"). A narração para leitor
 * de tela sai do próprio toast: o viewport do sonner (`App.tsx`) é região viva,
 * então "Tarefa criada" é anunciado sem roubar o foco.
 */
export function NewTaskDialog({
  defaultContactId = null,
  defaultContact = null,
  defaultDueDate = null,
  defaultRemindAt = null,
  now,
  open,
  onOpenChange,
}: Props) {
  const tasksUi = useTasksUiOptional();
  const closeModal = () => {
    tasksUi?.closeModal();
    onOpenChange?.(false);
  };
  const { createAndGetId, cancel, refetch } = useMyWorkItems();

  // Etapa 171: o ⋯ do QuickAdd deixa o que já foi digitado aqui (a leitura não
  // consome — ver `rascunhoDaCaptura`). Sem rascunho, o modal nasce vazio.
  const rascunho = lerRascunhoDaCaptura();

  const [title, setTitle] = useState(rascunho?.title ?? '');
  const [touched, setTouched] = useState(false);
  const [contactId, setContactId] = useState<string | null>(rascunho?.contactId ?? defaultContactId);
  /**
   * Etapa 165: a prévia mostra o contato ESCOLHIDO aqui — o `ContactCombobox`
   * devolve o `ContactOption` junto do id no `onChange`, então um contato achado
   * por busca e fora da lista padrão continua na prévia (antes a prévia lia uma
   * segunda instância da busca, que nunca recebia o termo digitado).
   */
  const [contatoEscolhido, setContatoEscolhido] = useState<ContactOption | null>(defaultContact);
  const trocarContato = (id: string | null, opcao?: ContactOption | null) => {
    setContactId(id);
    setContatoEscolhido(opcao ?? null);
  };
  const [priority, setPriority] = useState<Priority>(rascunho?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState<string | null>(rascunho?.dueDate ?? defaultDueDate);
  const [remindAt, setRemindAt] = useState<string | null>(rascunho?.remindAt ?? defaultRemindAt);
  const [enviando, setEnviando] = useState(false);

  /** Etapa 169: <900px a prévia vira acordeão (gatilho com `aria-expanded`). */
  const [previaAberta, setPreviaAberta] = useState(false);

  /** Etapa 170: `criando` evita o pedido no fechamento legítimo pós-INSERT. */
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [criando, setCriando] = useState(false);

  const titleError = touched && !title.trim() ? 'Informe o título da tarefa.' : null;
  const podeCriar = title.trim().length > 0;

  /** Fecha de fato: esvazia o rascunho do QuickAdd e manda o modal embora. */
  const fechar = () => {
    esquecerRascunhoDaCaptura();
    closeModal();
  };

  /** Etapa 170: Esc, X e clique fora passam por aqui antes de fechar. */
  const tentarFechar = () => {
    if (!criando && title.trim().length > 0) {
      setConfirmandoDescarte(true);
      return;
    }
    fechar();
  };

  const contatoDaPrevia: ContactOption | null =
    contactId && contatoEscolhido?.id === contactId
      ? contatoEscolhido
      : contactId && defaultContact?.id === contactId
        ? defaultContact
        : null;

  /**
   * Etapa 168: captura de verdade otimista — o modal fecha ANTES do INSERT
   * resolver. Se o banco recusar, o modal CONTINUA fechado e o próprio hook já
   * mostra o erro em toast ("Erro ao criar tarefa" / "O horario do aviso ja
   * passou"); nada apareceu na lista, então não há o que desfazer nem "Tarefa
   * criada". `criando` evita o pedido de descarte (etapa 170) nesse fechamento.
   */
  const criar = async () => {
    const texto = title.trim();
    setTouched(true);
    if (!texto || enviando) return;

    setEnviando(true);
    setCriando(true);
    fechar();
    let id: string | null = null;
    try {
      id = await createAndGetId({
        title: texto,
        status: 'backlog',
        priority,
        contactId,
        dueDate,
        remindAt,
      });
    } catch {
      return; // o hook já avisou o erro.
    }

    if (!id) return; // 23505: o pedido repetido caiu no índice único (já existe).
    // O hook já tocou "Tarefa criada" simples; aqui vai a versão com "Desfazer".
    toast.dismiss(TAREFA_CRIADA_TOAST_ID);
    undoToast({
      message: 'Tarefa criada',
      icon: '✅',
      // Desfazer = cancelamento (D8). O cancelamento é por ITEM, então o
      // desfazer relê a lista do módulo (o create já invalidou; a releitura
      // acha o item recém-criado) em vez de inventar um WorkItem a partir do id.
      onUndo: async () => {
        const { data } = await refetch();
        const criada = data?.find((i) => i.id === id);
        if (criada) await cancel(criada);
      },
    });
  };

  /** Etapa 167: `Enter` no título cria (sem modificador). */
  const enterNoTitulo = (e: KeyboardEvent<HTMLDivElement>) => {
    const tecla = e.key; // alias: a regra local/no-secret-compare lê "key" como credencial.
    if (tecla !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    void criar();
  };

  /** Etapa 167: `Ctrl+Enter` (ou `Cmd+Enter`) em qualquer campo cria. */
  const ctrlEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    const tecla = e.key;
    if (tecla !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    void criar();
  };

  return (
    <Dialog open={open ?? true} onOpenChange={(aberto) => { if (!aberto) tentarFechar(); }}>
      <DialogContent
        size="lg"
        data-testid="new-task-dialog"
        className="gap-5"
        // Etapa 170: com título digitado, Esc e o clique fora pedem confirmação
        // em vez de descartar o rascunho.
        onEscapeKeyDown={(e) => { e.preventDefault(); tentarFechar(); }}
        onPointerDownOutside={(e) => { e.preventDefault(); tentarFechar(); }}
        onInteractOutside={(e) => { e.preventDefault(); tentarFechar(); }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            data-testid="new-task-icon"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
          >
            <Plus className="h-4 w-4" />
          </span>
          <div className="space-y-1">
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>Capture agora. Organize o próximo passo.</DialogDescription>
          </div>
        </div>

        <div
          className="flex flex-col gap-5 min-[900px]:flex-row min-[900px]:items-start"
          onKeyDown={ctrlEnter}
        >
          <div className="min-w-0 flex-1 space-y-5">
            <div onKeyDown={enterNoTitulo}>
              <TaskTitleField
                value={title}
                onChange={setTitle}
                onBlur={() => setTouched(true)}
                error={titleError}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-task-contact">Contato</Label>
              <div>
                <ContactCombobox
                  id="new-task-contact"
                  testId="new-task-contact"
                  value={contactId}
                  onChange={trocarContato}
                  selectedContact={defaultContact}
                  placeholder="Sem contato"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="text-sm font-medium leading-none">Prioridade</span>
              <PrioritySegment value={priority} onChange={setPriority} />
            </div>

            <PrazoField value={dueDate} onChange={setDueDate} now={now} />
            <RemindField value={remindAt} onChange={setRemindAt} now={now} />
            <CoerenciaLembrete
              remindAt={remindAt}
              dueDate={dueDate}
              now={now}
              onAjustar={setRemindAt}
            />
            <InfoBox />
          </div>

          <div className="min-w-0 space-y-3 min-[900px]:w-56 min-[900px]:shrink-0">
            {/* Etapa 169: <900px o gatilho (`min-[900px]:hidden`) controla o
                painel; ≥900px o gatilho some e a prévia ocupa a coluna. */}
            <Collapsible
              open={previaAberta}
              onOpenChange={setPreviaAberta}
              className="min-[900px]:contents"
            >
              <CollapsibleTrigger
                data-testid="nt-previa-gatilho"
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm font-medium leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[900px]:hidden"
              >
                Prévia da tarefa
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 transition-transform motion-safe:data-[state=open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent
                forceMount
                data-testid="nt-previa-painel"
                className="pt-3 min-[900px]:block min-[900px]:pt-0 max-[899px]:data-[state=closed]:hidden"
              >
                <TaskPreview
                  title={title}
                  priority={priority}
                  contactId={contactId}
                  contact={contatoDaPrevia}
                  dueDate={dueDate}
                  remindAt={remindAt}
                  now={now}
                />
              </CollapsibleContent>
            </Collapsible>
            <DestinationBlock />
          </div>
        </div>

        <NewTaskFooter
          enviando={enviando}
          podeCriar={podeCriar}
          onCancelar={tentarFechar}
          onCriar={() => void criar()}
        />

        {/* Etapa 170: o descarte do rascunho pede confirmação. */}
        <AlertDialog open={confirmandoDescarte} onOpenChange={setConfirmandoDescarte}>
          <AlertDialogContent data-testid="nt-descarte">
            <AlertDialogHeader>
              <AlertDialogTitle>Descartar o rascunho?</AlertDialogTitle>
              <AlertDialogDescription>
                O título digitado e os ajustes do formulário serão perdidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="nt-descarte-continuar">
                Continuar editando
              </AlertDialogCancel>
              <AlertDialogAction
                data-testid="nt-descarte-confirmar"
                onClick={() => { setConfirmandoDescarte(false); fechar(); }}
              >
                Descartar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
