/** N-078 · régua axe do Inbox e Teams nas regras button-name e list.
 *
 * O jsdom do teste de unidade nao renderiza layout e portanto nao mede
 * nem button-name (precisa de elemento visivel com nome acessivel) nem
 * list (precisa de estrutura de lista renderizada). Estas regras ficam
 * fora do alcance do jsdom — daqui o nome "camada que o jsdom nao alcanca".
 *
 * Metodologia: mesma estrutura de e2e/a11y-contraste.spec.ts — sessao fake
 * + backend mock (mapa-mocks.ts, talkx-demo.ts) + axe-core via addScriptTag.
 *
 * Os mocks devolvem DADOS (e nao listas vazias): o axe so mede o que esta
 * renderizado, e com lista vazia a tela mostra o estado vazio e a regua nao
 * chega a medir o item de lista. Por isso cada teste espera o item da lista
 * ficar visivel ANTES de rodar o axe.
 *
 * Para cada viewport (390x844 e 1280x900) e cada tela (Inbox e Teams,
 * view=team-chat), roda o AxeBuilder restrito a button-name e list e
 * espera zero violacoes.
 */
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { mockAppShell, json, bloquearRedeReal, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

interface ViolacaoAxe {
  id: string;
  impact: string | null;
  nodes: { target: string[]; html: string }[];
}

async function violacoes(
  page: Page,
  regras: string[],
): Promise<ViolacaoAxe[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async (ids) => {
      const win = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: ViolacaoAxe[] }> } };
      const axe = win.axe;
      const r = await axe.run(document.body, { runOnly: { type: 'rule', values: ids } });
      return r.violations;
    },
    regras as string[],
  );
}

async function semViolacao(
  page: Page,
  onde: string,
  regras: string[],
): Promise<void> {
  const v = await violacoes(page, regras);
  const resumo = v.map((viol) => `${viol.id} (${viol.impact}): ${viol.nodes.length} no(s)`).join(' | ');
  expect(v, `${onde}: zero violacoes de ${regras.join(', ')}\n${resumo}`).toHaveLength(0);
}

const DONO = '00000000-0000-4000-8000-000000000001';

// `conversation_status` e `assigned_to` nao sao decoracao: o filtro padrao da
// Inbox (chip "Em atendimento") so lista conversa com status open|waiting E
// assigned_to igual ao usuario logado; sem esses dois campos a lista cai no
// estado vazio ("Sem conversas") e a regua mediria a tela vazia, nao o item.
const CONTATOS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Contato Sintetico Um',
    conversation_status: 'open',
    assigned_to: DONO,
    queue_id: null,
    unread_messages: 0,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-09T12:00:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Contato Sintetico Dois',
    conversation_status: 'open',
    assigned_to: DONO,
    queue_id: null,
    unread_messages: 0,
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-09T12:00:00.000Z',
  },
];

const MENSAGENS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    contact_id: '11111111-1111-4111-8111-111111111111',
    content: 'Mensagem sintetica do contato um',
    sender: 'contact',
    is_read: true,
    created_at: '2026-10-09T12:00:00.000Z',
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    contact_id: '22222222-2222-4222-8222-222222222222',
    content: 'Mensagem sintetica do contato dois',
    sender: 'contact',
    is_read: true,
    created_at: '2026-10-09T12:30:00.000Z',
  },
];

/** Inbox com contatos e mensagens: a lista precisa de item renderizado para o
 * axe medir button-name/list no item, e nao no estado vazio. */
async function mockInboxComDados(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, CONTATOS));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, MENSAGENS));
  await page.route(
    /\/rest\/v1\/rpc\/(search_contacts|contacts_count_by_type|get_last_message_dates|can_delete_contacts)/,
    (route) => json(route, []),
  );
}

const CONVERSAS_EQUIPE = [
  {
    conversation_id: '33333333-3333-4333-8333-333333333333',
    conversation_name: 'Equipe Sintetica Um',
    conversation_type: 'group',
    department_id: null,
    is_muted: false,
    last_message_at: '2026-10-09T12:00:00.000Z',
    last_message_text: 'Mensagem sintetica da equipe um',
    last_sender_id: '00000000-0000-4000-8000-000000000002',
    member_count: 2,
    unread_count: 0,
  },
  {
    conversation_id: '44444444-4444-4444-8444-444444444444',
    conversation_name: 'Equipe Sintetica Dois',
    conversation_type: 'group',
    department_id: null,
    is_muted: false,
    last_message_at: '2026-10-09T12:30:00.000Z',
    last_message_text: 'Mensagem sintetica da equipe dois',
    last_sender_id: '00000000-0000-4000-8000-000000000002',
    member_count: 2,
    unread_count: 0,
  },
];

const TABELA_CONVERSAS = CONVERSAS_EQUIPE.map((c) => ({
  id: c.conversation_id,
  type: c.conversation_type,
  name: c.conversation_name,
  avatar_url: null,
  created_by: '00000000-0000-4000-8000-000000000001',
  created_at: '2026-10-01T12:00:00.000Z',
  updated_at: c.last_message_at,
  department_id: null,
}));

const MEMBROS = CONVERSAS_EQUIPE.map((c) => ({
  conversation_id: c.conversation_id,
  profile_id: '00000000-0000-4000-8000-000000000001',
  joined_at: '2026-10-01T12:00:00.000Z',
  last_read_at: null,
  is_muted: false,
  member_role: 'member',
  profile: {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Usuario Sintetico',
    email: 'sintetico@example.invalid',
    avatar_url: null,
    is_active: true,
  },
}));

/** Teams com conversas: a lista precisa de uma opcao renderizada para o axe
 * medir button-name/list no item, e nao no estado vazio. */
async function mockTeamsComDados(page: Page): Promise<void> {
  await page.route(/\/rest\/v1\/rpc\/get_team_inbox/, (route) => json(route, CONVERSAS_EQUIPE));
  await page.route(/\/rest\/v1\/team_conversations/, (route) => json(route, TABELA_CONVERSAS));
  await page.route(/\/rest\/v1\/team_conversation_members/, (route) => json(route, MEMBROS));
  await page.route(/\/rest\/v1\/rpc\/get_team_messages_page/, (route) => json(route, []));
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('N-078 · a11y: button-name e list no Inbox e Teams', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await bloquearRedeReal(page, registro);
    await mockAppShell(page, registro);
    await installFakeSession(page);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  // Inbox — desktop 1280x900
  test.describe('viewport desktop 1280x900', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('Inbox: zero violacoes button-name e list', async ({ page }) => {
      await mockInboxComDados(page);
      await page.goto('/?view=inbox');
      await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 20_000 });
      await semViolacao(page, 'Inbox desktop', ['button-name', 'list']);
    });

    test('Teams (team-chat): zero violacoes button-name e list', async ({ page }) => {
      await mockTeamsComDados(page);
      await page.goto('/?view=team-chat');
      await expect(page.getByRole('option').first()).toBeVisible({ timeout: 20_000 });
      await semViolacao(page, 'Teams desktop', ['button-name', 'list']);
    });
  });

  // Inbox e Teams — mobile 390x844
  test.describe('viewport movel 390x844', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Inbox mobile: zero violacoes button-name e list', async ({ page }) => {
      await mockInboxComDados(page);
      await page.goto('/?view=inbox');
      await expect(page.getByTestId('conversation-item').first()).toBeVisible({ timeout: 20_000 });
      await semViolacao(page, 'Inbox mobile', ['button-name', 'list']);
    });

    test('Teams mobile (team-chat): zero violacoes button-name e list', async ({ page }) => {
      await mockTeamsComDados(page);
      await page.goto('/?view=team-chat');
      await expect(page.getByRole('option').first()).toBeVisible({ timeout: 20_000 });
      await semViolacao(page, 'Teams mobile', ['button-name', 'list']);
    });
  });
});
