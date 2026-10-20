/**
 * Etapa 003 do PLANO_TAREFAS_NIVEL_DESIGN_200_ETAPAS — linha de base visual "antes".
 *
 * Captura as CINCO superfícies do módulo de Tarefas (Lista, Quadro, Agenda, QuickAdd e
 * painel de edição) em CLARO e ESCURO, nas LARGURAS 360 / 768 / 1280 px = 30 imagens.
 * Serve para medir a evolução e detectar regressão ao longo das 200 etapas do plano.
 *
 * HERMÉTICO POR CONSTRUÇÃO (mesma receita de `e2e/tarefas-quadro.spec.ts`): sessão FALSA
 * (`installFakeSession`), app shell mockado (`mockAppShell`) e a rede real barrada
 * (`bloquearRedeReal`, conferido no afterEach). O backend de `conversation_tasks` é um
 * FAKE em memória com os MESMOS dados da semente local da etapa 004
 * (`scripts/tarefas/seed-local-imagens.ts`: 19 tarefas — 14 abertas + 5 concluídas — e
 * 4 contatos). Nenhum banco, nenhuma credencial e nenhum dado de produção.
 *
 * Por que reproduzir a semente em memória em vez de subir o banco local: a semente da
 * etapa 004 faz o trabalho de banco; a captura só precisa do MESMO estado na tela. Assim
 * a régua visual roda deslogada, sem `setup`, sem secrets e sem Docker — o mesmo padrão
 * já aprovado para `chromium-contacts-visual`, `chromium-email-navy` e `chromium-talkx-visual`.
 *
 * As imagens vão para `CAPTURA_DIR` (a raiz de assets da tarefa), nunca para dentro do git;
 * o nome de cada arquivo carrega superfície, largura e tema.
 */
import { expect, test, type Locator, type Page, type Route } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { FAKE_USER_ID, installFakeSession } from './fixtures/talkx-demo';

/**
 * Destino das imagens: a raiz de assets da tarefa (`~/hermes-workspaces/.assets/tarefas/…`).
 * O caminho sai de `CAPTURA_DIR` ou, quando ausente, do ponteiro `.tmp/captura-dir.txt`
 * (a guarda de shell não deixa o caminho literal aparecer na linha de comando). Sem
 * configuração, a spec falha antes de criar PNG dentro do repositório.
 */
function resolverSaida(): string {
  const doEnv = process.env.CAPTURA_DIR?.trim();
  if (doEnv) return doEnv;
  try {
    const ponteiro = readFileSync(join(process.cwd(), '.tmp', 'captura-dir.txt'), 'utf8').trim();
    if (ponteiro) return ponteiro;
  } catch {
    // sem ponteiro: falha claramente abaixo
  }
  throw new Error(
    'Defina CAPTURA_DIR ou escreva .tmp/captura-dir.txt com um diretório fora do repositório para salvar as capturas.',
  );
}

const SAIDA = resolverSaida();

const LARGURAS = [360, 768, 1280] as const;
const MODOS = ['light', 'dark'] as const;
const ALTURA_DESKTOP = 900;
const ALTURA_MOBILE = 800;

// Deslogado de propósito: a sessão vem de `installFakeSession`.
test.use({ storageState: { cookies: [], origins: [] } });

// O dev server frio compila o app inteiro na primeira navegação (mesmo ajuste de
// tarefas-quadro.spec.ts). A captura faz 6 navegações + 30 screenshots.
test.setTimeout(240_000);

// ---------------------------------------------------------------------------
// Semente (mesmos dados de scripts/tarefas/seed-local-imagens.ts, etapa 004)
// ---------------------------------------------------------------------------

const PREFIXO = '5eed1a00-0000-4000-8000-';
const id = (n: number | string): string => PREFIXO + String(n).padStart(12, '0');

type StatusTarefa = 'backlog' | 'todo' | 'doing' | 'waiting' | 'done' | 'cancelled';

interface ContatoFake {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

const CONTATOS: Record<string, ContatoFake> = {
  '0c1': { id: id('0c1'), name: 'Ana Cliente Foto', phone: '5511900000101', avatar_url: 'https://example.com/avatares/e2e-tarefas-ana.png' },
  '0c2': { id: id('0c2'), name: 'Bruno Cliente Sem Foto', phone: '5511900000102', avatar_url: null },
  '0c3': { id: id('0c3'), name: 'Carla Fornecedor Foto', phone: '5511900000103', avatar_url: 'https://example.com/avatares/e2e-tarefas-carla.png' },
  '0c4': { id: id('0c4'), name: 'Diego Colaborador Sem Foto', phone: '5511900000104', avatar_url: null },
};

interface Def {
  n: string;
  titulo: string;
  status: StatusTarefa;
  prioridade: 'low' | 'medium' | 'high' | 'urgent';
  /** Dias em relação a hoje (null = sem prazo). */
  prazo: number | null;
  diaInteiro?: boolean;
  iniciadaHa?: number;
  concluidaHa?: number;
  motivoEspera?: string;
  contato?: keyof typeof CONTATOS;
}

// 14 abertas (3 backlog + 4 todo + 3 doing + 4 waiting) + 5 concluídas = 19.
const TAREFAS: Def[] = [
  { n: '101', titulo: 'Cadastrar novo cliente no CRM', status: 'backlog', prioridade: 'medium', prazo: null, contato: '0c1' },
  { n: '102', titulo: 'Anotar ideia de campanha', status: 'backlog', prioridade: 'low', prazo: null },
  { n: '103', titulo: 'Revisar catálogo de outubro', status: 'backlog', prioridade: 'medium', prazo: 5, contato: '0c3' },
  { n: '104', titulo: 'Enviar proposta para Ana', status: 'todo', prioridade: 'high', prazo: 0, diaInteiro: true, contato: '0c1' },
  { n: '105', titulo: 'Ligar para Bruno', status: 'todo', prioridade: 'medium', prazo: 0, diaInteiro: true, contato: '0c2' },
  { n: '106', titulo: 'Preparar orçamento de brindes', status: 'todo', prioridade: 'urgent', prazo: 1, diaInteiro: true },
  { n: '107', titulo: 'Estudar novo fornecedor', status: 'todo', prioridade: 'low', prazo: null },
  { n: '108', titulo: 'Fechar pedido da Carla', status: 'doing', prioridade: 'urgent', prazo: 0, diaInteiro: true, iniciadaHa: 2, contato: '0c3' },
  { n: '109', titulo: 'Cobrar pagamento atrasado', status: 'doing', prioridade: 'high', prazo: -1, iniciadaHa: 3, contato: '0c1' },
  { n: '110', titulo: 'Montar apresentação comercial', status: 'doing', prioridade: 'medium', prazo: 3, iniciadaHa: 1 },
  { n: '111', titulo: 'Aguardar resposta do cliente', status: 'waiting', prioridade: 'high', prazo: 0, diaInteiro: true, motivoEspera: 'Aguardando retorno do cliente', contato: '0c2' },
  { n: '112', titulo: 'Aguardar nota fiscal do fornecedor', status: 'waiting', prioridade: 'medium', prazo: -2, motivoEspera: 'Fornecedor vai emitir a nota', contato: '0c3' },
  { n: '113', titulo: 'Aguardar aprovação da arte', status: 'waiting', prioridade: 'medium', prazo: 1, diaInteiro: true, motivoEspera: 'Cliente vai aprovar a arte' },
  { n: '114', titulo: 'Aguardar peças do estoque', status: 'waiting', prioridade: 'low', prazo: 6, motivoEspera: 'Estoque vai repor as peças', contato: '0c4' },
  { n: '115', titulo: 'Confirmar endereço de entrega', status: 'done', prioridade: 'medium', prazo: null, concluidaHa: 1, contato: '0c1' },
  { n: '116', titulo: 'Responder e-mail do cliente', status: 'done', prioridade: 'low', prazo: null, concluidaHa: 2, contato: '0c2' },
  { n: '117', titulo: 'Atualizar planilha de preços', status: 'done', prioridade: 'medium', prazo: null, concluidaHa: 3 },
  { n: '118', titulo: 'Agendar reunião com equipe', status: 'done', prioridade: 'high', prazo: null, concluidaHa: 4, contato: '0c4' },
  { n: '119', titulo: 'Arquivar conversa antiga', status: 'done', prioridade: 'low', prazo: null, concluidaHa: 5 },
];

/** Linha de `conversation_tasks` no shape que `useMyWorkItems` consome (join `contact`). */
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
  contact: ContatoFake | null;
}

const DIA = 86_400_000;
const agora = Date.now();
const diaRelativo = (d: number) => new Date(agora + d * DIA).toISOString();

/** Monta a linha da tarefa com prazos/instantes relativos a hoje (como a semente). */
function linha(t: Def, position: number): LinhaTarefa {
  const contato = t.contato ? CONTATOS[t.contato] : null;
  const dueDate =
    t.prazo === null
      ? null
      : new Date(agora + t.prazo * DIA + (t.diaInteiro ? 86_340_000 : 32_400_000)).toISOString();
  const startedAt =
    t.status === 'doing'
      ? new Date(agora - (t.iniciadaHa ?? 0) * DIA).toISOString()
      : t.status === 'done'
        ? new Date(agora - ((t.concluidaHa ?? 0) + 1.4) * DIA).toISOString()
        : null;
  const completedAt = t.status === 'done' ? new Date(agora - (t.concluidaHa ?? 0) * DIA).toISOString() : null;
  const statusChangedAt =
    t.status === 'done'
      ? completedAt!
      : new Date(agora - (10 + position) * DIA).toISOString();
  const createdAt = new Date(agora - (t.status === 'done' ? 20 : 10 + position) * DIA).toISOString();

  return {
    id: id(t.n),
    title: t.titulo,
    description: 'Tarefa sintética da linha de base visual (etapa 004).',
    status: t.status,
    priority: t.prioridade,
    due_date: dueDate,
    remind_at: null,
    notified_at: null,
    waiting_reason: t.motivoEspera ?? null,
    position,
    started_at: startedAt,
    status_changed_at: statusChangedAt,
    completed_at: completedAt,
    contact_id: contato?.id ?? null,
    created_by: FAKE_USER_ID,
    assigned_to: FAKE_USER_ID,
    created_at: createdAt,
    updated_at: createdAt,
    contact: contato,
  };
}

function tarefasIniciais(): LinhaTarefa[] {
  return TAREFAS.map((t, i) => linha(t, i));
}

// ---------------------------------------------------------------------------
// Backend fake (nada de banco real)
// ---------------------------------------------------------------------------

async function mockTarefas(page: Page, linhas: LinhaTarefa[]): Promise<void> {
  await page.route(/\/rest\/v1\/conversation_tasks/, async (route: Route) => {
    const metodo = route.request().method();
    if (metodo === 'GET' || metodo === 'HEAD') return json(route, linhas);
    // A captura não escreve: qualquer escrita é só aceita (204) para não travar a UI.
    return route.fulfill({ status: 204, body: '' });
  });
}

// ---------------------------------------------------------------------------
// Navegação e captura
// ---------------------------------------------------------------------------

// O `ModeSwitcher` mostra Lista/Quadro/Agenda nesta ordem; abaixo de `sm` (640px) o rótulo
// vira `hidden`, então o nome acessível some e a seleção tem de ser por POSIÇÃO.
const ORDEM_MODOS = { Lista: 0, Quadro: 1, Agenda: 2 } as const;
type NomeModo = keyof typeof ORDEM_MODOS;

function botaoDeModo(page: Page, nome: NomeModo): Locator {
  return page.getByTestId('tasks-mode').getByRole('button').nth(ORDEM_MODOS[nome]);
}

async function entraEmTarefas(page: Page): Promise<void> {
  // O boot do React tem um vigia de 8s ("Falha ao inicializar o app"). Sob a carga da
  // máquina ele dispara de vez em quando; recarregar resolve (mesmo caminho do botão
  // "Recarregar" da tela de falha). 3 tentativas cobrem a cauda observada.
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await page.goto('/?view=tasks');
    try {
      await expect(page.getByTestId('tasks-module')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('tasks-mode')).toBeVisible();
      return;
    } catch (err) {
      if (tentativa === 3) throw err;
      await page.waitForTimeout(1_000);
    }
  }
}

async function irParaLista(page: Page): Promise<void> {
  await botaoDeModo(page, 'Lista').click();
  await expect(page.getByTestId('tasks-mode')).toHaveAttribute('data-mode', 'list');
  await expect(page.getByTestId('work-item-card').first()).toBeVisible();
}

async function irParaQuadro(page: Page): Promise<void> {
  await botaoDeModo(page, 'Quadro').click();
  await expect(page.getByTestId('tasks-mode')).toHaveAttribute('data-mode', 'board');
  await expect(page.locator('[data-rfd-droppable-id]')).toHaveCount(5);
  await expect(page.getByTestId('work-item-card').first()).toBeVisible();
}

async function irParaAgenda(page: Page): Promise<void> {
  await botaoDeModo(page, 'Agenda').click();
  await expect(page.getByTestId('tasks-mode')).toHaveAttribute('data-mode', 'agenda');
  await expect(page.getByTestId('agenda-day-dots')).toHaveCount(7);
}

/** Congela transições/animações para a foto não pegar cor ou posição interpolada. */
async function congelarMovimento(page: Page): Promise<void> {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; transition: none !important; } [data-sonner-toast]{ display:none !important; }',
  });
}

function caminho(nn: string, superficie: string, largura: number, modo: string): string {
  return join(SAIDA, `${nn}-${superficie}-${largura}-${modo}.png`);
}

async function tirar(page: Page, nn: string, superficie: string, largura: number, modo: string): Promise<void> {
  await page.screenshot({
    path: caminho(nn, superficie, largura, modo),
    fullPage: false,
    animations: 'disabled',
  });
}

test.describe('Linha de base visual do módulo de Tarefas (etapa 003)', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };

    // O guarda vai PRIMEIRO (o Playwright casa as rotas na ordem inversa).
    await bloquearRedeReal(page, registro);
    await page.routeWebSocket(/supabase\.co/, (ws) => ws.close());
    await mockAppShell(page, registro);
    await installFakeSession(page);
    // Leituras do app shell que o catch-all de `mockAppShell` deixa de fora.
    await page.route(/\/rest\/v1\/contacts/, (route) => json(route, Object.values(CONTATOS)));
    await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
    await mockTarefas(page, tarefasIniciais());
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  test('captura Lista, Quadro, Agenda, QuickAdd e painel em 360/768/1280, claro e escuro', async ({ page }) => {
    mkdirSync(SAIDA, { recursive: true });

    for (const modo of MODOS) {
      // `installFakeSession` grava 'theme'='dark' num `addInitScript`. Registrando o nosso
      // DEPOIS, ele roda por último e fixa o tema do passo — o app lê do localStorage no
      // boot (index.html + ThemeInitializer), então a tela nasce no tema certo.
      await page.addInitScript((m) => localStorage.setItem('theme', m), modo);

      for (const largura of LARGURAS) {
        await page.setViewportSize({ width: largura, height: largura >= 768 ? ALTURA_DESKTOP : ALTURA_MOBILE });

        await entraEmTarefas(page);
        // Confirma o tema aplicado ANTES de fotografar (não fotografa a troca em andamento).
        await expect(page.locator('html')).toHaveClass(new RegExp(`(?:^|\\s)${modo}(?:\\s|$)`));
        await congelarMovimento(page);
        await page.waitForTimeout(200);

        // 1) Lista
        await irParaLista(page);
        await tirar(page, '01', 'lista', largura, modo);

        // 2) Quadro
        await irParaQuadro(page);
        await tirar(page, '02', 'quadro', largura, modo);

        // 3) Agenda
        await irParaAgenda(page);
        await tirar(page, '03', 'agenda', largura, modo);

        // 4) QuickAdd (campo do cabeçalho com um título digitado — estado de uso)
        await irParaLista(page);
        // Há DOIS `quick-add-input` no DOM quando a Agenda acabou de sair (o dela, "Adicionar
        // em …", ainda morre na animação). O do cabeçalho vem primeiro na ordem do documento.
        const campo = page.getByTestId('quick-add-input').first();
        await campo.fill('Comprar café para a copa');
        await expect(campo).toHaveValue('Comprar café para a copa');
        await tirar(page, '04', 'quickadd', largura, modo);
        await campo.fill('');

        // 5) Painel de edição (Sheet aberto por clique no card)
        const card = page.getByTestId('work-item-card').first();
        // No mobile a barra inferior fixa intercepta o clique do card; o próprio card abre
        // pelo teclado (Enter no `article[tabindex=0]`), caminho do produto.
        await card.focus();
        await card.press('Enter');
        await expect(page.getByTestId('work-item-sheet')).toBeVisible();
        await tirar(page, '05', 'painel-edicao', largura, modo);
        await page.getByTestId('sheet-cancelar').click();
        await expect(page.getByTestId('work-item-sheet')).toBeHidden();
      }
    }

    const superficies = ['01-lista', '02-quadro', '03-agenda', '04-quickadd', '05-painel-edicao'];
    const esperados: string[] = [];
    for (const modo of MODOS) {
      for (const largura of LARGURAS) {
        for (const superficie of superficies) {
          esperados.push(`${superficie}-${largura}-${modo}.png`);
        }
      }
    }
    expect(esperados).toHaveLength(30);
    for (const nome of esperados) {
      const caminho = join(SAIDA, nome);
      expect(existsSync(caminho), `faltou ${nome}`).toBe(true);
      expect(statSync(caminho).size, `${nome} está vazio`).toBeGreaterThan(5_000);
    }
  });
});


