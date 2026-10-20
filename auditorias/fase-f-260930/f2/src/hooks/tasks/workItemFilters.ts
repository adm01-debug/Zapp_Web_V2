import type { Priority } from './workItem.types';

/**
 * Etapa 45: estado da barra de filtros do módulo de Tarefas.
 *
 * Vive fora do componente de propósito: o parse/serialize da URL e as regras de
 * "tem filtro ativo" são puros e testáveis sem React. O nome dos parâmetros é o
 * do plano (`q`, `prio`, `contact`, `alarm`); só o `done` fica invertido — ver
 * `searchWithFilters`.
 */
export interface TasksFilters {
  q: string;
  prio: Priority | 'all';
  /** id do contato (o filtro casa com `item.contact.id`). */
  contact: string | null;
  /** só o que tem alarme marcado (`remind_at`). */
  alarm: boolean;
  /** mostrar as concluídas — o padrão do módulo é mostrar (etapas 48 e 51). */
  done: boolean;
}

export const DEFAULT_FILTERS: TasksFilters = {
  q: '',
  prio: 'all',
  contact: null,
  alarm: false,
  done: true,
};

/** Um filtro está ativo quando alguma coisa sai do padrão do módulo. */
export function isFilterActive(f: TasksFilters): boolean {
  return f.q.trim() !== '' || f.prio !== 'all' || f.contact !== null || f.alarm || !f.done;
}

/** Lê os filtros da query string, ignorando qualquer parâmetro desconhecido. */
export function filtersFromSearch(search: string): TasksFilters {
  const params = new URLSearchParams(search);
  const prio = params.get('prio');
  const contact = params.get('contact');

  return {
    q: params.get('q') ?? '',
    prio: prioridadesValidas.includes(prio as Priority) ? (prio as Priority) : 'all',
    contact: contact && contact !== '' ? contact : null,
    alarm: params.get('alarm') === '1',
    // `done` é `true` por padrão: só a exceção (esconder) precisa viajar na URL.
    done: params.get('done') !== '0',
  };
}

const prioridadesValidas: Array<Priority | 'all'> = ['all', 'low', 'medium', 'high', 'urgent'];

/**
 * Devolve a query string com os filtros, preservando o resto (o `view` da rota,
 * por exemplo). Só escreve o que difere do padrão, para o "Limpar" esvaziar de
 * verdade a URL.
 *
 * `done`: o plano lista `done=1`; como mostrar concluídas já é o padrão do
 * módulo, o que vale escrever é a exceção (`done=0`) — senão a URL nasceria
 * "suja" e o "Limpar" nunca apareceria.
 */
export function searchWithFilters(search: string, f: TasksFilters): string {
  const params = new URLSearchParams(search);

  if (f.q.trim() !== '') params.set('q', f.q); else params.delete('q');
  if (f.prio !== 'all') params.set('prio', f.prio); else params.delete('prio');
  if (f.contact) params.set('contact', f.contact); else params.delete('contact');
  if (f.alarm) params.set('alarm', '1'); else params.delete('alarm');
  if (f.done) params.delete('done'); else params.set('done', '0');

  const qs = params.toString();
  return qs === '' ? '' : `?${qs}`;
}
