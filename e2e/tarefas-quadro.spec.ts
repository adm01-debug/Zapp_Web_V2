/**
 * E21 (plano FUSÃO QUADRO→TAREFAS, etapa E21) — E2E de Tarefas e do modo Quadro.
 *
 * Até aqui nenhum spec de `e2e/` abria Tarefas. Este cobre o essencial do módulo:
 *   1. abrir Tarefas e alternar Lista / Quadro / Agenda (com a preferência em
 *      `tasks-mode` gravada a cada troca);
 *   2. criar tarefa pelo QuickAdd e vê-la voltar do backend na coluna certa;
 *   3. mover o card entre colunas e — o ponto da etapa — o limite duro da coluna
 *      "Fazendo" (3/3) RECUSAR o movimento que faria passar de três.
 *
 * Por que o limite importa: `WIP_LIMITS.doing.hard = 3` (workItem.types.ts) é
 * aplicado em TRÊS camadas — `BoardColumn` desabilita o droppable da coluna,
 * `resolveDragEnd` recusa no `onDragEnd` e o hook `useMyWorkItems` revalida o
 * `doingCount` REAL antes de escrever. Desligar as três (mutação) faz este spec
 * falhar na asserção de negação: é isso que prova que a trava existe de verdade,
 * não só no unitário.
 *
 * HERMÉTICO POR CONSTRUÇÃO (mesma receita de e2e/onboarding-dispensar.spec.ts):
 * sessão FALSA (`installFakeSession`), app shell mockado (`mockAppShell`) e a
 * rede real barrada (`bloquearRedeReal`, conferido no afterEach). A tabela
 * `conversation_tasks` é um backend FAKE em memória (GET/POST/PATCH) — nenhum
 * banco, nenhuma credencial, nenhum dado de produção. Por isso o spec roda
 * deslogado, sem E2E_TEST_EMAIL/E2E_TEST_PASSWORD.
 *
 * Como o Quadro é ancorado: as colunas são os droppables do `@hello-pangea/dnd`,
 * identificados pelo atributo `data-rfd-droppable-id` que a própria lib injeta
 * (`backlog`/`todo`/`doing`/...). Não dependemos de classe CSS nem de texto do
 * cabeçalho para achar a coluna — só para ler o contador "3/3" dela.
 */
import { test, expect, type BrowserContext, type Locator, type Page, type Route } from '@playwright/test';

import { bloquearRedeReal, json, mockAppShell, querObjetoUnico, type Registro } from './fixtures/mapa-mocks';
import { FAKE_USER_ID, installFakeSession } from './fixtures/talkx-demo';

// Deslogado de propósito: a sessão vem de `installFakeSession`, nunca do
// storageState do projeto "setup" (que exigiria login real).
test.use({
  storageState: { cookies: [], origins: [] },
  // 1600px: as 5 colunas do Quadro cabem na viewport (o board rola na horizontal),
  // então os 5 droppables e os contadores ficam todos na mesma tela.
  viewport: { width: 1600, height: 1000 },
});

// O dev server frio compila o app inteiro na primeira navegação — bem mais que
// os 30s padrão (mesmo ajuste de onboarding-dispensar.spec.ts e talkx-visual).
test.setTimeout(120_000);

// ---------------------------------------------------------------------------
// Backend fake de `conversation_tasks` (nada de banco real)
// ---------------------------------------------------------------------------

type StatusTarefa = 'backlog' | 'todo' | 'doing' | 'waiting' | 'done' | 'cancelled';

/** Linha de `conversation_tasks` no shape que `useMyWorkItems` consome. */
interface LinhaTarefa {
  id: string;
  title: string;
  description: string | null;
  status: StatusTarefa;
  priority: string;
  due_date: string | null;
  remind_at: string | null;
  notified_at: string | null;
  waiting_reason: string | null;
  position: number;
  started_at: string | null;
  status_changed_at: string;
  completed_at: string | null;
  contact_id: string | null;
  created_by: string;
  assigned_to: string;
  created_at: string;
  updated_at: string;
  contact: null;
}

const CRIADO_EM = '2026-03-02T12:00:00.000Z';

function linha(id: string, title: string, status: StatusTarefa, position: number): LinhaTarefa {
  return {
    id,
    title,
    description: null,
    status,
    priority: 'medium',
    due_date: null,
    remind_at: null,
    notified_at: null,
    waiting_reason: null,
    position,
    started_at: null,
    status_changed_at: CRIADO_EM,
    completed_at: null,
    contact_id: null,
    created_by: FAKE_USER_ID,
    assigned_to: FAKE_USER_ID,
    created_at: CRIADO_EM,
    updated_at: CRIADO_EM,
    contact: null,
  };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const TITULO_BACKLOG = 'Regar as plantas da recepção';
const TITULO_TODO = 'Revisar proposta do cliente';
const TITULO_NOVO = 'Comprar café para a copa';

/**
 * A fixture nasce com **três** cards em "Fazendo" — o limite duro —, um em
 * "A fazer" (para o arrasto) e um na "Caixa de entrada" (para criar/mover).
 */
function tarefasIniciais(): LinhaTarefa[] {
  return [
    linha(uuid(1), TITULO_BACKLOG, 'backlog', 0),
    linha(uuid(2), TITULO_TODO, 'todo', 0),
    linha(uuid(3), 'Fazendo 1 — orçar brindes', 'doing', 0),
    linha(uuid(4), 'Fazendo 2 — aprovar arte', 'doing', 1),
    linha(uuid(5), 'Fazendo 3 — fechar pedido', 'doing', 2),
  ];
}

/** Escrita que o app tentou fazer no backend (o que o spec confere). */
interface Escrita {
  metodo: string;
  corpo: Record<string, unknown> | Array<Record<string, unknown>>;
}

interface BackendFake {
  linhas: LinhaTarefa[];
  escritas: Escrita[];
}

/** POSTs de criação (objeto); o upsert de posições manda array. */
function criacoes(backend: BackendFake): Array<Record<string, unknown>> {
  return backend.escritas
    .filter((e) => e.metodo === 'POST' && !Array.isArray(e.corpo))
    .map((e) => e.corpo as Record<string, unknown>);
}

/** PATCHes de mudança de status (`move`/`complete`/`cancel`). */
function movimentos(backend: BackendFake): Array<Record<string, unknown>> {
  return backend.escritas
    .filter((e) => e.metodo === 'PATCH')
    .map((e) => e.corpo as Record<string, unknown>);
}

/**
 * `conversation_tasks` como backend em memória: GET devolve o estado, POST/PATCH
 * aplicam no estado (é o que permite o card reaparecer certo depois do refetch).
 * Registre DEPOIS de `mockAppShell` — o Playwright casa as rotas de trás para
 * frente, então esta tem prioridade sobre o catch-all do shell.
 */
async function mockTarefas(page: Page, backend: BackendFake): Promise<void> {
  await page.route(/\/rest\/v1\/conversation_tasks/, async (route: Route) => {
    const req = route.request();
    const metodo = req.method();
    const url = new URL(req.url());

    if (metodo === 'GET' || metodo === 'HEAD') return json(route, backend.linhas);

    const corpo = req.postDataJSON() as
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | null;
    backend.escritas.push({ metodo, corpo: corpo ?? {} });

    // `update(...).eq('id', <uuid>)`: o filtro vive na query, não no corpo.
    if (metodo === 'PATCH') {
      const alvo = url.searchParams.get('id')?.replace(/^eq\./, '');
      const patch = (corpo ?? {}) as Record<string, unknown>;
      if (alvo) backend.linhas = backend.linhas.map((l) => (l.id === alvo ? { ...l, ...patch } : l));
      return route.fulfill({ status: 204, body: '' });
    }

    // Upsert em lote das posições (`persistPositions`): array de {id, position}.
    if (Array.isArray(corpo)) {
      for (const patch of corpo) {
        const id = patch.id as string | undefined;
        if (id) backend.linhas = backend.linhas.map((l) => (l.id === id ? { ...l, ...patch } : l));
      }
      return route.fulfill({ status: 204, body: '' });
    }

    // Insert do QuickAdd: a linha nasce no topo da coluna de destino.
    const insert = (corpo ?? {}) as Record<string, unknown>;
    const nova: LinhaTarefa = {
      ...linha(uuid(100 + backend.linhas.length), String(insert.title), insert.status as StatusTarefa, Number(insert.position ?? 0)),
      ...insert,
    };
    backend.linhas = [nova, ...backend.linhas];
    // `.insert(row).select('id').single()` chega com Accept de objeto único.
    return json(route, querObjetoUnico(route) ? nova : [nova], 201);
  });
}

// ---------------------------------------------------------------------------
// Helpers de tela
// ---------------------------------------------------------------------------

/** Coluna do Quadro pelo id do droppable (atributo da própria lib de DnD). */
function coluna(page: Page, status: StatusTarefa): Locator {
  return page.locator(`[data-rfd-droppable-id="${status}"]`);
}

/** Card dentro de uma coluna, pelo título. */
function cardEm(page: Page, status: StatusTarefa, titulo: string): Locator {
  return coluna(page, status).getByTestId('work-item-card').filter({ hasText: titulo });
}

/** O cabeçalho da coluna é o irmão do droppable dentro da coluna (onde vive o "3/3"). */
function cabecalhoDaColuna(page: Page, status: StatusTarefa): Locator {
  return coluna(page, status).locator('xpath=..');
}

/** Botão do `ModeSwitcher` (a sidebar tem um item "Quadro" próprio em `data-tour="pipeline"`). */
function botaoDeModo(page: Page, nome: string): Locator {
  return page.getByTestId('tasks-mode').getByRole('button', { name: nome });
}

async function entraEmTarefas(page: Page): Promise<void> {
  await page.goto('/?view=tasks');
  await expect(page.getByTestId('tasks-module')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('tasks-mode')).toBeVisible();
}

async function abrirQuadro(page: Page): Promise<void> {
  await botaoDeModo(page, 'Quadro').click();
  await expect(page.getByTestId('tasks-mode')).toHaveAttribute('data-mode', 'board');
  // Espera o CONTEÚDO do Quadro: o `data-mode` do seletor muda antes da troca
  // animada montar o board (`AnimatePresence mode="wait"`), e ler contagem de
  // coluna nesse intervalo dá 0 (o board ainda não está no DOM).
  await expect(page.locator('[data-rfd-droppable-id]')).toHaveCount(5);
  await expect(page.getByTestId('work-item-card').first()).toBeVisible();
}

/**
 * Move o card entre colunas pelo TECLADO — o caminho de arrasto que a própria
 * lib suporta e que o Quadro anuncia (`dragHandleUsageInstructions`): foca o
 * handle (o card é um `article[data-rfd-drag-handle-draggable-id]`), Espaço
 * pega, cada seta avança uma coluna, Espaço solta.
 *
 * Por que TECLADO e não mouse: nesta tela o arrasto sintético de mouse não
 * chega ao app — com o ponteiro comprovadamente sobre o droppable de destino
 * (`document.elementFromPoint` devolve o `[data-rfd-droppable-id="doing"]`) e
 * com as travas de WIP desligadas, NENHUM `onDragEnd` de mudança de coluna sai.
 * Um arrasto que nunca acontece faria as asserções de negação passarem sem
 * provar nada. O teclado move de verdade, e é o controle positivo abaixo que
 * confere isso a cada rodada.
 *
 * `colunas` é quantas colunas avançar (ordem do DOM = ordem do board).
 */
async function arrastarPorTeclado(page: Page, card: Locator, colunas: number): Promise<void> {
  await card.focus();
  await page.keyboard.press('Space');
  for (let i = 0; i < colunas; i += 1) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
}

// ---------------------------------------------------------------------------

test.describe('Tarefas e o modo Quadro (E21)', () => {
  let registro: Registro;
  let backend: BackendFake;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    backend = { linhas: tarefasIniciais(), escritas: [] };

    // O guarda vai PRIMEIRO: o Playwright casa as rotas na ordem inversa, então
    // ele é o último a valer — só pega o que nenhum mock específico cobriu.
    await bloquearRedeReal(page, registro);
    // O WebSocket do Realtime NÃO passa por `page.route`; sem esta linha o
    // navegador abriria um socket para o host real do Supabase ao montar a tela.
    // Nada é enviado/escrito — o canal simplesmente não conecta.
    await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
    await mockAppShell(page, registro);
    await installFakeSession(page);
    // Leituras do app shell que o catch-all de `mockAppShell` deixa de fora.
    await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
    await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
    await mockTarefas(page, backend);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  test('abre Tarefas e alterna Lista, Quadro e Agenda gravando o modo', async ({ page }) => {
    await entraEmTarefas(page);

    const modo = page.getByTestId('tasks-mode');
    const lido = () => page.evaluate(() => localStorage.getItem('tasks-mode'));

    // Primeiro acesso: sem preferência salva, o módulo abre na Lista.
    await expect(modo).toHaveAttribute('data-mode', 'list');
    await expect(page.getByTestId('work-item-card').first()).toHaveAttribute('data-mode', 'list');

    await botaoDeModo(page, 'Quadro').click();
    await expect(modo).toHaveAttribute('data-mode', 'board');
    // As 5 colunas do Kanban vieram da mesma tela (nenhuma porta de entrada à parte).
    await expect(page.locator('[data-rfd-droppable-id]')).toHaveCount(5);
    expect(await lido()).toBe('board');

    await botaoDeModo(page, 'Agenda').click();
    await expect(modo).toHaveAttribute('data-mode', 'agenda');
    await expect(page.getByTestId('agenda-day-dots')).toHaveCount(7);
    await expect(page.locator('[data-rfd-droppable-id]')).toHaveCount(0);
    expect(await lido()).toBe('agenda');

    await botaoDeModo(page, 'Lista').click();
    await expect(modo).toHaveAttribute('data-mode', 'list');
    await expect(page.getByTestId('work-item-card').first()).toHaveAttribute('data-mode', 'list');
    expect(await lido()).toBe('list');
  });

  test('cria tarefa pelo QuickAdd e ela volta na coluna Caixa de entrada', async ({ page }) => {
    await entraEmTarefas(page);
    await abrirQuadro(page);

    const entrada = coluna(page, 'backlog');
    const antes = await entrada.getByTestId('work-item-card').count();
    // Fixture conferida: a "Caixa de entrada" nasce com UM card.
    expect(antes).toBe(1);

    // O QuickAdd do cabeçalho (o da coluna tem outro placeholder).
    const campo = page.getByPlaceholder(/Adicionar tarefa/);
    await campo.fill(TITULO_NOVO);
    await campo.press('Enter');

    // Payload real do insert — não basta "algum request aconteceu".
    await expect.poll(() => criacoes(backend).length).toBe(1);
    expect(criacoes(backend)[0]).toMatchObject({
      title: TITULO_NOVO,
      status: 'backlog',
      created_by: FAKE_USER_ID,
      assigned_to: FAKE_USER_ID,
    });

    // Criada no backend fake, ela volta no refetch e aparece na coluna.
    await expect(cardEm(page, 'backlog', TITULO_NOVO)).toBeVisible();
    await expect(entrada.getByTestId('work-item-card')).toHaveCount(antes + 1);
    expect(criacoes(backend)).toHaveLength(1);
  });

  test('move entre colunas pelo teclado e o limite "Fazendo 3/3" recusa o que passaria de três', async ({ page }) => {
    await entraEmTarefas(page);
    await abrirQuadro(page);

    const afazer = coluna(page, 'todo');
    const fazendo = coluna(page, 'doing');

    // Pré-condição do limite: três em "Fazendo" e o contador duro anunciado.
    await expect(fazendo.getByTestId('work-item-card')).toHaveCount(3);
    await expect(cabecalhoDaColuna(page, 'doing')).toContainText('3/3');

    // CONTROLE POSITIVO: sem trava, o arrasto move de verdade — é o que impede o
    // teste de negação abaixo de passar por um arrasto que nunca funcionou.
    await arrastarPorTeclado(page, cardEm(page, 'backlog', TITULO_BACKLOG), 1);
    await expect(cardEm(page, 'todo', TITULO_BACKLOG)).toBeVisible();
    await expect(cardEm(page, 'backlog', TITULO_BACKLOG)).toHaveCount(0);
    // A coluna de destino passou de 1 para 2 cards (o que chegou + o da fixture).
    await expect(afazer.getByTestId('work-item-card')).toHaveCount(2);
    await expect.poll(() => movimentos(backend).length).toBe(1);
    expect(movimentos(backend)[0]).toMatchObject({ status: 'todo' });

    // NEGATIVA: o mesmo arrasto com destino "Fazendo" cheio não passa.
    const antesDoBloqueio = movimentos(backend).length;
    await arrastarPorTeclado(page, cardEm(page, 'todo', TITULO_TODO), 1);

    // Sem esta espera, "nenhuma escrita" poderia passar por a escrita ainda não
    // ter saído — a negação precisa de uma janela em que ela PODERIA ter saído.
    await page.waitForTimeout(500);

    await expect(cardEm(page, 'todo', TITULO_TODO)).toBeVisible();
    await expect(cardEm(page, 'doing', TITULO_TODO)).toHaveCount(0);
    await expect(fazendo.getByTestId('work-item-card')).toHaveCount(3);
    await expect(cabecalhoDaColuna(page, 'doing')).toContainText('3/3');
    // Nenhuma escrita de status 'doing' saiu do limite.
    expect(movimentos(backend).slice(antesDoBloqueio)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Y10 — Tarefas e o Quadro no banco LOCAL (trabalho anterior, preservado)
// ---------------------------------------------------------------------------

/**
 * Y10 — E2E de Tarefas e do modo Quadro (criar, editar, atribuir, mudar de coluna no
 * Quadro por clique E por arrasto, concluir, reabrir, filtrar, estado vazio e erro de
 * gravação simulado).
 *
 * ONDE RODA (regra R1 do CLAUDE.md §0): no banco LOCAL do conjunto do cartão, com o
 * usuário sintético do `seed.sql`. A spec FAZ O PRÓPRIO LOGIN na tela, com as
 * credenciais do ambiente (`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` — no local o wrapper
 * `zapp-e2e-local` aponta para o usuário do seed; na ausência delas o cenário é
 * pulado em vez de falhar por motivo obscuro). Ela NÃO usa `storageState` de
 * `e2e/.auth/` nem depende do projeto `setup`: precisa rodar num projeto DESLOGADO
 * (mesmo padrão de `chromium-mapa` e `chromium-talkx-launch`).
 *
 * GUARDA DE COLETOR (R1): o único projeto da `playwright.config.ts` que coleta este
 * arquivo é o catch-all de sessão salva (`chromium-authenticated`), que depende do
 * `setup` (login REAL) e é justamente o que o `e2e-logado.yml` roda na main
 * (`--project=setup --project=chromium-authenticated …`) contra a produção. Coletada
 * ali, esta spec executaria login e ESCRITA de tarefas no backend logado. Por isso o
 * arquivo se PULA sozinho quando o projeto coletor carrega `use.storageState` — o
 * sinal de "sessão salva" (todo projeto da config com `dependencies: ['setup']`
 * também o carrega). Sem sessão salva a guarda não dispara.
 *
 * ENTRADA DE PROJETO — PENDENTE, FORA DO DIFF DESTE CARTÃO: nenhum projeto do
 * `playwright.config.ts` casa com este arquivo por `testMatch` próprio (o único
 * coletor é o catch-all de sessão salva, onde a guarda acima pula). Medida:
 * `npx playwright test e2e/tarefas-quadro.spec.ts --project=chromium-theme --list`
 * → `Error: No tests found.` Consequência registrada: até essa entrada existir o
 * arquivo NÃO executa em CI nenhum (fica verde por skip, não por cobertura); a prova
 * de execução usa um config descartável em `.tmp/` (fora do git), sem `storageState`.
 *
 * PROVA (por que cada cenário falha sem a tela funcionar): as asserções leem o
 * `aria-label` do cartão ("titulo, status[, prazo <data>]"), o texto das regiões com
 * papel semântico (article, dialog, menuitem, switch, searchbox, option) e, nos
 * cenários de gravação, RECARREGAM a página para conferir a linha no banco local —
 * um movimento só otimista (sem gravação) não passa.
 *
 * TÍTULOS: todo cartão criado aqui nasce com o prefixo `[Y10-` e um sufixo único por
 * execução, para os dados de teste serem identificáveis no banco local e dois
 * cenários nunca disputarem o mesmo cartão.
 */

// Um cenário por vez: os testes conversam com o MESMO usuário no MESMO banco, e
// parte do que o cartão pede é estado GLOBAL da conta (a trava de WIP "Fazendo 3/3" e
// as colunas do Quadro). Com `fullyParallel: true` + `workers: 2` do
// playwright.config.ts dois cenários rodariam em paralelo e um veria o "Fazendo" do
// outro. Em série, cada cenário continua independente: cria os próprios dados e não
// depende do que outro deixou na tela.
test.describe('Tarefas e o Quadro — Y10 (banco local)', () => {
  test.describe.configure({ mode: 'serial' });

  // Orçamento explícito: o teto de 30 s do projeto mede a espera PELA TELA (cada teste
  // faz o próprio login, e a primeira navegação compila o app no Vite), não a falha. As
  // asserções seguem com o tempo padrão — se a tela não reagir, elas falham.
  test.setTimeout(120_000);

  /** Sufixo único desta execução (identifica os dados no banco local). */
  const RUN = `Y10-${Date.now().toString(36)}`;
  let sequencia = 0;

  /** Título identificável e único por cartão criado neste arquivo. */
  function titulo(nome: string): string {
    sequencia += 1;
    return `[${RUN}-${sequencia}] ${nome}`;
  }

  /** Contato semeado pelo `seed.sql` do banco local (o mesmo fixture dos specs logados). */
  const CONTATO_FIXTURE = /\[E2E\] Contato de teste/;

  /** Nome do contato por extenso, para comparar o que a tela escreve. */
  const NOME_CONTATO_FIXTURE = '[E2E] Contato de teste - nao apagar';

  /**
   * Usuário do `seed.sql` que NUNCA recebe tarefa neste arquivo: é o que prova o estado
   * vazio da conta ("Nada por aqui") sem depender de um banco recém-criado.
   */
  const USUARIO_SEM_TAREFAS = 'admin.local@promobrindes.com.br';

  const MODO_DATA = { Lista: 'list', Quadro: 'board', Agenda: 'agenda' } as const;
  type Modo = keyof typeof MODO_DATA;

  // ---------------------------------------------------------------------------
  // Helpers de tela (locators por papel/rótulo; nenhuma espera por tempo fixo)
  // ---------------------------------------------------------------------------

  /**
   * Watchdog de boot do `index.html` (linhas 61-87): se o React não montar em 8 s ele
   * APAGA o `#root` e escreve "⚠️ Falha ao inicializar o app". Com o dev server do Vite
   * frio e a máquina ocupada (vários conjuntos rodando), o React 19 passa dos 8 s e o
   * cenário morre esperando a aba de login — falha do AMBIENTE de teste, não do produto
   * (medida em `.tmp/prova-rodada-1.log`, cenário "conclui e reabre a tarefa pela lista").
   * Mesmo remédio de `talkx-visual.spec.ts:109-118`: eleva o teto ANTES de qualquer
   * navegação. O default de produção (8 s) não muda — o ajuste vive só no navegador do teste.
   */
  const TETO_DE_BOOT_MS = 60_000;

  async function elevarTetoDeBoot(alvo: Page | BrowserContext): Promise<void> {
    await alvo.addInitScript((teto) => {
      (window as unknown as { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = teto;
    }, TETO_DE_BOOT_MS);
  }

  /**
   * Login pela tela — o mesmo fluxo de `e2e/auth.setup.ts`.
   *
   * O login é fail-closed: se a edge `auth-login` não responde em 12 s
   * (`AUTH_LOGIN_TIMEOUT_MS`, `src/lib/serverLogin.ts`), `auth.service.ts` mostra
   * "Login temporariamente indisponível…" e NÃO cai no GoTrue direto (ADR-006). No banco
   * LOCAL o caminho `/functions/v1` do conjunto custa segundos por chamada — medido nesta
   * máquina para a MESMA `auth-login`: 4,7 s / 5,7 s / 6,5 s / 8,9 s / 11,5 s / 13,7 s
   * contra 4 ms no contêiner da edge — então a distribuição cruza o teto de 12 s e a
   * PRIMEIRA tentativa oscila por motivo de AMBIENTE, não de produto. O remédio é o do
   * usuário: tentar de novo. Nada é afrouxado — o teste só segue quando a sidebar monta;
   * credencial recusada continua falhando na primeira tentativa.
   */
  const TENTATIVAS_DE_LOGIN = 3;

  async function entrar(page: Page, email: string, senha: string): Promise<void> {
    await page.goto('/auth');
    const abaEntrar = page.getByRole('tab', { name: /^entrar$/i });
    const falhaDeBoot = page.getByRole('heading', { name: /Falha ao inicializar o app/ });
    // Espera a TELA (e não o clique) e nomeia o desfecho: se o watchdog apagou o #root,
    // o erro diz isso em vez de gastar os 120 s do teste "aguardando getByRole('tab')".
    await expect(abaEntrar.or(falhaDeBoot).first()).toBeVisible({ timeout: 60_000 });
    await expect(falhaDeBoot, 'o app não montou (watchdog de boot do index.html)').toHaveCount(0);
    await abaEntrar.click();

    const shell = page.locator('#main-navigation');
    const botaoEntrar = page.getByRole('button', { name: /^entrar$/i });
    // Desfechos nomeados: lentidão da edge (o app avisa e o formulário volta) x recusa de
    // credencial (falha na hora, sem retentativa) x sucesso (a sidebar monta).
    // O aviso aparece em DOIS nós ao mesmo tempo quando a edge está lenta: a mensagem do
    // formulário e o toast `role=status` do Toaster, que repete o texto. Em modo estrito o
    // `toBeHidden` abaixo reprovava com "resolved to 2 elements" (medido na rodada 3 das
    // 3 seguidas, `rodada-3.log`). O `.first()` fixa o nó da mensagem e preserva a
    // semântica: esperar o aviso da tentativa anterior sumir antes de reenviar o login.
    const edgeLenta = page.getByText(/Login temporariamente indispon/i).first();
    const recusaDeCredencial = page.getByText(/incorretos|senha incorreta|credenci|inv[aá]lid/i);

    for (let tentativa = 1; tentativa <= TENTATIVAS_DE_LOGIN; tentativa += 1) {
      // O app limpa o campo de senha depois de qualquer erro (useAuthForm), então toda
      // tentativa preenche os dois campos de novo em vez de contar com o que ficou lá.
      await page.getByRole('textbox', { name: /e-?mail/i }).fill(email);
      await page.locator('input[type="password"]').fill(senha);
      await expect(botaoEntrar).toBeEnabled({ timeout: 30_000 });
      await botaoEntrar.click();

      // Espera o DESFECHO, não só o sucesso: sem isso um login recusado vira
      // "timeout aguardando #main-navigation" e não diz nada sobre a causa.
      await expect(shell.or(edgeLenta).or(recusaDeCredencial).first()).toBeVisible({ timeout: 60_000 });
      if (await shell.isVisible()) return;
      await expect(recusaDeCredencial, 'login recusado por credencial (não é lentidão da edge)').toHaveCount(0);
      if (tentativa === TENTATIVAS_DE_LOGIN) break;
      // O aviso sai sozinho (Toaster com duration=4000): esperar ele sumir impede que a
      // rodada seguinte leia a mensagem da anterior como se fosse a sua.
      await expect(edgeLenta).toBeHidden({ timeout: 15_000 });
    }
    await expect(shell, 'login não concluiu (a sidebar do app não montou)').toBeVisible();
  }

  /**
   * GUARDA DE COLETOR (R1): declarada ANTES do login e sem pedir a fixture `page`, para
   * que o projeto de sessão salva seja recusado antes de o navegador abrir — um contexto
   * criado ali carregaria o `storageState` do projeto (leitura que a R1 proíbe). Com
   * sessão salva no projeto coletor o arquivo inteiro sai "skipped"; num projeto
   * deslogado a guarda não dispara e os cenários seguem normalmente.
   */
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      Boolean(testInfo.project.use.storageState),
      `${testInfo.project.name} (${browserName}) carrega uma sessão salva: esta spec faz o ` +
        'próprio login na tela e não pode ser coletada por projeto autenticado (R1); rode-a ' +
        'num projeto deslogado, sem `dependencies: ["setup"]`',
    );
  });

  test.beforeEach(async ({ page }) => {
    await elevarTetoDeBoot(page);
    const email = process.env.E2E_TEST_EMAIL;
    const senha = process.env.E2E_TEST_PASSWORD;
    test.skip(
      !email || !senha,
      'exige E2E_TEST_EMAIL/E2E_TEST_PASSWORD (o banco local do cartão é semeado pelo seed.sql ' +
        'e o wrapper zapp-e2e-local define as duas)',
    );
    await entrar(page, email as string, senha as string);
  });

  /** Abre Tarefas pelo deep link real (`?view=tasks`) e espera o módulo montar. */
  async function abrirTarefas(page: Page): Promise<void> {
    await page.goto('/?view=tasks', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('tasks-module')).toBeVisible({ timeout: 60_000 });
    // A barra de filtros é a última peça do cabeçalho a montar: esperá-la evita clicar
    // numa tela ainda em esqueleto.
    await expect(page.getByTestId('tasks-filter-bar')).toBeVisible();
  }

  /**
   * Cartão de tarefa pelo título. A âncora é o `aria-label` (que começa com o título nos
   * DOIS modos) e não o papel do elemento: na Lista o cartão é um `article`, no Quadro é
   * um `button` arrastável. O seletor de atributo é literal — `[` e `]` do prefixo do
   * título não precisam de escape.
   */
  function cartao(page: Page, tituloDoCartao: string): Locator {
    return page.locator(`[aria-label^="${tituloDoCartao}"]`);
  }

  /**
   * Espera o cartão estar NO estado pedido. O `aria-label` do cartão é
   * `titulo, status[, prazo <data>]` — é dele (e não de uma classe ou cor) que sai a
   * coluna em que a tarefa está.
   */
  async function esperarStatus(page: Page, tituloDoCartao: string, status: string): Promise<void> {
    await expect(cartao(page, tituloDoCartao)).toHaveAttribute(
      'aria-label',
      new RegExp(`,\\s*${status}(,|$)`),
    );
  }

  /** Campo de captura do cabeçalho (existe nos três modos, menos na Agenda). */
  function caixaDeCaptura(page: Page): Locator {
    return page
      .getByTestId('quick-add')
      .first()
      .getByRole('textbox', { name: 'Adicionar tarefa' });
  }

  async function irParaModo(page: Page, modo: Modo): Promise<void> {
    const trocador = page.getByTestId('tasks-mode');
    await trocador.getByRole('button', { name: modo }).click();
    await expect(trocador).toHaveAttribute('data-mode', MODO_DATA[modo]);
  }

  /**
   * Cria uma tarefa pela captura do cabeçalho. O prazo padrão é "Próx. semana": a Lista
   * agrupa por vencimento e a seção "Sem prazo" RECOLHE acima de 10 itens (etapa 48/B4)
   * — com prazo o cartão cai em "Próximas", que fica sempre aberta, e o cenário não
   * passa a depender de quantas tarefas execuções anteriores deixaram na conta.
   */
  async function criarTarefa(
    page: Page,
    t: string,
    prazo: 'semana' | 'hoje' = 'semana',
  ): Promise<Locator> {
    const caixa = caixaDeCaptura(page);
    await caixa.fill(t);
    await page.getByTestId(prazo === 'hoje' ? 'quick-add-chip-today' : 'quick-add-chip-nextweek').click();
    await caixa.press('Enter');
    const novo = cartao(page, t);
    await expect(novo).toBeVisible();
    return novo;
  }

  /**
   * Abre o menu do cartão e o submenu "Mover para", e devolve o item do destino.
   *
   * O submenu do Radix abre no PONTEIRO (e o clique no gatilho com o submenu já aberto
   * o FECHA, derrubando o alvo): por isso o alvo é esperado ANTES de qualquer clique.
   */
  async function abrirSubmenuMover(page: Page, t: string, destino: string): Promise<Locator> {
    await cartao(page, t).getByRole('button', { name: 'Mais opções' }).click();
    await page.getByRole('menuitem', { name: 'Mover para' }).hover();
    // `^<destino>` (não `$`): com a coluna cheia o nome acessível é o motivo
    // ("Fazendo está cheio (3/3)"), que começa pelo rótulo.
    const alvo = page.getByRole('menuitem', { name: new RegExp(`^${destino}`) });
    await expect(alvo).toBeVisible();
    return alvo;
  }

  /** Move a tarefa de coluna pelo menu do cartão (o caminho de "clique"). */
  async function moverPorMenu(page: Page, t: string, destino: string): Promise<void> {
    const alvo = await abrirSubmenuMover(page, t, destino);
    await alvo.click();
  }

  /** A coluna do Quadro é o alvo do arrasto (`data-rfd-*` é o contrato da lib de DnD). */
  function coluna(page: Page, status: string): Locator {
    return page.locator(`[data-rfd-droppable-id="${status}"]`);
  }

  /**
   * Arrasto com o mouse, como o usuário faz. O `@hello-pangea/dnd` do Quadro não usa o
   * DnD nativo do HTML: ele levanta o cartão no `mousedown`, decide a coluna pela
   * posição do PONTEIRO a cada movimento e solta no `mouseup`. Por isso o arrasto vai
   * passo a passo (o limiar de 5 px da lib e o índice de destino saem do movimento) em
   * vez de um `dragTo` de um salto só.
   */
  async function arrastarPara(page: Page, origem: Locator, destino: Locator): Promise<void> {
    await origem.scrollIntoViewIfNeeded();
    const caixaOrigem = await origem.boundingBox();
    const caixaDestino = await destino.boundingBox();
    if (!caixaOrigem || !caixaDestino) throw new Error('arrasto: cartão ou coluna fora da tela');
    const x0 = caixaOrigem.x + caixaOrigem.width / 2;
    const y0 = caixaOrigem.y + caixaOrigem.height / 2;
    const x1 = caixaDestino.x + caixaDestino.width / 2;
    const y1 = caixaDestino.y + caixaDestino.height / 2;

    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x0 + 8, y0 + 8, { steps: 4 }); // limiar de 5 px: o cartão "levanta"
    await page.mouse.move(x1, y1, { steps: 20 });        // atravessa até a coluna de destino
    await page.mouse.move(x1, y1 + 2, { steps: 2 });     // último movimento DENTRO do alvo
    await page.mouse.up();
  }

  /**
   * Tira de "Fazendo" tudo o que estiver lá. A trava de WIP é GLOBAL na conta e o
   * cenário do 3/3 precisa começar do zero: cartões de execuções anteriores (ou de um
   * cenário anterior deste mesmo arquivo) já ocupariam as três vagas.
   */
  async function esvaziarFazendo(page: Page): Promise<void> {
    const emFazendo = page.locator('[aria-label*=", doing"]');
    let restantes = await emFazendo.count();
    while (restantes > 0) {
      const rotulo = (await emFazendo.first().getAttribute('aria-label')) ?? '';
      await moverPorMenu(page, rotulo.split(', ')[0], 'A fazer');
      await expect(emFazendo).toHaveCount(restantes - 1);
      restantes -= 1;
    }
  }

  /** Valor do KPI pelo rótulo do card (ex.: "Para hoje"). */
  function kpi(page: Page, rotulo: string): Locator {
    return page.getByTestId('kpi-card').filter({ hasText: rotulo }).getByTestId('kpi-value');
  }

  /** Recarrega e espera o módulo de novo (prova que a linha está no banco local). */
  async function recarregarTarefas(page: Page): Promise<void> {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('tasks-module')).toBeVisible({ timeout: 60_000 });
  }

  // ---------------------------------------------------------------------------
  // Cenários
  // ---------------------------------------------------------------------------

  test('cria tarefa pela captura e ela entra na Caixa de entrada', async ({ page }) => {
    await abrirTarefas(page);
    const nova = titulo('criar');

    const caixa = caixaDeCaptura(page);
    await caixa.fill(nova);
    await page.getByTestId('quick-add-chip-nextweek').click();
    await caixa.press('Enter');

    await esperarStatus(page, nova, 'backlog');
    // A região viva do módulo (role=status) narra a criação para quem usa leitor de
    // tela — é a fonte da asserção, não o toast (que é efêmero).
    await expect(page.getByTestId('tasks-live')).toContainText('Tarefa criada');
    // O campo volta ao rascunho vazio (a captura aceita a próxima tarefa).
    await expect(caixa).toHaveValue('');

    // Sem a gravação, o cartão não sobrevive a uma recarga (a criação otimista sozinha
    // não passaria daqui).
    await recarregarTarefas(page);
    await esperarStatus(page, nova, 'backlog');
  });

  test('edita título e prioridade na folha e atribui contato', async ({ page }) => {
    await abrirTarefas(page);
    const inicial = titulo('editar');

    // ATRIBUIR: o chip de contato da captura grava a tarefa já vinculada.
    const caixa = caixaDeCaptura(page);
    await caixa.fill(inicial);
    await page.getByTestId('quick-add-chip-contact').click();
    await page.getByTestId('contact-combobox-input').fill('E2E');
    await page.getByRole('option', { name: CONTATO_FIXTURE }).click();
    await page.getByTestId('quick-add-chip-nextweek').click();
    await caixa.press('Enter');

    const criado = cartao(page, inicial);
    await expect(criado).toBeVisible();
    await expect(criado.getByTestId('contact-chip')).toContainText(NOME_CONTATO_FIXTURE);

    // EDITAR: clicar no cartão abre a folha de edição.
    await criado.click();
    const folha = page.getByTestId('work-item-sheet');
    await expect(folha).toBeVisible();
    await expect(folha.getByRole('heading', { name: 'Editar tarefa' })).toBeVisible();

    const editado = `${inicial} editada`;
    await folha.getByRole('textbox', { name: 'Título' }).fill(editado);
    await folha.getByRole('button', { name: 'Alta' }).click();
    await folha.getByRole('button', { name: 'Salvar' }).click();
    await expect(folha).toBeHidden();

    await expect(cartao(page, editado)).toBeVisible();
    // A prioridade no cartão é o chip compacto (só a inicial): o rótulo completo vive no
    // `title` do chip.
    await expect(cartao(page, editado).getByTitle('Prioridade: Alta')).toBeVisible();

    await recarregarTarefas(page);
    await expect(cartao(page, editado).getByTitle('Prioridade: Alta')).toBeVisible();
    await expect(cartao(page, editado).getByTestId('contact-chip')).toContainText(NOME_CONTATO_FIXTURE);
  });

  test('conclui e reabre a tarefa pela lista', async ({ page }) => {
    await abrirTarefas(page);
    const t = titulo('concluir');
    await criarTarefa(page, t);

    await cartao(page, t).getByRole('button', { name: 'Concluir tarefa' }).click();
    await expect(page.getByTestId('tasks-live')).toContainText('Concluída');

    // A seção "Concluídas (7 dias)" nasce recolhida (etapa 48/B4): abre para ver o
    // cartão concluído.
    const secaoConcluidas = page.getByRole('button', { name: /^Concluídas \(7 dias\)/ });
    await secaoConcluidas.click();
    await esperarStatus(page, t, 'done');

    await cartao(page, t).getByRole('button', { name: 'Reabrir tarefa' }).click();
    // Reabrir devolve para "A fazer" (o hook reabre em `todo`).
    await esperarStatus(page, t, 'todo');
    await expect(page.getByTestId('tasks-live')).toContainText('Desfeito');

    await recarregarTarefas(page);
    await esperarStatus(page, t, 'todo');
  });

  test('muda de coluna pelo menu "Mover para" e a mudança persiste', async ({ page }) => {
    await abrirTarefas(page);
    await irParaModo(page, 'Quadro');
    const t = titulo('mover-por-clique');
    await criarTarefa(page, t);
    await esperarStatus(page, t, 'backlog');

    await moverPorMenu(page, t, 'A fazer');
    await esperarStatus(page, t, 'todo');
    // A mudança precisa estar no banco local, não só no cache otimista.
    await recarregarTarefas(page);
    await esperarStatus(page, t, 'todo');
  });

  test('muda de coluna arrastando o cartão do Quadro', async ({ page }) => {
    await abrirTarefas(page);
    await irParaModo(page, 'Quadro');
    const t = titulo('mover-por-arrasto');
    const origem = await criarTarefa(page, t);
    await esperarStatus(page, t, 'backlog');

    await arrastarPara(page, origem, coluna(page, 'todo'));
    await esperarStatus(page, t, 'todo');
    // O arrasto tem de ter GRAVADO: recarregar prova a linha no banco local.
    await recarregarTarefas(page);
    await esperarStatus(page, t, 'todo');
  });

  test('trava o quarto item em "Fazendo" (WIP 3/3)', async ({ page }) => {
    await abrirTarefas(page);
    await irParaModo(page, 'Quadro');
    // A trava é global na conta: começa do zero para o 3/3 ser determinístico.
    await esvaziarFazendo(page);

    const tres = [titulo('wip-1'), titulo('wip-2'), titulo('wip-3')];
    for (const t of tres) {
      await criarTarefa(page, t);
      await moverPorMenu(page, t, 'Fazendo');
      await esperarStatus(page, t, 'doing');
    }

    // Cabeçalho da coluna e KPI leem a contagem real: 3 de 3.
    await expect(page.getByText('3/3').first()).toBeVisible();
    await expect(kpi(page, 'Fazendo')).toHaveText('3/3');

    // A quarta tarefa não entra: a opção "Fazendo" do menu fica bloqueada com o motivo.
    const quarta = titulo('wip-4');
    await criarTarefa(page, quarta);
    const itemFazendo = await abrirSubmenuMover(page, quarta, 'Fazendo');
    await expect(itemFazendo).toHaveAttribute('aria-disabled', 'true');
    await expect(itemFazendo).toHaveAttribute('title', /Fazendo está cheio \(3\/3\)/);
    await page.keyboard.press('Escape');
    await esperarStatus(page, quarta, 'backlog');

    // Liberar uma vaga devolve a opção: a trava não é um estado colado.
    await moverPorMenu(page, tres[0], 'A fazer');
    await esperarStatus(page, tres[0], 'todo');
    const itemFazendoLiberado = await abrirSubmenuMover(page, quarta, 'Fazendo');
    await expect(itemFazendoLiberado).not.toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
  });

  test('filtra por busca, prioridade, contato e alarme, e limpa', async ({ page }) => {
    await abrirTarefas(page);
    const comAlarme = titulo('filtro-urgente');
    const comContato = titulo('filtro-contato');
    const caixa = caixaDeCaptura(page);

    // Tarefa 1: urgente e com alarme (em 1 h, sempre no futuro).
    await caixa.fill(comAlarme);
    await page.getByTestId('quick-add-chip-priority').click();
    await page.getByTestId('quick-add-priority-urgent').click();
    await page.getByTestId('quick-add-chip-remind').click();
    await page.getByRole('button', { name: 'Em 1 h' }).click();
    await page.getByTestId('quick-add-chip-nextweek').click();
    await caixa.press('Enter');

    // Tarefa 2: prioridade padrão (Média), sem alarme, com contato.
    await caixa.fill(comContato);
    await page.getByTestId('quick-add-chip-contact').click();
    await page.getByTestId('contact-combobox-input').fill('E2E');
    await page.getByRole('option', { name: CONTATO_FIXTURE }).click();
    await page.getByTestId('quick-add-chip-nextweek').click();
    await caixa.press('Enter');

    await expect(cartao(page, comAlarme)).toBeVisible();
    await expect(cartao(page, comContato)).toBeVisible();

    const busca = page.getByRole('searchbox', { name: 'Buscar tarefa' });

    // 1) busca por texto (debounce de 200 ms: a asserção espera o recorte aplicar).
    await busca.fill(comAlarme);
    await expect(cartao(page, comAlarme)).toBeVisible();
    await expect(cartao(page, comContato)).toHaveCount(0);
    await busca.fill('');
    await expect(cartao(page, comContato)).toBeVisible();

    // 2) prioridade.
    await page.getByRole('combobox', { name: 'Prioridade' }).click();
    await page.getByRole('option', { name: 'Urgente' }).click();
    await expect(cartao(page, comAlarme)).toBeVisible();
    await expect(cartao(page, comContato)).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Prioridade' }).click();
    await page.getByRole('option', { name: 'Todas as prioridades' }).click();
    await expect(cartao(page, comContato)).toBeVisible();

    // 3) contato (o filtro por pessoa: só a tarefa daquele contato).
    await page.getByRole('button', { name: 'Contato', exact: true }).click();
    await page.getByRole('option', { name: CONTATO_FIXTURE }).click();
    await expect(cartao(page, comContato)).toBeVisible();
    await expect(cartao(page, comAlarme)).toHaveCount(0);
    await page.getByRole('button', { name: 'Contato', exact: true }).click();
    await page.getByRole('option', { name: 'Todos os contatos' }).click();

    // 4) alarme.
    await expect(cartao(page, comAlarme)).toBeVisible();
    await page.getByRole('switch', { name: 'Com alarme' }).click();
    await expect(cartao(page, comAlarme)).toBeVisible();
    await expect(cartao(page, comContato)).toHaveCount(0);

    // 5) "Limpar" devolve os dois.
    await page.getByRole('button', { name: 'Limpar' }).click();
    await expect(cartao(page, comAlarme)).toBeVisible();
    await expect(cartao(page, comContato)).toBeVisible();
    await expect(busca).toHaveValue('');
  });

  test('prazo de hoje: o cartão mostra "Hoje" e o KPI "Para hoje" sobe', async ({ page }) => {
    await abrirTarefas(page);
    // O card do KPI existe desde o primeiro render com o valor 0 (`kpis(items)` com
    // `items` ainda vazio — TasksKpiStrip.tsx:59-68) e recebe a contagem real no MESMO
    // render em que a Lista desenha os cartões. Ler o "antes" antes disso dá 0 e a
    // conta `antes + 1` vira mentira: espera a Lista sair do carregamento primeiro
    // (flaky medido em .tmp/prova-rodada-1.log).
    await expect(page.getByRole('article').or(page.getByText('Nada por aqui')).first()).toBeVisible({
      timeout: 60_000,
    });
    const paraHoje = kpi(page, 'Para hoje');
    const bruto = ((await paraHoje.textContent()) ?? '').trim();
    expect(bruto, 'KPI "Para hoje" ainda sem contagem').toMatch(/^\d+$/);
    const antes = Number(bruto);

    const t = titulo('prazo-hoje');
    await criarTarefa(page, t, 'hoje');

    // O prazo é o de hoje (o chip do cartão diz "Hoje" no título) e a tarefa entra no
    // recorte de vencimento do dia — o mesmo que alimenta o KPI.
    await expect(cartao(page, t).getByTitle('Prazo: Hoje')).toBeVisible();
    await expect(paraHoje).toHaveText(String(antes + 1));
  });

  test('estado vazio: sem resultado de filtro e conta sem tarefas', async ({ page, browser }) => {
    await abrirTarefas(page);
    // (a) filtro sem resultado: a Lista oferece "Limpar filtros" em vez de fingir que a
    // conta está vazia.
    await page.getByRole('searchbox', { name: 'Buscar tarefa' }).fill(`sem-resultado-${RUN}`);
    await expect(page.getByText('Nenhuma tarefa com esse filtro')).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtros' }).click();
    await expect(page.getByRole('searchbox', { name: 'Buscar tarefa' })).toHaveValue('');
    await expect(page.getByTestId('tasks-filter-bar')).toBeVisible();

    // (b) conta sem tarefas: outro usuário do seed, que este arquivo nunca usa, logado do
    // zero num contexto próprio (sem sessão herdada).
    const senha = process.env.E2E_TEST_PASSWORD as string;
    const contexto = await browser.newContext();
    // Contexto próprio: o teto de boot do `beforeEach` vale só para a `page` dele.
    await elevarTetoDeBoot(contexto);
    const vazia = await contexto.newPage();
    try {
      await entrar(vazia, USUARIO_SEM_TAREFAS, senha);
      await abrirTarefas(vazia);
      await expect(vazia.getByText('Nada por aqui')).toBeVisible();
      await expect(vazia.getByText('Adicione a primeira tarefa acima.')).toBeVisible();
      await expect(vazia.getByRole('article')).toHaveCount(0);
    } finally {
      await contexto.close();
    }
  });

  test('erro de gravação: criar e mover falham e a tela volta ao estado anterior', async ({ page }) => {
    await abrirTarefas(page);
    const rotaEscrita = '**/rest/v1/conversation_tasks**';

    // A LEITURA continua indo ao banco LOCAL (a rota cai para a rede); só a GRAVAÇÃO em
    // conversation_tasks é derrubada. É assim que se prova a reação da tela a uma falha
    // real de escrita sem escrever nada fora do banco local.
    const derrubarEscrita = () =>
      page.route(rotaEscrita, (rota) => {
        const metodo = rota.request().method();
        if (metodo === 'GET' || metodo === 'HEAD') return rota.fallback();
        return rota.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'falha de gravação simulada (E2E Y10)' }),
        });
      });

    // 1) CRIAR falha: aparece o aviso e NENHUM cartão novo fica na tela.
    await derrubarEscrita();
    const naoCriada = titulo('erro-ao-criar');
    const caixa = caixaDeCaptura(page);
    await caixa.fill(naoCriada);
    await page.getByTestId('quick-add-chip-nextweek').click();
    await caixa.press('Enter');
    await expect(page.getByText('Erro ao criar tarefa')).toBeVisible();
    await expect(cartao(page, naoCriada)).toHaveCount(0);
    await page.unroute(rotaEscrita);

    // 2) MOVER falha: o cartão já existia e a tela DESFAZ a mudança otimista.
    const naoMovida = titulo('erro-ao-mover');
    await criarTarefa(page, naoMovida);
    await esperarStatus(page, naoMovida, 'backlog');
    await derrubarEscrita();
    await moverPorMenu(page, naoMovida, 'A fazer');
    await expect(page.getByText('Erro ao mover tarefa')).toBeVisible();
    await esperarStatus(page, naoMovida, 'backlog'); // rollback: voltou para a origem
    await page.unroute(rotaEscrita);

    // E a linha no banco local continua na origem.
    await recarregarTarefas(page);
    await esperarStatus(page, naoMovida, 'backlog');
  });

  // LACUNA (achado do Y10, não corrigida aqui — vira cartão de correção):
  // o cartão pede "filtros por responsável", e o módulo NÃO tem filtro por
  // responsável/atribuído. A lista é sempre "minhas tarefas" (`created_by` = perfil
  // logado, em useMyWorkItems) e `assigned_to` é sempre igual a `created_by` (o insert
  // do hook grava os dois iguais e o trigger do banco mantém), então um filtro por
  // atribuído não teria o que recortar. A barra de filtros oferece: busca, prioridade,
  // contato, alarme e concluídas (src/components/tasks/shared/TasksFilterBar.tsx). Fica
  // como fixme para o achado não se perder nem virar um teste que finge.
  test.fixme('filtra por responsável (atribuído) — o módulo não oferece esse filtro', async ({ page }) => {
    await abrirTarefas(page);
  });
});
