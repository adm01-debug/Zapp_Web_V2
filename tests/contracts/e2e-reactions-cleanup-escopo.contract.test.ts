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
 * Prova por comportamento: chama a função REAL com uma `page` falsa (storageState
 * da sessão + `request.get/delete`) e inspeciona a URL do DELETE emitido.
 * Antes da correção a URL não carregava escopo de conversa (vermelho); agora ela
 * lista os `message_id` obtidos exclusivamente do contato fixture (verde).
 */
import { describe, expect, it, vi } from 'vitest';

import {
  E2E_FIXTURE_CONTACT_ID,
  cleanupE2EReactions,
} from '../../e2e/fixtures/e2e-contact';
import { SUPABASE_STORAGE_KEY } from '../../e2e/fixtures/supabase-env';

// Profile do usuário logado (é o que `profiles.user_id = auth.uid()` resolve).
const PROFILE_ID = '9c0a6f3e-3b1c-4a6e-9b3a-4d2e8f7a1b55';
const MESSAGE_IDS = [
  '9d2be544-9875-4107-989f-1f9c4dff1dd4',
  'b86bc791-4626-497b-a93a-4984d08fd836',
];
// Mensagem de outra conversa: nunca pode entrar no filtro de limpeza.
const OUTRA_MENSAGEM = '526f9eeb-a645-44da-af4d-dc719d940c70';

function fakePage() {
  const deletes: string[] = [];
  const gets: string[] = [];
  let profileLookupOk = true;
  const expectedOrigin = new URL(
    process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
  ).origin;

  const page = {
    context: vi.fn(() => ({
      storageState: vi.fn(async () => ({
        cookies: [],
        origins: [{
          origin: expectedOrigin,
          localStorage: [{
            name: SUPABASE_STORAGE_KEY,
            value: JSON.stringify({
              access_token: 'token-de-teste',
              user: { id: 'auth-user-id' },
            }),
          }],
        }],
      })),
    })),
    request: {
      get: vi.fn(async (url: string) => {
        gets.push(url);
        if (new URL(url).pathname === '/rest/v1/profiles') {
          return profileLookupOk
            ? { ok: () => true, json: async () => [{ id: PROFILE_ID }] }
            : { ok: () => false, json: async () => [] };
        }
        return {
          ok: () => true,
          status: () => 200,
          text: async () => '',
          json: async () => MESSAGE_IDS.map((id) => ({ id })),
        };
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
  it('apaga as reações do usuário logado APENAS nas mensagens do contato fixture', async () => {
    const { page, deletes } = fakePage();

    await cleanupE2EReactions(page as never);

    expect(deletes).toHaveLength(1);
    const url = new URL(deletes[0]!);
    expect(url.pathname).toBe('/rest/v1/message_reactions');
    expect(url.searchParams.get('user_id')).toBe(`eq.${PROFILE_ID}`);
    expect(url.searchParams.get('message_id')).toBe(`in.(${MESSAGE_IDS.join(',')})`);
    expect(url.searchParams.has('contact_id')).toBe(false);
  });

  it('não emite filtro global (só user_id) que alcançaria outras conversas', async () => {
    const { page, deletes } = fakePage();

    await cleanupE2EReactions(page as never);

    const url = new URL(deletes[0]!);
    // Forma do defeito: só user_id casa a reação do usuário em qualquer
    // conversa (o `using` da policy não restringe a mensagem).
    expect(url.search).not.toBe(`?user_id=eq.${PROFILE_ID}`);
    const mensagensDoFiltro = url.searchParams.get('message_id');
    expect(mensagensDoFiltro).toContain(MESSAGE_IDS[0]);
    expect(mensagensDoFiltro).not.toContain(OUTRA_MENSAGEM);
  });

  it('resolve o profile do usuário logado (não usa id fixo) antes de apagar', async () => {
    const { page, gets, deletes } = fakePage();

    await cleanupE2EReactions(page as never);

    expect(gets).toHaveLength(2);
    const lookup = new URL(gets.find((url) => new URL(url).pathname === '/rest/v1/profiles')!);
    expect(lookup.pathname).toBe('/rest/v1/profiles');
    expect(lookup.searchParams.get('user_id')).toBe('eq.auth-user-id');
    const messages = new URL(gets.find((url) => new URL(url).pathname === '/rest/v1/messages')!);
    expect(messages.searchParams.get('contact_id')).toBe(`eq.${E2E_FIXTURE_CONTACT_ID}`);
    expect(deletes).toHaveLength(1);
  });

  it('não apaga nada quando o profile do caller não é resolvido', async () => {
    const { page, deletes, failProfileLookup } = fakePage();
    failProfileLookup();

    await cleanupE2EReactions(page as never);

    expect(deletes).toHaveLength(0);
  });
});
