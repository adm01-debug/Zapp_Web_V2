import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * Y10 — E2E de Tarefas e do modo Quadro (criar, editar, atribuir, mudar de coluna no
 * Quadro por clique E por arrasto, concluir, reabrir, filtrar, estado vazio e erro de
 * gravação simulado).
 *
 * ONDE RODA (regra R1 do CLAUDE.md §0): no banco LOCAL do conjunto do cartão, com o
 * usuário sintético do `seed.sql`. A spec FAZ O PRÓPRIO LOGIN na tela, com as
 * credenciais do ambiente (`E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` — no local o wrapper
 * `zapp-e2e-local` aponta para o usuário do seed; na ausência delas o cenário é
 * pulado em vez de falhar por motivo obscuro). Ela NÃO usa o `storageState` de
 * `e2e/.auth/` nem depende do projeto `setup`: exige um projeto DESLOGADO que a
 * colete, no mesmo padrão de `chromium-mapa` e `chromium-talkx-launch`.
 *
 * PENDÊNCIA DE CONFIG (fora do escopo deste cartão, que só pode tocar este arquivo):
 * nenhum projeto do `playwright.config.ts` coleta este spec — o `testMatch` de cada um
 * o exclui (`npx playwright test e2e/tarefas-quadro.spec.ts --project=<existente>
 * --list` → `Error: No tests found.`) — e sem uma entrada própria o catch-all de sessão
 * salva o rodaria com o login de `e2e/.auth/`, o que a regra R1 proíbe. O spec está
 * provado verde contra o banco local; o que falta é a entrada de projeto dedicado
 * (ver o relato do cartão).
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

/** Login pela tela — o mesmo fluxo de `e2e/auth.setup.ts`. */
async function entrar(page: Page, email: string, senha: string): Promise<void> {
  await page.goto('/auth');
  await page.getByRole('tab', { name: /^entrar$/i }).click();
  await page.getByRole('textbox', { name: /e-?mail/i }).fill(email);
  await page.locator('input[type="password"]').fill(senha);
  await page.getByRole('button', { name: /^entrar$/i }).click();

  // Espera o DESFECHO, não só o sucesso: sem isso um login recusado vira
  // "timeout aguardando #main-navigation" e não diz nada sobre a causa.
  const shell = page.locator('#main-navigation');
  const erroLogin = page.getByRole('alert').or(page.getByText(/inv[aá]lid|credenci|senha incorreta|e-?mail ou senha|erro ao entrar|tente novamente/i));
  await expect(shell.or(erroLogin).first()).toBeVisible({ timeout: 60_000 });
  await expect(shell, 'login não concluiu (a sidebar do app não montou)').toBeVisible();
}

test.beforeEach(async ({ page }) => {
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
  const paraHoje = kpi(page, 'Para hoje');
  const antes = Number((await paraHoje.textContent())?.trim());
  expect(Number.isFinite(antes)).toBe(true);

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
