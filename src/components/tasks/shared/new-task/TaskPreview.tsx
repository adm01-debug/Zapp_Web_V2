import type { Priority, WorkItem } from '@/hooks/tasks/workItem.types';
import { WorkItemCard } from '../WorkItemCard';
import type { ContactOption } from '../ContactCombobox';

interface Props {
  /** Título digitado; vazio vira o rótulo provisório do cartão. */
  title: string;
  priority: Priority;
  contactId: string | null;
  contact?: ContactOption | null;
  dueDate: string | null;
  remindAt: string | null;
  /** Relógio dos campos de data; injetável nos testes. Padrão: agora. */
  now?: Date;
}

/**
 * Etapa 165 (plano, linha 122; imagem 04, seção 3.4) — coluna "Prévia da tarefa
 * — Confira antes de criar.".
 *
 * O cartão é VIVO: cada tecla do formulário o redesenha. Para não existirem duas
 * verdades sobre o que é um cartão de tarefa, o desenho é o `WorkItemCard` REAL
 * (modo lista) sobre um item montado a partir do rascunho — sem handlers, porque
 * na prévia nada se conclui, move ou abre. O item nasce na Caixa de entrada
 * (D10), o mesmo destino que o `DestinationBlock` anuncia logo abaixo.
 */
export function TaskPreview({
  title,
  priority,
  contactId,
  contact = null,
  dueDate,
  remindAt,
  now,
}: Props) {
  const agora = (now ?? new Date()).toISOString();
  const item: WorkItem = {
    id: 'previa-nova-tarefa',
    title: title.trim() || 'Sem título',
    description: null,
    status: 'backlog',
    priority,
    due_date: dueDate,
    remind_at: remindAt,
    notified_at: null,
    waiting_reason: null,
    position: 0,
    started_at: null,
    status_changed_at: agora,
    completed_at: null,
    contact_id: contactId,
    created_by: '',
    assigned_to: '',
    created_at: agora,
    updated_at: agora,
    contact: contact
      ? { id: contact.id, name: contact.name, phone: contact.phone ?? null, avatar_url: contact.avatarUrl ?? null }
      : null,
  };

  return (
    <aside
      data-testid="nt-previa"
      aria-labelledby="nt-previa-titulo"
      className="space-y-2 md:w-56 md:shrink-0"
    >
      <h3 id="nt-previa-titulo" className="text-sm font-medium leading-none">
        Prévia da tarefa
      </h3>
      <p className="text-2xs text-muted-foreground">Confira antes de criar.</p>
      <div data-testid="nt-previa-cartao">
        <WorkItemCard item={item} mode="list" contactName={contact?.name ?? null} />
      </div>
    </aside>
  );
}
