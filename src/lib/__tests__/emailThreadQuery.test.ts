/**
 * OTH-005 — contrato puro da lista de Email: filtros viram cláusulas de servidor, a
 * janela é uma página e a busca é saneada antes de entrar no `.or()`.
 */
import { describe, expect, it } from 'vitest';
import {
  collectEmailSearchThreadIds,
  EMAIL_THREAD_DEFAULT_FILTERS,
  EMAIL_THREAD_PAGE_SIZE,
  EMAIL_THREAD_SEARCH_PAGE_SIZE,
  emailThreadPageCount,
  emailThreadPageRange,
  emailThreadPeriodStart,
  emailThreadQueryDescriptor,
  emailThreadSearchOr,
  emailThreadSearchTerm,
  emailThreadSelectColumns,
  escapeLikeWildcards,
  hasActiveEmailThreadFilters,
  readEmailThreadFiltersFromUrl,
  writeEmailThreadFiltersToUrl,
} from '../emailThreadQuery';

describe('emailThreadQuery (OTH-005)', () => {
  it('traduz estado, marcador, período, anexos e busca para o servidor', () => {
    const now = new Date('2026-10-05T12:00:00-03:00');
    const descriptor = emailThreadQueryDescriptor({
      ...EMAIL_THREAD_DEFAULT_FILTERS, filter: 'unread', labelId: 'IMPORTANT', period: '30d', search: '  Maria  ',
    }, now);
    expect(descriptor.isUnread).toBe(true);
    expect(descriptor.isStarred).toBe(false);
    expect(descriptor.labelId).toBe('IMPORTANT');
    expect(descriptor.since).toBe(new Date('2026-09-05T12:00:00-03:00').toISOString());
    expect(descriptor.search).toBe('Maria');
    expect(descriptor.hasAttachments).toBe(false);
  });

  it('sem filtro nenhum não manda condição extra ao servidor', () => {
    const descriptor = emailThreadQueryDescriptor(EMAIL_THREAD_DEFAULT_FILTERS);
    expect(descriptor).toEqual({ isUnread: false, isStarred: false, labelId: null, since: null, search: null, hasAttachments: false });
  });

  it('período "hoje" corta na meia-noite local', () => {
    const now = new Date('2026-10-05T12:34:56-03:00');
    const start = emailThreadPeriodStart('today', now);
    expect(start?.getHours()).toBe(0);
    expect(start?.getMinutes()).toBe(0);
    expect(start?.getDate()).toBe(5);
    expect(emailThreadPeriodStart('all', now)).toBeNull();
  });

  it('a janela é exatamente uma página, com página inválida caindo na primeira', () => {
    expect(emailThreadPageRange(1)).toEqual({ from: 0, to: EMAIL_THREAD_PAGE_SIZE - 1 });
    expect(emailThreadPageRange(3)).toEqual({ from: 2 * EMAIL_THREAD_PAGE_SIZE, to: 3 * EMAIL_THREAD_PAGE_SIZE - 1 });
    expect(emailThreadPageRange(0)).toEqual({ from: 0, to: EMAIL_THREAD_PAGE_SIZE - 1 });
    expect(emailThreadPageRange(Number.NaN)).toEqual({ from: 0, to: EMAIL_THREAD_PAGE_SIZE - 1 });
  });

  it('sanea a busca para não quebrar a gramática do filtro', () => {
    expect(emailThreadSearchTerm('   ')).toBeNull();
    expect(emailThreadSearchTerm('a,b(c)')).toBe('a b c');
    expect(emailThreadSearchTerm('x'.repeat(500))?.length).toBe(120);
  });

  it('a busca em OR cobre assunto, trecho e remetente com o valor entre aspas', () => {
    const clause = emailThreadSearchOr('maria');
    expect(clause).toContain('subject.ilike."%maria%"');
    expect(clause).toContain('last_from_address.ilike."%maria%"');
    expect(clause.split(',')).toHaveLength(4);
  });

  it('inclui os contatos que casam a busca sem excluir thread sem contato', () => {
    const clause = emailThreadSearchOr('maria', ['c1', 'c2']);
    expect(clause).toContain('contact_id.in.(c1,c2)');
    expect(clause).toContain('subject.ilike."%maria%"');
    // Sem contato casado, o OR sai só com colunas da própria thread.
    expect(emailThreadSearchOr('maria')).not.toContain('contact_id');
    expect(emailThreadSearchOr('maria', [])).not.toContain('contact_id');
  });

  it('escapa os curingas % e _ do termo sem tocar nos % externos do ilike', () => {
    expect(escapeLikeWildcards('50%')).toBe('50\\%');
    expect(escapeLikeWildcards('a_b')).toBe('a\\_b');
    expect(escapeLikeWildcards('a\\b')).toBe('a\\\\b');
    // O % digitado vira \% (a saída dobra a contrabarra para o PostgREST); os %
    // das pontas continuam curingas intencionais.
    const clause = emailThreadSearchOr('50%_x');
    expect(clause).toContain('subject.ilike."%50\\\\%\\\\_x%"');
  });

  it('o OR da busca soma os thread_id da RPC (corpo/anexo) ao lado das colunas da thread', () => {
    const clause = emailThreadSearchOr('maria', [], ['t1', 't2']);
    expect(clause).toContain('subject.ilike."%maria%"');
    expect(clause).toContain('id.in.(t1,t2)');
    // Sem ids da RPC o OR sai como sempre saiu — nada de cláusula `id.in` vazia.
    expect(emailThreadSearchOr('maria')).not.toContain('id.in.');
    expect(emailThreadSearchOr('maria', ['c1'])).toBe('subject.ilike."%maria%",snippet.ilike."%maria%",last_from_name.ilike."%maria%",last_from_address.ilike."%maria%",contact_id.in.(c1)');
  });

  it('percorre a RPC de busca por cursor até o fim do resultado', async () => {
    const calls: Array<string | null> = [];
    const firstPage = Array.from({ length: EMAIL_THREAD_SEARCH_PAGE_SIZE }, (_, index) => (
      { thread_id: `a${index}`, last_message_at: '2026-10-01T10:00:00Z' }
    ));
    const pages = [firstPage, [{ thread_id: 'b1', last_message_at: '2026-09-30T10:00:00Z' }]];
    const matches = await collectEmailSearchThreadIds(async (after) => {
      calls.push(after);
      return pages[calls.length - 1] ?? [];
    });
    // O `p_after` da 2ª chamada é o last_message_at da última linha da 1ª página.
    expect(calls).toEqual([null, firstPage[firstPage.length - 1].last_message_at]);
    expect(matches).toHaveLength(EMAIL_THREAD_SEARCH_PAGE_SIZE + 1);
  });

  it('respeita o teto de páginas de uma busca muito ampla', async () => {
    const calls: Array<string | null> = [];
    const full = () => Array.from({ length: EMAIL_THREAD_SEARCH_PAGE_SIZE }, (_, index) => (
      { thread_id: `x${index}`, last_message_at: '2026-10-01T10:00:00Z' }
    ));
    const matches = await collectEmailSearchThreadIds(async (after) => { calls.push(after); return full(); }, EMAIL_THREAD_SEARCH_PAGE_SIZE, 2);
    expect(calls).toHaveLength(2);
    expect(matches).toHaveLength(EMAIL_THREAD_SEARCH_PAGE_SIZE * 2);
  });

  it('o join de mensagens só entra no select quando o filtro de anexo está ligado', () => {
    expect(emailThreadSelectColumns(EMAIL_THREAD_DEFAULT_FILTERS)).not.toContain('email_messages');
    expect(emailThreadSelectColumns({ ...EMAIL_THREAD_DEFAULT_FILTERS, hasAttachments: true })).toContain('email_messages!inner(thread_id)');
  });

  it('conta páginas pelo total do servidor, nunca pelo tamanho da página', () => {
    expect(emailThreadPageCount(45)).toBe(3);
    expect(emailThreadPageCount(0)).toBe(1);
    expect(emailThreadPageCount(null)).toBe(1);
  });

  it('lê e grava os filtros na URL preservando a rota ativa', () => {
    const filters = readEmailThreadFiltersFromUrl(new URLSearchParams('view=email-chat&emailFilter=starred&emailQuery=Ana'));
    expect(filters).toEqual({ ...EMAIL_THREAD_DEFAULT_FILTERS, filter: 'starred', search: 'Ana' });
    expect(readEmailThreadFiltersFromUrl(new URLSearchParams('emailFilter=has_attachment')).hasAttachments).toBe(true);

    const url = new URL('https://app.local/?view=email-chat&emailThread=abc');
    writeEmailThreadFiltersToUrl(url, { ...EMAIL_THREAD_DEFAULT_FILTERS, filter: 'unread', search: 'Ana' });
    expect(url.searchParams.get('emailFilter')).toBe('unread');
    expect(url.searchParams.get('emailQuery')).toBe('Ana');
    expect(url.searchParams.get('emailAttachment')).toBeNull();
    expect(url.searchParams.get('view')).toBe('email-chat');
    expect(url.searchParams.get('emailThread')).toBe('abc');
  });

  it('reconhece quando há filtro ativo', () => {
    expect(hasActiveEmailThreadFilters(EMAIL_THREAD_DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveEmailThreadFilters({ ...EMAIL_THREAD_DEFAULT_FILTERS, search: 'x' })).toBe(true);
    expect(hasActiveEmailThreadFilters({ ...EMAIL_THREAD_DEFAULT_FILTERS, hasAttachments: true })).toBe(true);
  });
});
