/**
 * OTH-005 — contrato puro da lista de Email: filtros viram cláusulas de servidor, a
 * janela é uma página e a busca é saneada antes de entrar no `.or()`.
 */
import { describe, expect, it } from 'vitest';
import {
  EMAIL_THREAD_DEFAULT_FILTERS,
  EMAIL_THREAD_PAGE_SIZE,
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
