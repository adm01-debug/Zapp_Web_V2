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
 * Cláusula `.or()` da busca: colunas da própria `email_threads`, mais, quando houver, os
 * contatos que casaram o termo (`contact_id` é coluna da thread — não vira join, então
 * thread sem contato não é excluída) e os `thread_id` que a RPC casou no corpo/anexo.
 */
export function emailThreadSearchOr(
  term: string,
  contactIds: readonly string[] = [],
  threadIds: readonly string[] = [],
): string {
  const pattern = escapeOrFilterValue(`%${escapeLikeWildcards(term)}%`);
  const clauses = ['subject', 'snippet', 'last_from_name', 'last_from_address']
    .map(column => `${column}.ilike.${pattern}`);
  if (contactIds.length > 0) clauses.push(`contact_id.in.(${contactIds.join(',')})`);
  // PE-09: os `thread_id` que a RPC casou no corpo/anexo entram ADITIVOS ao OR —
  // se a RPC estourar o teto de páginas ou o cursor empatar o `last_message_at`,
  // assunto/remetente/trecho continuam sendo encontrados como antes.
  if (threadIds.length > 0) clauses.push(`id.in.(${threadIds.join(',')})`);
  return clauses.join(',');
}

/**
 * PE-09 — busca que alcança corpo e anexo.
 *
 * O termo digitado também mora em colunas que a consulta da lista NÃO vê:
 * `email_messages.body_text` (corpo) e `email_attachments.filename` (nome do anexo).
 * A RPC `public.search_email_threads(p_account, p_q, p_limit, p_after)` devolve os
 * `thread_id` que casam em assunto/remetente/trecho/corpo/anexo, paginando por cursor
 * (`p_after` = `last_message_at` da última linha). Estes são os parâmetros do contrato
 * e o resultado é depois combinado com os filtros estruturais (pasta, estado, período,
 * anexos) na consulta PostgREST da lista.
 *
 * O teto de páginas é o que impede uma busca muito ampla (ex.: termo de 1 letra) de
 * virar varredura ilimitada — mesmo espírito do OTH-005, que tirou a caixa inteira da
 * consulta. `p_limit` é limitado a 100 pela própria RPC.
 */
export const EMAIL_THREAD_SEARCH_PAGE_SIZE = 50;
export const EMAIL_THREAD_SEARCH_MAX_PAGES = 2;

/** Linha devolvida pela RPC `search_email_threads`. */
export interface EmailThreadSearchMatch {
  thread_id: string;
  last_message_at: string;
}

/**
 * Percorre a RPC `search_email_threads` por cursor. Para no fim do resultado (página
 * incompleta) ou no teto de páginas. Não deduplica: o cursor por `last_message_at` já
 * anda para trás e cada `thread_id` aparece uma vez por página.
 */
export async function collectEmailSearchThreadIds(
  fetchPage: (after: string | null) => Promise<EmailThreadSearchMatch[]>,
  pageSize = EMAIL_THREAD_SEARCH_PAGE_SIZE,
  maxPages = EMAIL_THREAD_SEARCH_MAX_PAGES,
): Promise<EmailThreadSearchMatch[]> {
  const matches: EmailThreadSearchMatch[] = [];
  let after: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const chunk = await fetchPage(after);
    matches.push(...chunk);
    if (chunk.length < pageSize) return matches;
    after = chunk[chunk.length - 1]?.last_message_at ?? null;
    if (!after) return matches;
  }
  return matches;
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
