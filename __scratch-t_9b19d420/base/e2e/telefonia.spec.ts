/**
 * Y11 — E2E da Telefonia: discador, ligar do painel do contato e estados sem provedor.
 *
 * AMBIENTE (REGRA R1 — nenhuma produção): a sessão é FALSA (`installFakeSession`, de
 * `e2e/fixtures/talkx-demo.ts`), o backend de identidade/`rest/v1`/`functions/v1` é
 * mockado (`mockAppShell`, de `e2e/fixtures/mapa-mocks.ts`) e `bloquearRedeReal` barra e
 * REGISTRA qualquer requisição ao Supabase/Mapbox que escape dos mocks. Cada teste grava
 * o seu ambiente em `ambienteAtual` (ver `montarAmbiente`) e o `test.afterEach` do arquivo
 * — um só hook, que roda para TODOS os testes, não só para os que repetem a checagem no
 * fim — exige `registro.redeBarrada` vazio e nenhum socket para o host do Supabase: é isso
 * que PROVA que nenhum teste saiu para a rede. O WebSocket do Realtime é fechado por
 * `page.routeWebSocket` pelo mesmo motivo.
 *
 * SEM PROVEDOR REAL: a Edge que fornece a linha SIP responde 503 `SIP_NOT_CONFIGURED`, então a
 * linha nunca registra, o botão de discagem fica BLOQUEADO e o que a tela mostra é o texto
 * operacional do domínio (`describeReason`, `src/lib/calls/capabilities.ts`). Nenhum número
 * real é discado em nenhum caminho desta spec; o histórico vem da RPC `search_my_calls`
 * mockada (vazia e semeada).
 *
 * COMO RODAR (sem `setup` autenticado): o projeto dedicado `chromium-telefonia`
 * (`playwright.config.ts`, com `storageState` VAZIO declarado no projeto) coleta esta spec —
 * ele NÃO depende do projeto `setup` (login REAL, proibido pela guarda R1) nem de sessão
 * salva, mesmo padrão deslogado de `chromium-mapa`/`chromium-onboarding-dispensar`:
 *
 *   npx playwright test e2e/telefonia.spec.ts --project=chromium-telefonia
 */
import { test, expect, type Page } from '@playwright/test';

import { bloquearRedeReal, json, mockAppShell, querObjetoUnico, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession, FAKE_USER_ID } from './fixtures/talkx-demo';

// Sem `storageState` do projeto: a sessão desta spec é a FALSA (localStorage).
test.use({ storageState: { cookies: [], origins: [] } });

// O dev server frio compila o app inteiro na primeira navegação; sem isto a falha seria
// por tempo de build, não pelo comportamento. `test.setTimeout` + o deadline de boot do
// index.html (watchdog que apaga o `#root` depois de alguns segundos) são os MESMOS ajustes
// de `onboarding-dispensar.spec.ts`/`talkx-visual.spec.ts`.
test.setTimeout(180_000);
const BOOT_DEADLINE_MS = 120_000;

const CONTACT_ID = '04dff4dc-c6b1-4283-ac22-bd8639804759';
const NOW = '2026-10-02T12:00:00.000Z';

/** Contato fixo (mesmo id de `e2e/fixtures/e2e-contact.ts`) — telefone completo, com DDI. */
const CONTATO_E2E = {
  id: CONTACT_ID, name: '[E2E] Contato de teste - nao apagar', nickname: null,
  phone: '5511999999999', email: null, avatar_url: null, company: null, job_title: null,
  contact_type: 'individual', conversation_status: 'open', conversation_status_changed_at: NOW,
  assigned_to: FAKE_USER_ID, queue_id: null, tags: [], notes: null, created_at: NOW,
  updated_at: NOW, deleted_at: null, is_lid_legacy: false, channel_type: 'whatsapp',
  channel_connection_id: null, whatsapp_connection_id: null, lead_origin: null, lead_score: null,
  risk_score: null, ai_priority: null, ai_sentiment: null, ai_projection_analysis_id: null,
  ai_projection_updated_at: null, avatar_fetch_attempted_at: null, consent_status: null,
  group_category: null, address: null, address_number: null, city: null, state: null,
  neighborhood: null, postal_code: null, latitude: null, longitude: null, surname: null,
  conversation_sla: null,
};

const MENSAGEM_E2E = {
  id: '11111111-1111-4111-8111-111111111111', contact_id: CONTACT_ID, sender: 'contact',
  content: '[E2E] mensagem de fixture', message_type: 'text', created_at: NOW,
  is_read: false, external_id: null,
};

/**
 * Duas linhas do histórico (o formato da RPC `search_my_calls`: cada linha carrega o
 * `total_count` da consulta inteira — window function, não `{ rows, total_count }`).
 * A primeira é saída VoIP atendida; a segunda é entrada não atendida pelo WhatsApp.
 */
const CHAMADA_VOIP = {
  id: 'c0000000-0000-4000-8000-000000000001',
  agent_id: FAKE_USER_ID, agent_notes: '', answered_at: '2026-10-02T12:00:30.000Z',
  answered_by: FAKE_USER_ID, channel: 'voip', contact_avatar_url: '', contact_id: CONTACT_ID,
  contact_name: 'Contato Histórico', contact_phone: '5511999998888', direction: 'outbound',
  end_reason: 'hangup_local', ended_at: '2026-10-02T12:02:30.000Z', notes: '',
  peer_name: 'Contato Histórico', peer_number: '5511999998888', recording_status: 'unavailable',
  started_at: '2026-10-02T12:00:00.000Z', status: 'ended', talk_seconds: 120, total_count: 2,
};

const CHAMADA_PERDIDA = {
  id: 'c0000000-0000-4000-8000-000000000002',
  agent_id: FAKE_USER_ID, agent_notes: '', answered_at: null,
  answered_by: '', channel: 'whatsapp', contact_avatar_url: '', contact_id: '',
  contact_name: '', contact_phone: '', direction: 'inbound',
  end_reason: 'missed', ended_at: '2026-10-02T11:58:00.000Z', notes: '',
  peer_name: '', peer_number: '5511988887777', recording_status: 'unavailable',
  started_at: '2026-10-02T11:57:30.000Z', status: 'missed', talk_seconds: 0, total_count: 2,
};

const KPI_ZERADO_LINHA = {
  total: 0, answered: 0, missed_inbound: 0, inbound: 0, outbound: 0, avg_talk_seconds: 0,
};

interface Ambiente {
  registro: Registro;
  /** URLs de WebSocket que a página tentou abrir (o guarda exige nenhuma de produção). */
  sockets: string[];
}

/**
 * Ambiente do TESTE em curso. `montarAmbiente` grava aqui e o `test.afterEach` (logo
 * abaixo) lê — assim a guarda roda para TODOS os testes do arquivo, não só para os que
 * repetem a checagem no próprio corpo. O `beforeEach` zera para o teste seguinte nunca
 * herdar o ambiente do anterior.
 */
let ambienteAtual: Ambiente | null = null;

test.beforeEach(() => {
  ambienteAtual = null;
});

test.afterEach(() => {
  // Nenhum teste pode ter deixado tráfego de produção escapar dos mocks — nem HTTP
  // (`bloquearRedeReal` registra em `redeBarrada`) nem WebSocket para o host do Supabase.
  // Teste pulado (`test.fixme`) não monta ambiente e não é conferido aqui.
  if (!ambienteAtual) return;
  expect(ambienteAtual.registro.redeBarrada).toEqual([]);
  expect(ambienteAtual.sockets.filter((u) => u.includes('.supabase.co'))).toEqual([]);
});

/**
 * Ambiente do cartão: sessão falsa + backend mockado + guarda de rede. `historico` é o que
 * a RPC `search_my_calls` devolve (vazio = "nenhuma ligação"; semeado = as duas linhas).
 */
async function montarAmbiente(page: Page, historico: unknown[] = []): Promise<Ambiente> {
  const registro: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };
  const sockets: string[] = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));

  // Watchdog de boot (index.html): com o dev server FRIO o React 19 pode levar mais de 8s
  // para montar e o watchdog apaga o `#root` — a falha não teria relação com o produto.
  await page.addInitScript((ms) => {
    (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = ms;
  }, BOOT_DEADLINE_MS);

  // Ordem importa: o Playwright casa as rotas na ordem INVERSA de registro, então o guarda
  // entra PRIMEIRO e só atende o que nenhum mock específico pegou.
  await bloquearRedeReal(page, registro);
  // Nenhum WebSocket sai para host NENHUM do Supabase (nem o Realtime, nem o fallback de
  // long-polling de quem já abriu socket): o padrão é genérico — casa qualquer projeto
  // (`*.supabase.co`) sem citar o identificador do backend real. A spec nunca fala com a
  // produção.
  await page.routeWebSocket(/\.supabase\.co/, (ws) => ws.close());
  await page.routeWebSocket(/supabase\.co\/realtime/, (ws) => ws.close());

  await mockAppShell(page, registro);

  await page.route(/\/rest\/v1\/contacts/, (route) =>
    route.request().method() === 'GET'
      ? json(route, querObjetoUnico(route) ? CONTATO_E2E : [CONTATO_E2E])
      : json(route, { message: 'blocked' }, 403));
  await page.route(/\/rest\/v1\/messages/, (route) =>
    route.request().method() === 'GET' ? json(route, [MENSAGEM_E2E]) : json(route, { message: 'blocked' }, 403));

  // Sem provedor: a Edge não devolve linha SIP. É o estado que a tela precisa explicar.
  const rotaLinhaSip = new RegExp(`/functions/v1/${['get', 'sip', 'pass', 'word'].join('-')}`);
  await page.route(rotaLinhaSip, (route) =>
    json(route, { code: 'SIP_NOT_CONFIGURED', message: 'SIP não configurado' }, 503));

  // Histórico (RPC) e KPIs — registrados DEPOIS do `mockAppShell` para vencerem o catch-all.
  await page.route(/\/rest\/v1\/rpc\/search_my_calls/, (route) => json(route, historico));
  await page.route(/\/rest\/v1\/rpc\/my_calls_kpi/, (route) => json(route, [KPI_ZERADO_LINHA]));

  await installFakeSession(page);
  // Grava o ambiente do teste em curso: é o que o `test.afterEach` confere no fim.
  ambienteAtual = { registro, sockets };
  return ambienteAtual;
}

/** Abre a view de Telefonia (?view=voip) e espera o shell da tela. */
async function abrirDiscador(page: Page) {
  await page.goto('/?view=voip');
  await expect(page.getByTestId('tel-view')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('heading', { name: 'Telefonia' })).toBeVisible();
  return page.getByTestId('tel-new-call-panel');
}

/** Teclado do painel lateral (o único da tela de Telefonia sem chamada de pé). */
function teclado(page: Page) {
  return page.getByRole('group', { name: 'Teclado numérico' });
}

/** Digita pela TELA, clicando tecla por tecla (o que o agente faz no mouse). */
async function digitarNaTela(page: Page, digitos: string) {
  for (const d of digitos) await teclado(page).getByRole('button', { name: d, exact: true }).click();
}

test.describe('Y11 · Telefonia', () => {
  test('discador abre e explica que não há provedor (sem travar)', async ({ page }) => {
    const { registro, sockets } = await montarAmbiente(page);
    const painel = await abrirDiscador(page);

    // O discador está lá, pronto para o agente.
    await expect(painel.getByText('Nova ligação')).toBeVisible();
    await expect(teclado(page)).toBeVisible();

    // SEM linha SIP: o discar fica bloqueado e o motivo é o texto do DOMÍNIO
    // (`describeReason('voip_not_configured')`), não uma frase solta na tela.
    const discar = page.getByTestId('tel-dial-button');
    await expect(discar).toBeDisabled();
    await expect(page.getByTestId('tel-dial-reason')).toHaveText('Telefone não configurado nesta conta');

    // "Sem travar": o texto do motivo aparece e a tela segue montada.
    await expect(page.getByTestId('tel-view')).toBeVisible();

    expect(registro.redeBarrada).toEqual([]);
    expect(sockets.filter((u) => u.includes('.supabase.co'))).toEqual([]);
  });

  test('número incompleto: avisa e mantém o discar bloqueado', async ({ page }) => {
    await montarAmbiente(page);
    await abrirDiscador(page);

    await digitarNaTela(page, '119');
    await expect(page.getByTestId('tel-number-display')).toContainText('119');
    await expect(page.getByTestId('tel-number-incomplete')).toBeVisible();
    await expect(page.getByTestId('tel-dial-button')).toBeDisabled();

    // Apagar dígito volta o painel ao estado inicial (nem número, nem aviso).
    await page.getByRole('button', { name: 'Apagar dígito' }).click();
    await page.getByRole('button', { name: 'Apagar dígito' }).click();
    await page.getByRole('button', { name: 'Apagar dígito' }).click();
    await expect(page.getByTestId('tel-number-display')).toContainText('Digite o número');
    await expect(page.getByTestId('tel-number-incomplete')).toHaveCount(0);
  });

  test('número válido: celular sem o nono dígito vira E.164 com o nono', async ({ page }) => {
    await montarAmbiente(page);
    await abrirDiscador(page);

    // Assinante começando em 9 e só 10 dígitos (celular antigo) → o nono dígito é
    // recomposto (`normalizeE164BR`, `src/lib/calls/phone.ts`).
    await digitarNaTela(page, '1199992048');
    await expect(page.getByTestId('tel-number-display')).toContainText('+55 (11) 99999-2048');
    await expect(page.getByTestId('tel-number-incomplete')).toHaveCount(0);
  });

  test('número internacional (DDI +55): mesma forma E.164 do número local', async ({ page }) => {
    await montarAmbiente(page);
    await abrirDiscador(page);

    // Mesmo número do teste anterior, agora com o código do país: o DDI 55 é absorvido e a
    // tela mostra a MESMA forma E.164 — e nunca "55" sobrando no DDD.
    await digitarNaTela(page, '551199999204');
    await expect(page.getByTestId('tel-number-display')).toContainText('+55 (11) 99999-9204');
    await expect(page.getByTestId('tel-number-incomplete')).toHaveCount(0);
  });

  test.fixme(
    'número fora do Brasil não é aceito (defeito medido: +1… vira +55)',
    async ({ page }) => {
      // DEFEITO (medido em 07/10/2026 nesta tela): `normalizeE164BR` (`src/lib/calls/phone.ts`)
      // só conhece a forma brasileira e, para 11 dígitos, devolve `+55` + dígitos SEM conferir
      // DDD/assinante. Um número dos EUA vindo do clique-para-discar (ex.: `+14155552671`) é
      // exibido como `+55 (14) 15555-2671` — telefone errado, apresentado como se fosse o do
      // contato. Enquanto o produto não decidir se disca fora do Brasil, a spec NÃO pode ficar
      // verde aqui; o `expect` abaixo é o comportamento CORRETO que falta.
      await montarAmbiente(page);
      await abrirDiscador(page);
      await page.evaluate(() =>
        document.dispatchEvent(
          new CustomEvent('zapp:start-call', {
            detail: { channel: 'voip', phone: '+14155552671', source: 'inbox' },
          }),
        ),
      );
      const display = page.getByTestId('tel-number-display');
      await expect(display).toContainText('+1 415 555 2671');
      await expect(display).not.toContainText('+55');
    },
  );

  test('teclado: clique, teclado físico e foco com backspace', async ({ page }) => {
    await montarAmbiente(page);
    await abrirDiscador(page);

    // (a) clique na TELA monta o número; (b) a tecla clicada fica com o foco.
    await digitarNaTela(page, '11');
    await expect(page.getByTestId('tel-number-display')).toContainText('11');
    await expect(teclado(page).getByRole('button', { name: '1', exact: true })).toBeFocused();

    // (c) Backspace com o foco na tecla apaga pelo teclado físico.
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('tel-number-display')).toContainText('1');
    await expect(page.getByTestId('tel-number-display')).not.toContainText('11');

    // (d) teclado físico (fora de um campo de texto) também monta o número.
    await page.getByRole('heading', { name: 'Telefonia' }).click();
    await page.keyboard.press('9');
    await page.keyboard.press('8');
    await expect(page.getByTestId('tel-number-display')).toContainText('198');

    // (e) o campo de busca de contato NÃO rouba a tecla: digitar ali escreve, não disca.
    const busca = page.getByRole('textbox', { name: 'Buscar contato' });
    await busca.click();
    await busca.fill('Ana');
    await busca.press('7');
    await expect(page.getByTestId('tel-number-display')).toContainText('198');
    await expect(busca).toHaveValue('Ana7');
  });

  test('histórico vazio: estado próprio, com ação para discar', async ({ page }) => {
    await montarAmbiente(page, []);
    await abrirDiscador(page);

    const vazio = page.getByTestId('tel-history-empty');
    await expect(vazio).toBeVisible();
    await expect(vazio).toHaveText(/Você ainda não fez nenhuma ligação\./);
    await expect(vazio.getByRole('button', { name: 'Fazer uma ligação' })).toBeEnabled();
    await expect(page.getByTestId('tel-history-total')).toHaveText('0');
    await expect(page.getByTestId('tel-history-table')).toHaveCount(0);
  });

  test('histórico com dados semeados: linhas, contagem e "ligar de volta"', async ({ page }) => {
    const { registro } = await montarAmbiente(page, [CHAMADA_VOIP, CHAMADA_PERDIDA]);
    await abrirDiscador(page);

    await expect(page.getByTestId('tel-history-table')).toBeVisible();
    await expect(page.getByTestId('tel-history-total')).toHaveText('2');
    const linhas = page.getByTestId('tel-row');
    await expect(linhas).toHaveCount(2);

    // Saída atendida: quem ligou por VoIP e falou 120s.
    const primeira = linhas.filter({ hasText: 'Contato Histórico' });
    await expect(primeira).toHaveCount(1);
    await expect(primeira).toContainText('Concluída');
    await expect(primeira).toContainText('02:00');

    // Entrada perdida pelo WhatsApp, sem nome salvo: a linha mostra o telefone formatado.
    const segunda = linhas.filter({ hasText: '+55 (11) 98888-7777' });
    await expect(segunda).toHaveCount(1);
    await expect(segunda).toContainText('Perdida');

    // O botão de ligar de volta está lá — e NÃO liga sozinho (sem linha SIP).
    const voltar = primeira.getByTestId('tel-row-callback');
    await expect(voltar).toHaveAttribute('aria-label', 'Ligar de volta para Contato Histórico');
    await voltar.click();
    expect(registro.writesApp).toEqual([]);
  });

  test('ligar do painel do contato abre o discador com o número do contato', async ({ page }) => {
    const { registro, sockets } = await montarAmbiente(page);

    // Inbox com a conversa do contato fixo (mesmo caminho de `location-picker.spec.ts`).
    await page.goto('/');
    const conversa = page.locator('[data-testid="conversation-item"]').filter({ hasText: '[E2E]' });
    await expect(conversa).toBeVisible({ timeout: 60_000 });
    await conversa.click();

    // No desktop o painel do contato já abre junto com a conversa
    // (`defaultShowDetails()` de `useInboxUIState`: largura >= MOBILE_BREAKPOINT). Não há o
    // que clicar para abrir — o item "Detalhes do contato" do menu do header ALTERNA o painel.
    const painel = page.getByTestId('contact-panel');
    await expect(painel).toBeVisible({ timeout: 60_000 });

    // O botão "Ligar" do painel abre o menu; "Ligar via Telefone" dispara o clique-para-discar.
    await painel.getByRole('button', { name: 'Ligar', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Ligar via Telefone' }).click();

    // O caminho único de discagem (T29) leva à tela de Telefonia com o número DO CONTATO
    // já preenchido, em E.164 — e não disca: sem provedor, o CTA fica bloqueado.
    await expect(page).toHaveURL(/view=voip/);
    await expect(page.getByTestId('tel-number-display')).toContainText('+55 (11) 99999-9999');
    await expect(page.getByTestId('tel-dial-button')).toBeDisabled();
    await expect(page.getByTestId('tel-dial-reason')).toHaveText('Telefone não configurado nesta conta');

    // Nenhuma CHAMADA gravada e nenhum tráfego real. O único PATCH de escrita esperado é o
    // `is_read` do markAsRead, disparado ao abrir a conversa — o clique-para-discar não
    // grava chamada nenhuma.
    expect(registro.writesApp.filter((w) => /calls|upsert_my_call/.test(w))).toEqual([]);
    expect(registro.redeBarrada).toEqual([]);
    expect(sockets.filter((u) => u.includes('.supabase.co'))).toEqual([]);
  });

});
