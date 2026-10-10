/**
 * F90 (plano MULTIPLIX, Bloco J — testes/observabilidade/rollout) — E2E do
 * módulo Multiplix no navegador, hermético.
 *
 * O item pede `e2e/multiplix.spec.ts` rodando no `e2e-logado.yml`. O spec entra
 * no CI SEM tocar `.github/` nem config: o projeto `chromium-authenticated` do
 * `playwright.config.ts` é um CATCH-ALL (só tem `testIgnore`, não `testMatch`),
 * então todo spec novo de `e2e/` é coletado por ele — e é ele que o
 * `e2e-logado.yml` invoca. Mesma situação do `e2e/talkx-demo.spec.ts`, que o
 * `e2e/README.md` descreve como "roda no `e2e-logado.yml` via
 * `chromium-authenticated`".
 *
 * HERMÉTICO POR CONSTRUÇÃO (receita de `e2e/tarefas-quadro.spec.ts`): sessão
 * FALSA (`installFakeSession`), `storageState` zerado no `test.use` (o spec
 * NUNCA usa o `e2e/.auth/user.json` do projeto `setup`), app shell mockado
 * (`mockAppShell`), rede real barrada (`bloquearRedeReal`, conferida no
 * `afterEach`) e o WebSocket do Realtime fechado. As duas Edge Functions do
 * módulo (`multiplix-audience` e `multiplix-dispatch`), a de envio
 * (`multiplix-send`) e o roteador respondem por `page.route`: nenhum banco,
 * nenhuma credencial, nenhum secret novo, nenhum pedido a produção.
 *
 * O que este spec prova (o que do aceite do F90 existe hoje na tela):
 *   1. SELEÇÃO PERSISTENTE — marcar empresas e a contagem do rodapé fixo
 *      sobreviverem a "Carregar mais" (paginação) e à edição de um filtro sem
 *      clicar "Buscar"; e a seleção ser LIMPA na nova busca (`runSearch`), que é
 *      o contrato declarado em `MultiplixView.tsx`.
 *   2. CONFIRMAÇÃO — o composer não cria nada com nome/mensagem vazios (os dois
 *      botões nascem desabilitados) e "Salvar e iniciar agora" só chega à Edge
 *      DEPOIS do AlertDialog "Iniciar disparo agora?"; os placeholders entram
 *      pelos chips (`{{empresa}}`/`{{saudacao}}`) e viajam no `message_template`.
 *   3. MONITOR — abrir o disparo pela lista "Disparos recentes", ver o
 *      cabeçalho/progresso/destinatários e voltar.
 *
 * NÃO cobertos aqui, de propósito (medido no código da ponta de 08/10/2026):
 *   - "prévia" e "confirmação bloqueada por placeholder inválido" NÃO existem na
 *     tela: `MultiplixComposerDialog.tsx` não tem prévia nem valida placeholder;
 *     o `preview`/`validate` com `multiplix_unknown_placeholder` vivem SÓ na Edge
 *     `multiplix-dispatch` (`actions/inspect.ts`) e têm teste Deno próprio
 *     (`actions/__tests__/inspect.test.ts`). Inventar asserção de UI para eles
 *     seria teste vermelho por feature inexistente — o que se prova aqui é o
 *     bloqueio que existe (campos vazios) e o caminho dos chips válidos.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

// Deslogado de propósito: a sessão vem de `installFakeSession`, nunca do
// `storageState` do projeto `setup` (que exigiria login real).
test.use({
  storageState: { cookies: [], origins: [] },
  // 1440x900: a tabela do público (6 colunas) e o rodapé fixo cabem sem corte.
  viewport: { width: 1440, height: 900 },
});

// O dev server frio compila o app inteiro na primeira navegação (mesmo ajuste
// de `tarefas-quadro.spec.ts` e `onboarding-dispensar.spec.ts`).
test.setTimeout(120_000);

// ---------------------------------------------------------------------------
// Backend fake do módulo (nada de banco real)
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50; // igual ao `PAGE_SIZE` de `MultiplixView.tsx`
const DISPATCH_ID = '00000000-0000-4000-8000-00000000d001';
const EMPRESA_CHEIA = '51';
const EMPRESA_P1 = 'E2E Empresa 01';
const EMPRESA_P2 = 'E2E Empresa 02';

/** Linha de `multiplix-audience`/`search` no shape que a tela consome. */
interface Empresa {
  company_id: string;
  company_name: string;
  ramo_atividade: string;
  uf: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  is_carrier: boolean;
  destino_e164: string | null;
  destino_origem: string;
  motivo_inclusao: string;
}

/** Linha de `multiplix-dispatch`/`dispatch.list` (o `MultiplixDispatch` do hook). */
interface Disparo {
  id: string;
  name: string;
  message_template: string;
  status: 'draft' | 'sending' | 'paused' | 'completed';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  delivered_count: number;
  outcome_unknown_count: number;
  started_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  completed_at: string | null;
  created_at: string;
}

/** Linha de `multiplix-dispatch`/`recipients.list` (o `MultiplixRecipientRow`). */
interface Destinatario {
  id: string;
  company_name_snapshot: string | null;
  destino_e164: string | null;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  personalized_message: string | null;
}

/** Chamada que chegou a uma Edge do módulo (é o que o spec asserta). */
interface Chamada {
  action: string;
  params: Record<string, unknown>;
}

interface BackendFake {
  /** POSTs em `functions/v1/multiplix-audience` (leitura do público + criação). */
  audiencia: Chamada[];
  /** POSTs em `functions/v1/multiplix-dispatch` (lista/monitor). */
  roteador: Chamada[];
  /** POSTs em `functions/v1/multiplix-send` (start/pause/cancel). */
  envios: Array<{ dispatchId: string; action: string }>;
  disparos: Disparo[];
  destinatarios: Destinatario[];
}

const CRIADO_EM = '2026-03-02T12:00:00.000Z';

function empresa(n: number, nome: string): Empresa {
  return {
    company_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    company_name: nome,
    ramo_atividade: 'Brindes',
    uf: 'SP',
    is_customer: false,
    is_supplier: true,
    is_carrier: false,
    destino_e164: `+5511900000${String(n).padStart(3, '0')}`,
    destino_origem: 'contato_pessoa',
    motivo_inclusao: 'fornecedor',
  };
}

/**
 * Página 0 cheia (50 linhas) + página 1 com 1 linha, das 51 do filtro: é o que
 * faz "Carregar mais (1 restante)" aparecer e a seleção da página 0 ter de
 * sobreviver ao append (`setRows((prev) => [...prev, ...data])`).
 */
function pagina(n: number): Empresa[] {
  if (n === 0) return Array.from({ length: PAGE_SIZE }, (_, i) => empresa(i + 1, `E2E Empresa ${String(i + 1).padStart(2, '0')}`));
  if (n === 1) return [empresa(51, 'E2E Empresa 51')];
  return [];
}

function disparo(over: Partial<Disparo> = {}): Disparo {
  return {
    id: DISPATCH_ID,
    name: 'E2E Disparo recente',
    message_template: 'Olá {{empresa}}, {{saudacao}}!',
    status: 'sending',
    total_recipients: 2,
    sent_count: 1,
    failed_count: 0,
    delivered_count: 1,
    outcome_unknown_count: 0,
    started_at: CRIADO_EM,
    paused_at: null,
    pause_reason: null,
    completed_at: null,
    created_at: CRIADO_EM,
    ...over,
  };
}

function destinatario(n: number, status: string): Destinatario {
  return {
    id: `00000000-0000-4000-8000-${String(n + 5000).padStart(12, '0')}`,
    company_name_snapshot: `E2E Empresa ${String(n).padStart(2, '0')}`,
    destino_e164: `+5511900000${String(n).padStart(3, '0')}`,
    status,
    sent_at: status === 'sent' || status === 'delivered' ? CRIADO_EM : null,
    error_message: null,
    personalized_message: 'Olá E2E Empresa, bom dia!',
  };
}

/**
 * As três Edges do módulo. Registre DEPOIS de `mockAppShell` — o Playwright casa
 * as rotas na ordem INVERSA de registro, então estas têm prioridade sobre o
 * catch-all `functions/v1/*` do shell (que devolveria `{}`).
 *
 * Contratos reais (lidos dos hooks, não inventados):
 *  - `useMultiplixAudience.invokeMultiplixAudience`: body `{ action, params }`,
 *    resposta `{ data: T }`.
 *  - `useMultiplixDispatches.invokeMultiplixDispatch`: body `{ action, payload }`,
 *    resposta `{ data, meta? }` desembrulhada por `readMultiplixList`.
 *  - `invokeMultiplixSend`: body `{ dispatchId, action }`, resposta `{ ok }`.
 */
async function mockMultiplix(page: Page, backend: BackendFake): Promise<void> {
  const corpo = (route: Route) =>
    (route.request().postDataJSON() ?? {}) as {
      action?: string;
      params?: Record<string, unknown>;
      payload?: Record<string, unknown>;
      dispatchId?: string;
    };

  // ── Leitura do público + criação do disparo (multiplix-audience) ──────────
  await page.route(/\/functions\/v1\/multiplix-audience/, (route: Route) => {
    const { action = '', params = {} } = corpo(route);
    backend.audiencia.push({ action, params });
    switch (action) {
      case 'list_ramos':
        return json(route, { data: [{ ramo_atividade: 'Brindes', total: 51 }] });
      case 'list_ufs':
        return json(route, { data: [{ uf: 'SP', total: 51 }] });
      case 'count':
        return json(route, { data: 51 });
      case 'search':
        return json(route, { data: pagina(Number(params.page ?? 0)) });
      case 'create_draft': {
        // A Edge cria o disparo na transação e devolve o id; o monitor (que abre
        // logo depois) lê esse id em `dispatch.list`. O fake faz o mesmo.
        const nome = String(params.name ?? '');
        backend.disparos = [
          disparo({ id: DISPATCH_ID, name: nome, message_template: String(params.message_template ?? '') }),
          ...backend.disparos.filter((d) => d.id !== DISPATCH_ID),
        ];
        return json(route, {
          data: {
            dispatch_id: DISPATCH_ID,
            recipient_count: Array.isArray(params.company_ids) ? params.company_ids.length : 0,
            created: true,
          },
        });
      }
      default:
        return json(route, { error: `acao nao prevista no spec: ${action}` }, 400);
    }
  });

  // ── Lista/monitor (multiplix-dispatch) ────────────────────────────────────
  await page.route(/\/functions\/v1\/multiplix-dispatch/, (route: Route) => {
    const { action = '', payload = {} } = corpo(route);
    backend.roteador.push({ action, params: payload });
    switch (action) {
      case 'dispatch.list': {
        const alvo = payload.dispatch_id;
        const linhas = typeof alvo === 'string'
          ? backend.disparos.filter((d) => d.id === alvo)
          : backend.disparos;
        return json(route, { data: { dispatches: linhas, total: linhas.length } });
      }
      case 'recipients.list': {
        // O monitor pede 3 leituras: a lista, a página de `skipped` (contagem do
        // progresso) e a do filtro escolhido. Só o filtro devolve linhas.
        const filtro = typeof payload.status === 'string' ? payload.status : 'all';
        const linhas = filtro === 'all'
          ? backend.destinatarios
          : backend.destinatarios.filter((d) => d.status === filtro);
        return json(route, { data: { recipients: linhas, total: linhas.length } });
      }
      default:
        return json(route, { error: `acao nao prevista no spec: ${action}` }, 400);
    }
  });

  // ── Motor de envio (multiplix-send) ───────────────────────────────────────
  await page.route(/\/functions\/v1\/multiplix-send/, (route: Route) => {
    const { dispatchId = '', action = '' } = corpo(route);
    backend.envios.push({ dispatchId, action });
    return json(route, { ok: true });
  });
}

// ---------------------------------------------------------------------------
// Helpers de tela
// ---------------------------------------------------------------------------

async function entraEmMultiplix(page: Page): Promise<void> {
  await page.goto('/?view=multiplix');
  await expect(page.getByRole('heading', { name: 'Multiplix' })).toBeVisible({ timeout: 60_000 });
}

async function buscar(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Buscar' }).click();
  // O `hasSearched` liga a tabela; a primeira linha é a prova de que a página 0
  // chegou (o `count` é uma RPC independente e pode responder antes/depois).
  await expect(page.getByRole('cell', { name: EMPRESA_P1, exact: true })).toBeVisible();
}

/** Rodapé fixo da seleção (só existe com `selected.size > 0`). */
function rodapeSelecao(page: Page, quantas: number) {
  return page.getByText(`${quantas} empresa(s) selecionada(s)`);
}

/** Marca a empresa pelo `aria-label` do checkbox da linha. */
async function marcar(page: Page, nome: string): Promise<void> {
  await page.getByRole('checkbox', { name: `Selecionar ${nome}` }).click();
}

async function preparar(page: Page, backend: BackendFake): Promise<Registro> {
  const registro: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };

  // O guarda vai PRIMEIRO: o Playwright casa as rotas na ordem inversa, então ele
  // é o último a valer — só pega o que nenhum mock específico cobriu.
  await bloquearRedeReal(page, registro);
  // O WebSocket do Realtime NÃO passa por `page.route`; sem esta linha o monitor
  // abriria um socket para o host real do Supabase. Nada é enviado — não conecta.
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
  await mockAppShell(page, registro);
  await installFakeSession(page);
  // Leituras que o catch-all de `mockAppShell` deixa DE FORA por desenho
  // (lookahead negativo em contacts/messages).
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  await mockMultiplix(page, backend);

  return registro;
}

function backendVazio(): BackendFake {
  return {
    audiencia: [],
    roteador: [],
    envios: [],
    disparos: [disparo()],
    destinatarios: [destinatario(1, 'delivered'), destinatario(2, 'pending')],
  };
}

// ---------------------------------------------------------------------------

test.describe('Multiplix — E2E do módulo (F90)', () => {
  let registro: Registro;
  let backend: BackendFake;

  test.beforeEach(async ({ page }) => {
    backend = backendVazio();
    registro = await preparar(page, backend);
  });

  test.afterEach(() => {
    // Nenhuma requisição escapou dos mocks: prova de que a spec não toca
    // Supabase/Mapbox de verdade.
    expect(registro.redeBarrada).toEqual([]);
  });

  test('seleção persiste na paginação e ao editar o filtro, e é limpa na nova busca', async ({ page }) => {
    await entraEmMultiplix(page);
    await buscar(page);

    // O count da RPC independente aparece acima da tabela.
    await expect(page.getByText(/empresa\(s\) no filtro atual/)).toContainText(EMPRESA_CHEIA);

    // Página 0 = 50 linhas (limite do backend), com "Carregar mais" porque há 51.
    await expect(page.getByRole('checkbox', { name: /^Selecionar E2E Empresa / })).toHaveCount(PAGE_SIZE);
    const carregarMais = page.getByRole('button', { name: /Carregar mais/ });
    await expect(carregarMais).toContainText('1 restante');

    // Seleciona duas empresas da primeira página.
    await marcar(page, EMPRESA_P1);
    await marcar(page, EMPRESA_P2);
    await expect(rodapeSelecao(page, 2)).toBeVisible();

    // (a) A seleção sobrevive ao "Carregar mais": a página 1 é ANEXADA
    // (`[...prev, ...data]`) e o que estava marcado continua marcado.
    await carregarMais.click();
    await expect(page.getByRole('checkbox', { name: /^Selecionar E2E Empresa / })).toHaveCount(51);
    await expect(page.getByRole('cell', { name: 'E2E Empresa 51', exact: true })).toBeVisible();
    await expect(rodapeSelecao(page, 2)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: `Selecionar ${EMPRESA_P1}` })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: `Selecionar ${EMPRESA_P2}` })).toBeChecked();

    // (b) A seleção sobrevive a editar um filtro SEM clicar "Buscar" (os filtros
    // são estado separado; só `runSearch` limpa a seleção).
    await page.getByPlaceholder('Nome da empresa...').fill('brindes');
    await expect(rodapeSelecao(page, 2)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: `Selecionar ${EMPRESA_P1}` })).toBeChecked();

    // (c) Contrato declarado no `runSearch`: a NOVA BUSCA limpa a seleção (o id
    // fantasma de um resultado antigo não pode ir para um disparo real).
    await page.getByRole('button', { name: 'Buscar' }).click();
    await expect(rodapeSelecao(page, 2)).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: `Selecionar ${EMPRESA_P1}` })).not.toBeChecked();

    // O spec não escreveu nada: nenhuma Edge de criação foi chamada por engano.
    expect(backend.audiencia.filter((c) => c.action === 'create_draft')).toHaveLength(0);
    expect(backend.envios).toHaveLength(0);
  });

  test('confirmação: nada é criado com campos vazios e o start só sai depois do AlertDialog', async ({ page }) => {
    await entraEmMultiplix(page);
    await buscar(page);
    await marcar(page, EMPRESA_P1);
    await marcar(page, EMPRESA_P2);

    await page.getByRole('button', { name: 'Criar disparo' }).click();
    const composer = page.getByRole('dialog');
    await expect(composer.getByText('Novo disparo Multiplix')).toBeVisible();
    await expect(composer.getByText(`2 empresa(s) selecionada(s) da busca.`)).toBeVisible();

    // Bloqueio que EXISTE hoje no composer: sem nome e sem mensagem os dois
    // caminhos ficam desabilitados (não há validação de placeholder na tela).
    const salvarRascunho = composer.getByRole('button', { name: 'Salvar rascunho' });
    const iniciarAgora = composer.getByRole('button', { name: 'Salvar e iniciar agora' });
    await expect(salvarRascunho).toBeDisabled();
    await expect(iniciarAgora).toBeDisabled();

    // Preenche o nome e a mensagem pelos CHIPS (os tokens válidos do composer).
    await composer.getByPlaceholder('Ex.: Convite feira 2026').fill('Convite feira 2026');
    await composer.getByRole('button', { name: '+ Empresa' }).click();
    await composer.getByRole('button', { name: '+ Saudação' }).click();
    const mensagem = composer.getByPlaceholder('Olá {{empresa}}, {{saudacao}}!');
    await expect(mensagem).toHaveValue('{{empresa}} {{saudacao}}');
    await expect(salvarRascunho).toBeEnabled();

    // "Salvar e iniciar agora" NÃO cria nada sozinho: abre o AlertDialog.
    await iniciarAgora.click();
    const confirmacao = page.getByRole('alertdialog');
    await expect(confirmacao.getByText('Iniciar disparo agora?')).toBeVisible();
    await expect(confirmacao.getByText(/Isso envia mensagens reais no WhatsApp para 2 empresa\(s\)/)).toBeVisible();
    expect(backend.audiencia.filter((c) => c.action === 'create_draft')).toHaveLength(0);
    expect(backend.envios).toHaveLength(0);

    // Só a confirmação explícita chama a Edge: create_draft com os company_ids da
    // seleção e o template com os placeholders, e depois o start em background.
    await confirmacao.getByRole('button', { name: 'Iniciar agora' }).click();

    await expect.poll(() => backend.audiencia.filter((c) => c.action === 'create_draft').length).toBe(1);
    const criacao = backend.audiencia.find((c) => c.action === 'create_draft')!;
    expect(criacao.params.name).toBe('Convite feira 2026');
    expect(criacao.params.message_template).toBe('{{empresa}} {{saudacao}}');
    expect(criacao.params.company_ids).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
    expect(criacao.params.confirm_over_limit).toBe(false);

    await expect.poll(() => backend.envios.length).toBe(1);
    expect(backend.envios[0]).toEqual({ dispatchId: DISPATCH_ID, action: 'start' });

    // `onCreated` abre o monitor do disparo recém-criado.
    await expect(page.getByRole('heading', { name: 'Convite feira 2026' })).toBeVisible();
  });

  test('monitor: abre pelo disparo recente, mostra progresso/destinatários e volta', async ({ page }) => {
    await entraEmMultiplix(page);

    // A lista de recentes vem da Edge (`dispatch.list`) já no mount.
    const recente = page.getByRole('button', { name: /E2E Disparo recente/ });
    await expect(recente).toBeVisible();
    await recente.click();

    // Cabeçalho do monitor + métricas do disparo.
    await expect(page.getByRole('heading', { name: 'E2E Disparo recente' })).toBeVisible();
    await expect(page.getByText('Enviadas')).toBeVisible();
    await expect(page.getByText('1 de 2')).toBeVisible();

    // O monitor lê o disparo PELO ID (não pela página de recentes) e a lista de
    // destinatários pela ação `recipients.list`.
    expect(backend.roteador.filter((c) => c.action === 'dispatch.list').some((c) => c.params.dispatch_id === DISPATCH_ID)).toBe(true);
    await expect(page.getByText(EMPRESA_P1)).toBeVisible();
    await expect(page.getByText('Entregue', { exact: true })).toBeVisible();

    // Voltar devolve a tela de busca do módulo.
    await page.getByRole('button', { name: 'Voltar aos disparos' }).click();
    await expect(page.getByRole('button', { name: 'Buscar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Multiplix' })).toBeVisible();
  });
});
