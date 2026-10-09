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
import { test, expect, type Locator, type Page, type Route } from '@playwright/test';

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
