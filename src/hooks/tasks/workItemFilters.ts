import type { Priority, WorkItemStatus } from './workItem.types';

/**
 * Etapa 45: estado da barra de filtros do módulo de Tarefas.
 * Etapa 024/037: recorte por estado (coluna) e por prazo, ao lado dos filtros
 * que já existiam.
 *
 * Vive fora do componente de propósito: o parse/serialize da URL e as regras de
 * "tem filtro ativo" são puros e testáveis sem React. O nome dos parâmetros é o
 * do plano (`q`, `prio`, `contact`, `alarm`, `status`, `due`); só o `done` fica
 * invertido — ver `searchWithFilters`.
 */

/** Recorte por prazo (etapa 024/037). `all` = sem recorte. */
export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

export interface TasksFilters {
  q: string;
  prio: Priority | 'all';
  /** id do contato (o filtro casa com `item.contact.id`). */
  contact: string | null;
  /** só o que tem alarme marcado (`remind_at`). */
  alarm: boolean;
  /** mostrar as concluídas — o padrão do módulo é mostrar (etapas 48 e 51). */
  done: boolean;
  /**
   * Etapa 037: recorte por estado/coluna. `all` = sem recorte.
   * Opcional para os consumidores antigos que montam o objeto à mão (ex.: o
   * filtro literal do teste do Quadro); ausente é lido como `all`.
   */
  status?: WorkItemStatus | 'all';
  /** Etapa 024/037: recorte por prazo. Ausente é lido como `all`. */
  due?: DueFilter;
}

/**
 * Sentinela do filtro "Sem contato" (etapa 035): o plano pede a opção ao lado
 * dos contatos, e `contact: null` já significa "todos". Um valor que não é id
 * de contato nenhum deixa a regra explícita em `applyFilters` — sem tocar no
 * formato do `TasksFilters` nem na URL (`contact=__none__`).
 */
export const SEM_CONTATO = '__none__';

export const DEFAULT_FILTERS: TasksFilters = {
  q: '',
  prio: 'all',
  contact: null,
  alarm: false,
  done: true,
  status: 'all',
  due: 'all',
};

/** Um filtro está ativo quando alguma coisa sai do padrão do módulo. */
export function isFilterActive(f: TasksFilters): boolean {
  return (
    f.q.trim() !== '' ||
    f.prio !== 'all' ||
    f.contact !== null ||
    f.alarm ||
    !f.done ||
    (f.status ?? 'all') !== 'all' ||
    (f.due ?? 'all') !== 'all'
  );
}

/** Lê os filtros da query string, ignorando qualquer parâmetro desconhecido. */
export function filtersFromSearch(search: string): TasksFilters {
  const params = new URLSearchParams(search);
  const prio = params.get('prio');
  const contact = params.get('contact');
  const status = params.get('status');
  const due = params.get('due');

  return {
    q: params.get('q') ?? '',
    prio: prioridadesValidas.includes(prio as Priority) ? (prio as Priority) : 'all',
    contact: contact && contact !== '' ? contact : null,
    alarm: params.get('alarm') === '1',
    // `done` é `true` por padrão: só a exceção (esconder) precisa viajar na URL.
    done: params.get('done') !== '0',
    // Um valor fora da lista cai no padrão (`all`), como a prioridade.
    status: statusesValidos.includes(status as WorkItemStatus) ? (status as WorkItemStatus) : 'all',
    due: prazosValidos.includes(due as DueFilter) ? (due as DueFilter) : 'all',
  };
}

const prioridadesValidas: Array<Priority | 'all'> = ['all', 'low', 'medium', 'high', 'urgent'];

const statusesValidos: WorkItemStatus[] = ['backlog', 'todo', 'doing', 'waiting', 'done', 'cancelled'];

const prazosValidos: DueFilter[] = ['all', 'overdue', 'today', 'week', 'none'];

/**
 * Devolve a query string com os filtros, preservando o resto (o `view` da rota,
 * por exemplo). Só escreve o que difere do padrão, para o "Limpar" esvaziar de
 * verdade a URL.
 *
 * `done`: o plano lista `done=1`; como mostrar concluídas já é o padrão do
 * módulo, o que vale escrever é a exceção (`done=0`) — senão a URL nasceria
 * "suja" e o "Limpar" nunca apareceria.
 *
 * `status`/`due`: `all` é o padrão, então só o valor escolhido é escrito.
 */
export function searchWithFilters(search: string, f: TasksFilters): string {
  const params = new URLSearchParams(search);

  // O texto da busca nunca viaja na URL, e um `q` herdado (link antigo ou
  // favorito) precisa ser removido ao reescrever os filtros — senão o texto
  // continuaria na barra de endereço.
  params.delete('q');
  if (f.prio !== 'all') params.set('prio', f.prio); else params.delete('prio');
  if (f.contact) params.set('contact', f.contact); else params.delete('contact');
  if (f.alarm) params.set('alarm', '1'); else params.delete('alarm');
  if (f.done) params.delete('done'); else params.set('done', '0');
  const status = f.status ?? 'all';
  if (status !== 'all') params.set('status', status); else params.delete('status');
  const due = f.due ?? 'all';
  if (due !== 'all') params.set('due', due); else params.delete('due');

  const qs = params.toString();
  return qs === '' ? '' : `?${qs}`;
}
