/**
 * Cartão t_ec7d393b — barra do topo da lista de conversas em NAVEGADOR REAL, nos
 * dois temas, com captura de tela e axe.
 *
 * O que já existe e o que falta:
 *   - `src/components/inbox/__tests__/ConversationListSidebar.topo.test.tsx` prova a
 *     ORDEM (título → um botão de atualizar → chips → busca) em jsdom, com os filhos
 *     mockados. jsdom não tem layout nem computa contraste: ordem geométrica e
 *     acessibilidade real escapam dele.
 *   - Este spec prova a MESMA ordem medida em geometria de verdade (`boundingBox`),
 *     nos temas CLARO e ESCURO, e mede o `axe-core` critical/serious sobre o TOPO
 *     da sidebar (título + botão de atualizar + chips de status), nos dois temas.
 *
 * R1 (nenhum agente acessa produção): prova local-only por construção.
 *   - roda só quando `VITE_ZAPP_LOCAL_SUPABASE_URL`/`ANON_KEY` estão definidos, o que
 *     só acontece sob `zapp-e2e-local` (conjunto local da tarefa);
 *   - login pela UI no GoTrue LOCAL (`admin.local@promobrindes.com.br` do seed),
 *     sem sessão salva (`storageState` vazio) e sem copiar `e2e/.auth/*`;
 *   - no CI (`e2e-logado.yml`, sem conjunto local) o spec se declara fora de escopo
 *     em vez de tentar logar um usuário que não existe lá.
 *
 * Como rodar (conjunto local de pé):
 *   zapp-db-local up "$PWD" <nome>
 *   zapp-e2e-local "$PWD" <nome> -c .tmp/playwright.sidebar-topo.config.ts \
 *     e2e/inbox-sidebar-topo.spec.ts
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { test, expect, type Locator, type Page } from '@playwright/test';
import { aplicarTema, type TemaE2E } from './fixtures/arquivos-local/tema';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

// Sem sessão salva: a prova entra pela tela de login com o usuário local do seed.
test.use({ storageState: { cookies: [], origins: [] } });
// Vite frio + login real + boot da SPA pedem mais que os 30s padrão do teste.
test.setTimeout(120_000);

const NAV_TIMEOUT = 60_000;

// O conjunto local é a única origem válida desta prova; sem ele, fora de escopo.
const CONJUNTO_LOCAL = Boolean(
  process.env.VITE_ZAPP_LOCAL_SUPABASE_URL && process.env.VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY,
);

// Usuário admin do seed local (`~/.local/share/zapp-local/seed.sql`); senha sintética
// de TODOS os usuários locais. Nunca é credencial de produção.
const EMAIL = process.env.E2E_TEST_EMAIL ?? 'admin.local@promobrindes.com.br';
const SENHA = process.env.E2E_TEST_PASSWORD ?? 'zapp-local-123';

const PASTA_CAPTURA = path.resolve(process.cwd(), '.tmp', 'sidebar-topo');

interface Violacao {
  id: string;
  impact: string | null;
  nodes: { target: string[]; html: string }[];
}

/** Login real pela UI: /auth → GoTrue local. */
async function entrarPelaUI(page: Page): Promise<void> {
  await page.goto('/auth');
  await page.locator('#login-email').fill(EMAIL);
  await page.locator('#login-password').fill(SENHA);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await expect(page.locator('#main-navigation')).toBeVisible({ timeout: NAV_TIMEOUT });
}

/**
 * Abre o Chat (rota `/` com a view `inbox`) e espera os chips de status. Um boot
 * truncado (Vite frio sob carga) não se recupera sozinho: o reload zera o estado.
 */
async function abrirChat(page: Page): Promise<Locator> {
  await page.goto('/?view=inbox');
  const chips = page.getByTestId('status-chips');
  try {
    await chips.waitFor({ state: 'visible', timeout: 30_000 });
  } catch {
    await page.reload();
    await chips.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  }
  return chips;
}

/** O elemento da sidebar: chips → bloco do topo → coluna da lista. */
function elementos(page: Page): { chips: Locator; topo: Locator; sidebar: Locator } {
  const chips = page.getByTestId('status-chips');
  const topo = chips.locator('..');
  const sidebar = topo.locator('..');
  return { chips, topo, sidebar };
}

async function yDoAlvo(alvo: Locator): Promise<number> {
  const caixa = await alvo.boundingBox();
  expect(caixa, 'elemento sem caixa visível para medir a ordem').not.toBeNull();
  return (caixa as { y: number }).y;
}

/** Roda o `axe-core` sobre o alvo (elemento ou `body`) e devolve só critical/serious. */
async function violacoesGraves(alvo: Locator): Promise<Violacao[]> {
  return alvo.evaluate(async (el): Promise<Violacao[]> => {
    const axe = (
      window as unknown as {
        axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Violacao[] }> };
      }
    ).axe;
    const r = await axe.run(el, {});
    return r.violations
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes }))
      .filter((v) => v.impact === 'critical' || v.impact === 'serious');
  });
}

function resumir(v: Violacao[]): string {
  return v
    .map((x) => `${x.id} (${x.impact}): ${x.nodes.map((n) => n.target.join(' ')).join(', ')}`)
    .join(' | ');
}

for (const tema of ['claro', 'escuro'] as TemaE2E[]) {
  test(`sidebar do topo no tema ${tema}: ordem, captura e axe`, async ({ page }) => {
    test.skip(
      !CONJUNTO_LOCAL,
      'prova local-only: exige o conjunto local (zapp-e2e-local) — no CI roda sem tocar produção',
    );

    await entrarPelaUI(page);
    await abrirChat(page);

    // Tema aplicado como o ThemeProvider gravam e o boot do index.html lê.
    await aplicarTema(page, tema);
    await page.reload();
    if (tema === 'escuro') {
      await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    } else {
      await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
    }

    const chips = await abrirChat(page);
    const { topo, sidebar } = elementos(page);

    // 1) A sidebar carregou com o topo e os chips dentro dele.
    await expect(topo).toBeVisible();
    await expect(chips).toBeVisible();
    await expect(topo.getByTestId('status-chips')).toHaveCount(1);
    // Os 6 chips de status (Todas, Não lidas, Em atendimento, Aguardando, Resolvidas, Arquivadas).
    await expect(sidebar.locator('[data-testid^="status-chip-"]')).toHaveCount(6);
    await expect(sidebar.getByTestId('status-chip-all')).toContainText('Todas');

    // 2) Título + UM botão de atualizar (a regressão que este teste pega: um segundo botão).
    const titulo = sidebar.getByRole('heading', { name: 'Conversas', level: 1 });
    const atualizar = sidebar.getByRole('button', { name: 'Atualizar conversas' });
    await expect(titulo).toBeVisible();
    await expect(atualizar).toHaveCount(1);

    const busca = sidebar.getByLabel('Buscar contato pelo nome');
    await expect(busca).toBeVisible();

    // 3) Ordem medida em geometria real: título → chips → busca, e o botão de
    //    atualizar na MESMA linha do título.
    const yTitulo = await yDoAlvo(titulo);
    const yChips = await yDoAlvo(chips);
    const yBusca = await yDoAlvo(busca);
    const yAtualizar = await yDoAlvo(atualizar);
    expect(yTitulo, 'título acima dos chips').toBeLessThan(yChips);
    expect(yChips, 'chips acima da linha de busca').toBeLessThan(yBusca);
    expect(
      Math.abs(yAtualizar - yTitulo),
      'botão de atualizar na mesma linha do título',
    ).toBeLessThan(24);

    // 4) Captura do elemento sidebar nos dois temas (fora do git).
    const arquivo = path.join(PASTA_CAPTURA, `sidebar-${tema}.png`);
    await sidebar.screenshot({ path: arquivo });
    console.warn(`[sidebar-topo] captura ${tema}: ${arquivo}`);

    // 5) axe no TOPO da sidebar (título + atualizar + chips): zero
    //    critical/serious. O escopo é o elemento do cartão. O LIST de conversas
    //    logo abaixo tem uma violação real e PRÉ-EXISTENTE fora do topo
    //    (nested-interactive serious: `div[role="button"]` com um
    //    `<button aria-label="Favoritar conversa">` dentro); ela é reportada
    //    como achado no cartão — não é medida fingindo que é do topo, nem
    //    escondida aqui.
    await page.waitForTimeout(500);
    await page.addScriptTag({ path: AXE });

    const noTopo = await violacoesGraves(topo);
    expect(noTopo, `axe critical/serious no topo da sidebar: ${resumir(noTopo)}`).toHaveLength(0);
  });
}

