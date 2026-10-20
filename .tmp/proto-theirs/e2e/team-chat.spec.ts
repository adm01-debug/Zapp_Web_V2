/** t_9de4f9f6 · E2E do chat interno (view=team-chat) em Chromium.
 *
 * Cobre os fluxos do TeamChat que o jsdom não alcança com fidelidade: abrir um
 * grupo, enviar, reagir, silenciar e os ticks de leitura da mensagem própria
 * (PE-70, view `team_message_read_state`) — mais a régua axe button-name/list na
 * tela com a conversa aberta.
 *
 * Metodologia: sessão fake + backend mockado (mapa-mocks.ts, talkx-demo.ts), sem
 * secrets e sem banco — mesmo padrão de e2e/a11y-inbox-teams.spec.ts (N-078).
 * Os mocks devolvem DADOS reais (não estado vazio) e mantêm estado mutável
 * (reações, silenciado, mensagem enviada) para que cada fluxo prove que a UI
 * reflete o que o backend recebeu — não só que um botão existe.
 *
 * `scripts/ci/check-e2e-specs.mjs` exige que o spec tenha um `test(` e falhe se o
 * backend real for tocado (`redeBarrada` vazio em todos os testes).
 */
import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import {
  bloquearRedeReal,
  json,
  mockAppShell,
  querObjetoUnico,
  type Registro,
} from './fixtures/mapa-mocks';
import { installFakeSession, FAKE_USER_ID } from './fixtures/talkx-demo';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

interface ViolacaoAxe {
  id: string;
  impact: string | null;
  nodes: { target: string[]; html: string }[];
}

async function violacoes(page: Page, regras: string[]): Promise<ViolacaoAxe[]> {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(
    async (ids) => {
      const win = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: ViolacaoAxe[] }> } };
      const r = await win.axe.run(document.body, { runOnly: { type: 'rule', values: ids } });
      return r.violations;
    },
    regras as string[],
  );
}

const MIN = 60 * 1000;
const iso = (deltaMs: number) => new Date(Date.now() + deltaMs).toISOString();

const CONVERSA_ID = 'conv-grupo-sintetico';
const OUTRO_ID = '00000000-0000-4000-8000-0000000000aa';
const OUTRO_NOME = 'Ana Sintetica';
const NOME_GRUPO = 'Equipe Sintetica';

/** Estado mutável do cenário: cada fluxo muda o backend falso e a UI tem que refletir. */
interface Cenario {
  silenciado: boolean;
  mensagens: MensagemRow[];
  reacoes: ReacaoRow[];
  envios: unknown[];
}

interface MensagemRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  media_url: null;
  media_type: null;
  media_bucket: null;
  media_path: null;
  reply_to_id: null;
  is_edited: boolean;
  created_at: string;
  updated_at: string;
  sender_name: string;
  sender_avatar: null;
}

interface ReacaoRow {
  id: string;
  message_id: string;
  profile_id: string;
  emoji: string;
  conversation_id: string;
  created_at: string;
}

function mensagem(id: string, senderId: string, senderNome: string, content: string, deltaMs: number): MensagemRow {
  const quando = iso(deltaMs);
  return {
    id,
    conversation_id: CONVERSA_ID,
    sender_id: senderId,
    content,
    message_type: 'text',
    media_url: null,
    media_type: null,
    media_bucket: null,
    media_path: null,
    reply_to_id: null,
    is_edited: false,
    created_at: quando,
    updated_at: quando,
    sender_name: senderNome,
    sender_avatar: null,
  };
}

function novoCenario(): Cenario {
  return {
    silenciado: false,
    // A RPC `get_team_messages_page` devolve DESC (mais novas primeiro).
    mensagens: [
      mensagem('msg-lida', FAKE_USER_ID, 'Visual E2E', 'Segue o relatorio do mes', -5 * MIN),
      mensagem('msg-ana', OUTRO_ID, OUTRO_NOME, 'Bom dia, tudo certo por aqui', -12 * MIN),
      mensagem('msg-entregue', FAKE_USER_ID, 'Visual E2E', 'Fechado o caixa de ontem', -30 * MIN),
      mensagem('msg-enviada', FAKE_USER_ID, 'Visual E2E', 'Bom dia a todos', -90 * MIN),
    ],
    reacoes: [],
    envios: [],
  };
}

/** Estado de leitura agregado (view `team_message_read_state`) para as próprias. */
function readStates(): unknown[] {
  return [
    { message_id: 'msg-lida', conversation_id: CONVERSA_ID, member_count: 2, read_count: 1, all_read: true },
    { message_id: 'msg-entregue', conversation_id: CONVERSA_ID, member_count: 2, read_count: 1, all_read: false },
    // 'msg-enviada' não tem linha: nenhuma leitura -> tick 'Enviado'.
  ];
}

async function montarChat(page: Page, registro: Registro, cenario: Cenario) {
  // A rede real é barrada PRIMEIRO: a última rota registrada vence no Playwright,
  // então as rotas específicas abaixo é que respondem (o bloqueio vale só para o que
  // escapou dos mocks — `registro.redeBarrada` tem de continuar vazio).
  await bloquearRedeReal(page, registro);
  await installFakeSession(page);
  await mockAppShell(page, registro);

  // ── Lista/inbox ────────────────────────────────────────────────────────────
  await page.route(/\/rest\/v1\/rpc\/get_team_inbox/, (route) =>
    json(route, [
      {
        conversation_id: CONVERSA_ID,
        unread_count: 0,
        last_message_at: iso(-5 * MIN),
        last_sender_id: FAKE_USER_ID,
        last_message_text: 'Segue o relatorio do mes',
      },
    ]),
  );
  await page.route(/\/rest\/v1\/team_conversations/, (route) => {
    if (route.request().method() !== 'GET') return json(route, null);
    const conversa = {
      id: CONVERSA_ID,
      name: NOME_GRUPO,
      type: 'group',
      created_by: OUTRO_ID,
      department_id: null,
      is_active: true,
      created_at: iso(-10 * 24 * 60 * MIN),
      updated_at: iso(-5 * MIN),
    };
    return json(route, querObjetoUnico(route) ? conversa : [conversa]);
  });
  await page.route(/\/rest\/v1\/team_conversation_members/, (route) =>
    json(route, [
      {
        id: 'membro-eu',
        conversation_id: CONVERSA_ID,
        profile_id: FAKE_USER_ID,
        is_muted: cenario.silenciado,
        role: 'member',
        joined_at: iso(-10 * 24 * 60 * MIN),
        profile: { id: FAKE_USER_ID, name: 'Visual E2E', avatar_url: null },
      },
      {
        id: 'membro-ana',
        conversation_id: CONVERSA_ID,
        profile_id: OUTRO_ID,
        is_muted: false,
        role: 'member',
        joined_at: iso(-10 * 24 * 60 * MIN),
        profile: { id: OUTRO_ID, name: OUTRO_NOME, avatar_url: null },
      },
    ]),
  );

  // ── Mensagens ──────────────────────────────────────────────────────────────
  await page.route(/\/rest\/v1\/rpc\/get_team_messages_page/, (route) =>
    json(route, [...cenario.mensagens].reverse()),
  );
  await page.route(/\/rest\/v1\/team_messages/, (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      const corpo = route.request().postDataJSON() as Record<string, unknown> & { content?: string };
      cenario.envios.push(corpo);
      const nova = mensagem(
        `msg-enviada-${cenario.envios.length}`,
        String(corpo.sender_id ?? FAKE_USER_ID),
        'Visual E2E',
        String(corpo.content ?? ''),
        -1 * MIN,
      );
      cenario.mensagens = [nova, ...cenario.mensagens];
      return json(route, querObjetoUnico(route) ? nova : [nova]);
    }
    return json(route, []);
  });

  // ── Leitura (PE-70) ────────────────────────────────────────────────────────
  await page.route(/\/rest\/v1\/team_message_read_state/, (route) => json(route, readStates()));

  // ── Reações ────────────────────────────────────────────────────────────────
  await page.route(/\/rest\/v1\/team_message_reactions/, (route) => json(route, cenario.reacoes));
  await page.route(/\/rest\/v1\/rpc\/toggle_team_reaction/, (route) => {
    const corpo = route.request().postDataJSON() as { p_message_id?: string; p_emoji?: string };
    const msgId = String(corpo.p_message_id ?? '');
    const emoji = String(corpo.p_emoji ?? '');
    const jaTem = cenario.reacoes.some(
      (r) => r.message_id === msgId && r.emoji === emoji && r.profile_id === FAKE_USER_ID,
    );
    if (jaTem) {
      cenario.reacoes = cenario.reacoes.filter(
        (r) => !(r.message_id === msgId && r.emoji === emoji && r.profile_id === FAKE_USER_ID),
      );
    } else {
      cenario.reacoes = [
        ...cenario.reacoes,
        {
          id: `reac-${cenario.reacoes.length + 1}`,
          message_id: msgId,
          profile_id: FAKE_USER_ID,
          emoji,
          conversation_id: CONVERSA_ID,
          created_at: iso(0),
        },
      ];
    }
    return json(route, null);
  });

  // ── Silenciar (membership) ─────────────────────────────────────────────────
  await page.route(/\/rest\/v1\/rpc\/set_team_member_pref/, (route) => {
    const corpo = route.request().postDataJSON() as { p_is_muted?: boolean };
    cenario.silenciado = corpo.p_is_muted === true;
    return json(route, null);
  });
}

function novoRegistro(): Registro {
  return { writesApp: [], mapbox: [], redeBarrada: [] };
}

async function abrirGrupo(page: Page): Promise<void> {
  await page.goto('/?view=team-chat');
  const lista = page.getByRole('list', { name: 'Conversas' });
  const item = lista.getByRole('listitem').filter({ hasText: NOME_GRUPO });
  await expect(item).toBeVisible({ timeout: 20_000 });
  await item.click();
  await expect(page.getByRole('banner', { name: 'Cabeçalho da conversa' }).getByText(NOME_GRUPO)).toBeVisible({
    timeout: 20_000,
  });
}

test.describe('Chat interno (team-chat) em Chromium', () => {
  test('abre o grupo pela lista e mostra a conversa com as mensagens', async ({ page }) => {
    const registro = novoRegistro();
    const cenario = novoCenario();
    await montarChat(page, registro, cenario);

    await abrirGrupo(page);

    const log = page.getByRole('log', { name: 'Mensagens da conversa' });
    await expect(log.getByText('Segue o relatorio do mes')).toBeVisible();
    await expect(log.getByText('Bom dia, tudo certo por aqui')).toBeVisible();
    expect(registro.redeBarrada).toEqual([]);
  });

  test('envia mensagem e o backend recebe conversa, remetente e texto', async ({ page }) => {
    const registro = novoRegistro();
    const cenario = novoCenario();
    await montarChat(page, registro, cenario);

    await abrirGrupo(page);

    const texto = 'Mensagem sintetica do e2e';
    const campo = page.getByRole('textbox', { name: 'Digite sua mensagem' });
    await campo.fill(texto);
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();

    // O backend falso guardou o INSERT real e a UI refez a busca mostrando a nova linha.
    await expect
      .poll(() => cenario.envios.length, { message: 'o insert não chegou ao backend' })
      .toBe(1);
    const envio = cenario.envios[0] as Record<string, unknown>;
    expect(envio.conversation_id).toBe(CONVERSA_ID);
    expect(envio.sender_id).toBe(FAKE_USER_ID);
    expect(envio.content).toBe(texto);

    const log = page.getByRole('log', { name: 'Mensagens da conversa' });
    await expect(log.getByText(texto)).toBeVisible();
    // O campo foi limpo após o envio bem-sucedido.
    await expect(campo).toHaveValue('');
    expect(registro.redeBarrada).toEqual([]);
  });

  test('reage com emoji e a reação persiste na mensagem do outro participante', async ({ page }) => {
    const registro = novoRegistro();
    const cenario = novoCenario();
    await montarChat(page, registro, cenario);

    await abrirGrupo(page);

    const alvo = page.locator(`[aria-label^="Mensagem de ${OUTRO_NOME}"]`);
    await expect(alvo).toBeVisible();
    // A tira de reação rápida fica sobreposta pelo balão da mensagem vizinha
    // (o clique real acerta o vizinho); o clique direto no botão dispara o onClick.
    const reagir = alvo.getByRole('button', { name: 'Reagir com 👍' });
    await expect(reagir).toBeVisible();
    await reagir.evaluate((el: HTMLButtonElement) => el.click());

    // O chip só sobrevive porque a RPC gravou de verdade (o GET seguinte traz a linha).
    await expect(alvo.getByRole('button', { name: '👍 1 reação' })).toBeVisible();
    expect(cenario.reacoes).toHaveLength(1);
    expect(cenario.reacoes[0].message_id).toBe('msg-ana');
    expect(cenario.reacoes[0].emoji).toBe('👍');
    expect(registro.redeBarrada).toEqual([]);
  });

  test('silencia a conversa e o menu passa a oferecer reativar as notificações', async ({ page }) => {
    const registro = novoRegistro();
    const cenario = novoCenario();
    await montarChat(page, registro, cenario);

    await abrirGrupo(page);

    const menu = page.getByRole('button', { name: 'Mais ações' });
    // O botão flutuante "Modo zen" fica sobreposto no canto superior direito e
    // intercepta o clique real; o gatilho do menu Radix abre por teclado.
    const abrirMenu = async () => {
      await menu.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('menu')).toBeVisible();
    };
    await abrirMenu();
    await page.getByRole('menuitem', { name: 'Silenciar' }).click();

    // A RPC gravou a preferência na membership (é ela que o painel lê).
    await expect.poll(() => cenario.silenciado, { message: 'set_team_member_pref não chegou' }).toBe(true);

    await abrirMenu();
    await expect(page.getByRole('menuitem', { name: 'Ativar notificações' })).toBeVisible();
    expect(registro.redeBarrada).toEqual([]);
  });

  test('ticks de leitura das mensagens próprias refletem enviado, entregue e lido (PE-70)', async ({ page }) => {
    const registro = novoRegistro();
    const cenario = novoCenario();
    await montarChat(page, registro, cenario);

    await abrirGrupo(page);

    const log = page.getByRole('log', { name: 'Mensagens da conversa' });
    // Em grupo, "lido" só acontece quando TODOS os outros leram (all_read da view).
    await expect(log.getByRole('img', { name: 'Lido por todos os participantes' })).toBeVisible();
    await expect(log.getByRole('img', { name: 'Entregue' })).toBeVisible();
    await expect(log.getByRole('img', { name: 'Enviado' })).toBeVisible();
    expect(registro.redeBarrada).toEqual([]);
  });

  test('axe button-name/list na conversa aberta não aponta violação', async ({ page }) => {
    const registro = novoRegistro();
    const cenario = novoCenario();
    await montarChat(page, registro, cenario);

    await abrirGrupo(page);
    // Mede a tela COM mensagem renderizada (barra de reação, ticks, envio):
    // sem dado, o axe mediria o estado vazio e não os controles reais.
    await expect(page.getByRole('log', { name: 'Mensagens da conversa' }).getByText('Segue o relatorio do mes')).toBeVisible();

    const v = await violacoes(page, ['button-name', 'list']);
    const resumo = v.map((viol) => `${viol.id} (${viol.impact}): ${viol.nodes.length} nó(s)`).join(' | ');
    expect(v, `chat interno: zero violações de button-name/list\n${resumo}`).toHaveLength(0);
    expect(registro.redeBarrada).toEqual([]);
  });
});
