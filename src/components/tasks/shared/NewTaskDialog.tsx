import { useState, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
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
   * Controle externo do `Dialog` (etapas 159/160/163): os testes dessas etapas
   * montam o modal sem o `TasksUiProvider`. Sem estas props o modal segue o
   * `TasksUiContext` como as outras superfícies.
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
 * `undoToast` põe o mesmo texto com a ação — outro toast aberto na hora
 * (de outra ação) continua vivo. Desfazer = cancelamento (D8) do item recém-criado, pelo
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
  const closeModal = tasksUi?.closeModal ?? (() => onOpenChange?.(false));
  const { createAndGetId, cancel, refetch } = useMyWorkItems();

  const [title, setTitle] = useState('');
  const [touched, setTouched] = useState(false);
  const [contactId, setContactId] = useState<string | null>(defaultContactId);
  /**
   * Etapa 165 ([refazer 1] ponto 4): a prévia mostra o contato ESCOLHIDO aqui,
   * não o que uma segunda leitura da busca devolver — o `ContactCombobox`
   * devolve o `ContactOption` junto do id no `onChange`, então um contato
   * achado por busca e fora da lista padrão continua na prévia.
   */
  const [contatoEscolhido, setContatoEscolhido] = useState<ContactOption | null>(defaultContact);
  const trocarContato = (id: string | null, opt?: ContactOption | null) => {
    setContactId(id);
    setContatoEscolhido(opt ?? null);
  };
  const [priority, setPriority] = useState<Priority>('medium');
  const [dueDate, setDueDate] = useState<string | null>(defaultDueDate);
  const [remindAt, setRemindAt] = useState<string | null>(defaultRemindAt);
  const [enviando, setEnviando] = useState(false);

  const titleError = touched && !title.trim() ? 'Informe o título da tarefa.' : null;
  const podeCriar = title.trim().length > 0;

  /**
   * Etapa 165: o `ContactCombobox` só devolvia o id, então a prévia lia a busca
   * que ele já faz — uma instância própria que nunca recebia o termo digitado,
   * e o contato achado por busca sumia da prévia. Agora o combobox devolve o
   * `ContactOption` escolhido e a prévia lê DAQUI.
   */
  const contatoDaPrevia: ContactOption | null =
    contactId && contatoEscolhido?.id === contactId
      ? contatoEscolhido
      : contactId && defaultContact?.id === contactId
        ? defaultContact
        : null;

  /**
   * Etapa 168 ([refazer 1] ponto 1): captura de verdade otimista — o
   * `closeModal()` sai ANTES do INSERT resolver, o modal já está fechado com
   * o INSERT ainda pendente. Se o banco recusar, o modal CONTINUA fechado e o
   * próprio hook já mostra o erro em toast ("Erro ao criar tarefa" / "O
   * horario do aviso ja passou"); nada apareceu na lista, então não há o que
   * desfazer nem "Tarefa criada".
   */
  const criar = async () => {
    const texto = title.trim();
    setTouched(true);
    if (!texto || enviando) return;

    setEnviando(true);
    closeModal();
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
      return;
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
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    void criar();
  };

  /** Etapa 167: `Ctrl+Enter` (ou `Cmd+Enter`) em qualquer campo cria. */
  const ctrlEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    void criar();
  };

  return (
    <Dialog open={open ?? true} onOpenChange={onOpenChange ?? ((aberto) => { if (!aberto) closeModal(); })}>
      <DialogContent size="lg" data-testid="new-task-dialog" className="gap-5">
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

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start" onKeyDown={ctrlEnter}>
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

          <div className="space-y-3 lg:shrink-0">
            <TaskPreview
              title={title}
              priority={priority}
              contactId={contactId}
              contact={contatoDaPrevia}
              dueDate={dueDate}
              remindAt={remindAt}
              now={now}
            />
            <DestinationBlock />
          </div>
        </div>

        <NewTaskFooter
          enviando={enviando}
          podeCriar={podeCriar}
          onCancelar={closeModal}
          onCriar={() => void criar()}
        />
      </DialogContent>
    </Dialog>
  );
}
