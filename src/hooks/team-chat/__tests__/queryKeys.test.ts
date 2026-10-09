import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { queryKeys } from '@/hooks/team-chat/queryKeys';

/**
 * SL-081 (F52) — as chaves do módulo passam a sair de `queryKeys.ts`.
 *
 * Duas provas, nesta ordem:
 *  1. VALOR: cada fábrica devolve exatamente o literal histórico. Se o valor
 *     mudar, quem já invalida por prefixo deixa de casar — é a regressão que
 *     este teste pega sem precisar remontar o módulo inteiro.
 *  2. CASAMENTO REAL: `invalidateQueries` com a chave da fábrica alcança (ou não)
 *     a query registrada no cache, com o `QueryClient` de verdade.
 */

function invalidada(qc: QueryClient, key: readonly unknown[]): boolean {
  return qc.getQueryState(key)?.isInvalidated ?? false;
}

describe('queryKeys — valores preservados (regressão)', () => {
  it('profile() preserva a chave de perfil', () => {
    expect(queryKeys.profile()).toEqual(['profile']);
  });

  it('inbox() é a raiz e inbox(profileId) carrega o perfil', () => {
    expect(queryKeys.inbox()).toEqual(['team-conversations']);
    expect(queryKeys.inbox('profile-1')).toEqual(['team-conversations', 'profile-1']);
  });

  it('messages/reactions/memberProfile/performance/participantStats', () => {
    expect(queryKeys.messages('conv-1')).toEqual(['team-messages', 'conv-1']);
    expect(queryKeys.messages(null)).toEqual(['team-messages', null]);
    expect(queryKeys.reactions('conv-1')).toEqual(['team-reactions', 'conv-1']);
    expect(queryKeys.memberProfile('member-1')).toEqual(['team-member-profile', 'member-1']);
    expect(queryKeys.performance('conv-1')).toEqual(['departmentChat', 'performance', 'conv-1']);
    expect(queryKeys.participantStats('conv-1')).toEqual([
      'departmentChat',
      'participantStats',
      'conv-1',
    ]);
  });

  it('members() mantém o join dos ids de membro como último elemento', () => {
    expect(queryKeys.members('conv-1', ['m-1', 'm-2'])).toEqual([
      'team-group-members',
      'conv-1',
      'm-1,m-2',
    ]);
    expect(queryKeys.members('conv-1', [])).toEqual(['team-group-members', 'conv-1', '']);
  });

  it('departments.*', () => {
    expect(queryKeys.departments.list()).toEqual(['departmentChat', 'list']);
    expect(queryKeys.departments.members()).toEqual(['departmentChat', 'profiles']);
    expect(queryKeys.departments.invites('dept-1')).toEqual([
      'departmentChat',
      'invites',
      'dept-1',
    ]);
    expect(queryKeys.departments.audit('dept-1')).toEqual(['departmentChat', 'audit', 'dept-1']);
    expect(queryKeys.departments.whatsapp('dept-1')).toEqual([
      'departmentChat',
      'whatsapp',
      'dept-1',
    ]);
  });
});

describe('queryKeys — invalidação por prefixo (comportamento)', () => {
  it('inbox() sem argumento alcança o inbox de qualquer perfil', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.inbox('profile-1'), []);
    qc.setQueryData(queryKeys.inbox('profile-2'), []);
    qc.setQueryData(queryKeys.messages('conv-1'), []);

    await qc.invalidateQueries({ queryKey: queryKeys.inbox() });

    expect(invalidada(qc, queryKeys.inbox('profile-1'))).toBe(true);
    expect(invalidada(qc, queryKeys.inbox('profile-2'))).toBe(true);
    // Não é revalidação larga demais: a lista de mensagens não é tocada.
    expect(invalidada(qc, queryKeys.messages('conv-1'))).toBe(false);
  });

  it('inbox(profileId) NÃO alcança o inbox de outro perfil', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.inbox('profile-1'), []);

    await qc.invalidateQueries({ queryKey: queryKeys.inbox('profile-2') });

    expect(invalidada(qc, queryKeys.inbox('profile-1'))).toBe(false);
  });

  it('messages(cid) alcança só a conversa pedida', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.messages('conv-1'), []);
    qc.setQueryData(queryKeys.messages('conv-2'), []);
    qc.setQueryData(queryKeys.inbox('profile-1'), []);

    await qc.invalidateQueries({ queryKey: queryKeys.messages('conv-1') });

    expect(invalidada(qc, queryKeys.messages('conv-1'))).toBe(true);
    expect(invalidada(qc, queryKeys.messages('conv-2'))).toBe(false);
    expect(invalidada(qc, queryKeys.inbox('profile-1'))).toBe(false);
  });

  it('reactions(cid) alcança a query de reações da conversa', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(queryKeys.reactions('conv-1'), []);

    await qc.invalidateQueries({ queryKey: queryKeys.reactions('conv-1') });

    expect(invalidada(qc, queryKeys.reactions('conv-1'))).toBe(true);
  });
});
