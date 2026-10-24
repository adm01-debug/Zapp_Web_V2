/**
 * R2-INF-006 / item 96 (P1, área testes) — "Limpeza de E2E apaga todas as reações
 * do usuário logado".
 *
 * Defeito: `cleanupE2EReactions` (e2e/fixtures/e2e-contact.ts) emitia
 * `DELETE /rest/v1/message_reactions?user_id=eq.<profile>` — filtro **só** por
 * `user_id`. A policy de DELETE da tabela é
 * `user_id IN (SELECT profiles.id WHERE profiles.user_id = auth.uid())`, ou seja,
 * não restringe por contato/mensagem: qualquer execução do E2E (inclusive com a
 * conta de QA logada) apagava TODAS as reações daquele usuário, em qualquer
 * conversa, não apenas as do contato de teste `[E2E]`.
 *
 * Prova por comportamento: chama a função REAL com uma `page` falsa (o único uso
 * dela é `evaluate` + `request.get/delete`) e inspeciona a URL do DELETE emitido.
 * Antes da correção a URL não carrega escopo de contato (vermelho); depois passa a
 * carregar `contact_id=eq.<fixture>` (verde).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  E2E_FIXTURE_CONTACT_ID,
  cleanupE2EReactions,
} from '../../e2e/fixtures/e2e-contact';

// Profile do usuário logado (é o que `profiles.user_id = auth.uid()` resolve).
const PROFILE_ID = '9c0a6f3e-3b1c-4a6e-9b3a-4d2e8f7a1b55';
// Reação real desse usuário numa conversa QUALQUER (não é o contato fixture).
const OUTRO_CONTATO = '526f9eeb-a645-44da-af4d-dc719d940c70';

function fakePage() {
  const deletes: string[] = [];
  const gets: string[] = [];
  let profileLookupOk = true;

  const page = {
    evaluate: vi.fn(async () => ({
      access_token: 'token-de-teste',
      user_id: 'auth-user-id',
    })),
    request: {
      get: vi.fn(async (url: string) => {
        gets.push(url);
        return profileLookupOk
          ? { ok: () => true, json: async () => [{ id: PROFILE_ID }] }
          : { ok: () => false, json: async () => [] };
      }),
      delete: vi.fn(async (url: string) => {
        deletes.push(url);
        return { ok: () => true, status: 200, json: async () => [{ id: 'r1' }] };
      }),
    },
  };

  return {
    page,
    deletes,
    gets,
    failProfileLookup: () => {
      profileLookupOk = false;
    },
  };
}

describe('cleanupE2EReactions — escopo do DELETE (R2-INF-006)', () => {
  it('apaga as reações do usuário logado APENAS no contato fixture', async () => {
    const { page, deletes } = fakePage();

    await cleanupE2EReactions(page as never);

    expect(deletes).toHaveLength(1);
    const url = new URL(deletes[0]!);
    expect(url.pathname).toBe('/rest/v1/message_reactions');
    expect(url.searchParams.get('user_id')).toBe(`eq.${PROFILE_ID}`);
    // O DEFEITO era exatamente a ausência deste parâmetro.
    expect(url.searchParams.get('contact_id')).toBe(`eq.${E2E_FIXTURE_CONTACT_ID}`);
  });

  it('não emite filtro global (só user_id) que alcançaria outras conversas', async () => {
    const { page, deletes } = fakePage();

    await cleanupE2EReactions(page as never);

    const url = new URL(deletes[0]!);
    // Forma do defeito: sem contato, o filtro casa a reação do usuário em
    // qualquer conversa (o `using` da policy só conhece `user_id`).
    expect(url.search).not.toBe(`?user_id=eq.${PROFILE_ID}`);
    // O filtro emitido tem de distinguir o contato fixture de OUTRO contato.
    const contatoDoFiltro = url.searchParams.get('contact_id')?.replace(/^eq\./, '');
    expect(contatoDoFiltro).toBe(E2E_FIXTURE_CONTACT_ID);
    expect(contatoDoFiltro).not.toBe(OUTRO_CONTATO);
  });

  it('resolve o profile do usuário logado (não usa id fixo) antes de apagar', async () => {
    const { page, gets, deletes } = fakePage();

    await cleanupE2EReactions(page as never);

    expect(gets).toHaveLength(1);
    const lookup = new URL(gets[0]!);
    expect(lookup.pathname).toBe('/rest/v1/profiles');
    expect(lookup.searchParams.get('user_id')).toBe('eq.auth-user-id');
    expect(deletes).toHaveLength(1);
  });

  it('não apaga nada quando o profile do caller não é resolvido', async () => {
    const { page, deletes, failProfileLookup } = fakePage();
    failProfileLookup();

    await cleanupE2EReactions(page as never);

    expect(deletes).toHaveLength(0);
  });
});
