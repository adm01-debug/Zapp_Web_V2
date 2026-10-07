/**
 * OTH-005 (item 145, P2) — contrato da lista de threads de Email.
 *
 * O defeito: `useGmail` coletava TODAS as páginas da conta por `range`/offset (até
 * 50.000 linhas), mandava ao servidor apenas o filtro de conta, filtrava o resto no
 * array em memória e a UI recortava 20 itens com `slice`. O custo crescia com a caixa
 * inteira e a página não era o que o servidor devolvia.
 *
 * Aqui ficam as decisões puras do contrato novo (dados, sem I/O):
 *   - estado (não lido/favorito), pasta/marcador, período, anexos e busca são traduzidos
 *     para filtros do PostgREST, aplicados ANTES da paginação;
 *   - a página é exatamente uma janela `range(from, to)` de `EMAIL_THREAD_PAGE_SIZE`;
 *   - o total exibido é a contagem exata do servidor para o mesmo filtro (a página nunca
 *     vira total global).
 *
 * A ordem da consulta continua `last_message_at DESC, id DESC` — determinística mesmo com
 * timestamps empatados. Política para escrita concorrente: a lista se reinscreve no
 * realtime de `email_threads` e invalida a consulta, recarregando a página corrente em vez
 * de remendar o array em memória.
 */
import { escapeOrFilterValue } from './postgrestFilters';

export const EMAIL_THREAD_PAGE_SIZE = 20;

export type EmailThreadStateFilter = 'all' | 'unread' | 'starred';
export type EmailThreadPeriodFilter = 'all' | 'today' | '7d' | '30d';

export interface EmailThreadListFilters {
  filter: EmailThreadStateFilter;
  hasAttachments: boolean;
  /** `gmail_label_id` da pasta/marcador, ou `all`. */
  labelId: string;
  period: EmailThreadPeriodFilter;
  search: string;
}

export interface EmailThreadListQuery extends EmailThreadListFilters {
  page: number;
  /**
   * Caminho antigo (conjunto completo em memória) para telas legadas que ainda filtram
   * o array — uso explícito, para não repetir o defeito por acidente.
   */
  full?: boolean;
}

/** O que deve ir ao servidor para a lista de threads, derivado dos filtros da UI. */
export interface EmailThreadQueryDescriptor {
  isUnread: boolean;
  isStarred: boolean;
  labelId: string | null;
  /** ISO do corte de período, quando houver. */
  since: string | null;
  /** Termo de busca já saneado. */
  search: string | null;
  hasAttachments: boolean;
}

export const EMAIL_THREAD_DEFAULT_FILTERS: EmailThreadListFilters = {
  filter: 'all',
  hasAttachments: false,
  labelId: 'all',
  period: 'all',
  search: '',
};

const STATE_FILTERS: readonly string[] = ['all', 'unread', 'starred'];
const PERIOD_FILTERS: readonly string[] = ['all', 'today', '7d', '30d'];

/** Colunas da consulta. O join `!inner` de mensagens só entra quando o filtro de anexo está ligado. */
export function emailThreadSelectColumns(filters: EmailThreadListFilters): string {
  const base = '*, contact:contacts(id, name, email, avatar_url, phone, company, job_title, tags)';
  return filters.hasAttachments ? `${base}, email_messages!inner(thread_id)` : base;
}

export function emailThreadPageRange(page: number, pageSize = EMAIL_THREAD_PAGE_SIZE): { from: number; to: number } {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1;
  const from = (safePage - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function emailThreadPeriodStart(period: EmailThreadPeriodFilter, now: Date = new Date()): Date | null {
  if (period === 'all') return null;
  const start = new Date(now.getTime());
  if (period === 'today') {
    start.setHours(0, 0, 0, 0);
    return start;
  }
  start.setDate(start.getDate() - Number.parseInt(period, 10));
  return start;
}

/** Saneia o termo de busca: vírgula e parênteses quebram a gramática do `.or()` do PostgREST. */
export function emailThreadSearchTerm(search: string): string | null {
  const term = search.trim().slice(0, 120).replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
  return term === '' ? null : term;
}

/**
 * Escapa os curingas do `ilike` dentro do termo digitado (`%` e `_` viram literal),
 * NESTA ordem: `\` primeiro para não re-escapar as contrabarras inseridas depois.
 * Os `%` que o padrão adiciona nas pontas são os curingas intencionais e ficam fora
 * desta função.
 */
export function escapeLikeWildcards(term: string): string {
  return term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Cláusula `.or()` da busca: colunas da própria `email_threads` mais, quando houver,
 * os contatos que casaram o termo (`contact_id` é coluna da thread — não vira join,
 * então thread sem contato não é excluída).
 */
export function emailThreadSearchOr(term: string, contactIds: readonly string[] = []): string {
  const pattern = escapeOrFilterValue(`%${escapeLikeWildcards(term)}%`);
  const clauses = ['subject', 'snippet', 'last_from_name', 'last_from_address']
    .map(column => `${column}.ilike.${pattern}`);
  if (contactIds.length > 0) clauses.push(`contact_id.in.(${contactIds.join(',')})`);
  return clauses.join(',');
}

export function emailThreadQueryDescriptor(filters: EmailThreadListFilters, now: Date = new Date()): EmailThreadQueryDescriptor {
  const labelId = filters.labelId && filters.labelId !== 'all' ? filters.labelId : null;
  const since = emailThreadPeriodStart(filters.period, now);
  return {
    isUnread: filters.filter === 'unread',
    isStarred: filters.filter === 'starred',
    labelId,
    since: since ? since.toISOString() : null,
    search: emailThreadSearchTerm(filters.search),
    hasAttachments: filters.hasAttachments,
  };
}

export function hasActiveEmailThreadFilters(filters: EmailThreadListFilters): boolean {
  return filters.filter !== 'all'
    || filters.hasAttachments
    || filters.labelId !== 'all'
    || filters.period !== 'all'
    || Boolean(filters.search.trim());
}

export function readEmailThreadFiltersFromUrl(params: URLSearchParams): EmailThreadListFilters {
  const rawState = params.get('emailFilter') ?? '';
  const rawPeriod = params.get('emailPeriod') ?? '';
  return {
    filter: STATE_FILTERS.includes(rawState) ? (rawState as EmailThreadStateFilter) : 'all',
    hasAttachments: params.get('emailAttachment') === 'true' || rawState === 'has_attachment',
    labelId: params.get('emailLabel') || 'all',
    period: PERIOD_FILTERS.includes(rawPeriod) ? (rawPeriod as EmailThreadPeriodFilter) : 'all',
    search: params.get('emailQuery') ?? '',
  };
}

/** Grava os filtros na URL preservando a rota ativa (`?view`, `emailThread`…). */
export function writeEmailThreadFiltersToUrl(url: URL, filters: EmailThreadListFilters): void {
  const setOrDelete = (name: string, value: string, defaultValue: string) => {
    if (value === defaultValue) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
  };
  setOrDelete('emailFilter', filters.filter, 'all');
  setOrDelete('emailAttachment', String(filters.hasAttachments), 'false');
  setOrDelete('emailLabel', filters.labelId, 'all');
  setOrDelete('emailPeriod', filters.period, 'all');
  setOrDelete('emailQuery', filters.search.trim(), '');
}

export function emailThreadPageCount(total: number | null, pageSize = EMAIL_THREAD_PAGE_SIZE): number {
  if (total === null || !Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}
