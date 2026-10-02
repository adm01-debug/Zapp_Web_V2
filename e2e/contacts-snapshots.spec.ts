import { existsSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { contactCards, gotoContacts } from './fixtures/contacts-page';

/**
 * Etapa 90 do `docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md` (linha 146):
 *
 * > Screenshot de referência (light/dark) das 3 vistas em
 * > `e2e/__screenshots__/contacts-*.png` com `toHaveScreenshot` tolerância 0,2%
 * > — DoD: PNGs versionados; CI compara.
 *
 * O destino dos PNGs vem de `snapshotPathTemplate` em `playwright.config.ts`
 * (`{testDir}/__screenshots__/{arg}-{platform}{ext}`): o template padrão do
 * Playwright espalharia os arquivos em `contacts-snapshots.spec.ts-snapshots/`
 * com sufixo de projeto, longe do caminho que o DoD pede. `{platform}` fica no
 * nome para que uma baseline gerada fora do Linux (onde o `e2e-logado.yml`
 * roda) não seja comparada contra o render de outro SO.
 *
 * ESTADO ATUAL (baseline ainda não versionada): cada teste MEDE e ANOTA os
 * números reais da página e, em seguida, se marca como SKIP enquanto o PNG
 * correspondente não existir. Sem esse gate um `toHaveScreenshot` sem baseline
 * derruba o `e2e-logado.yml` de `main` — e a baseline não pôde ser gerada neste
 * ambiente porque `e2e/auth.setup.ts` exige `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD`
 * (só existem como secrets do repositório). Para gerar as 6 baselines, uma vez,
 * NUM LINUX (mesmo SO do CI):
 *
 *     E2E_TEST_EMAIL=... E2E_TEST_PASSWORD=... bun run test:e2e -- \
 *       --project=setup --project=chromium-authenticated --update-snapshots
 *
 * Gerar a baseline tem de ser uma ação deliberada e revisada no PR: com
 * `--update-snapshots` um render quebrado vira "verdade" silenciosamente.
 *
 * ATENÇÃO (herança da etapa 48 do plano antigo, que nunca entregou isto): a
 * suíte roda contra PRODUÇÃO e os cards/linhas mostram dados vivos. As duas
 * regiões que mudam a cada contato novo (valor do KPI e contagem do badge das
 * abas) vão mascaradas; nome/telefone/empresa dos contatos NÃO — com 0,2% de
 * tolerância, uma carga de dados muito diferente exige re-baseline consciente
 * (nunca `--update-snapshots` às cegas no CI).
 */
const SNAPSHOT_DIR = path.join(import.meta.dirname, '__screenshots__');
const SNAPSHOT_EXT = '.png';

type Tema = 'light' | 'dark';

/** As 3 vistas do DoD, com o `title` do botão do `ContactViewSwitcher`. */
const VISTAS = [
  { nome: 'cards', label: 'Cards' },
  { nome: 'list', label: 'Lista' },
  { nome: 'table', label: 'Tabela' },
] as const;

/** Mesmo nome que o token `{platform}` produz em `snapshotPathTemplate`. */
const PLATFORM = process.platform;

function arquivoDaBaseline(nome: string, tema: Tema): string {
  return path.join(SNAPSHOT_DIR, `contacts-${nome}-${tema}-${PLATFORM}${SNAPSHOT_EXT}`);
}

/** Regiões com dado vivo (mudam a cada contato criado): mascaradas na comparação. */
function mascarasDeDadoVivo(page: Page) {
  return [page.getByTestId('kpi-value'), page.getByTestId('tab-count')];
}

/** Toasts globais (ex.: aviso de SIP não configurado) não fazem parte da tela de Contatos. */
const SEM_TOASTS = '[data-sonner-toaster], [role="region"][aria-label^="Notifications"] { display: none !important; }';

/** Espera a vista pedida estar de fato montada (mesmos marcadores de `contacts-views.spec.ts`). */
async function abrirVista(page: Page, nome: string, label: string): Promise<void> {
  await page.getByTitle(label).click();
  if (nome === 'cards') {
    await expect(contactCards(page).first()).toBeVisible({ timeout: 15_000 });
    return;
  }
  if (nome === 'list') {
    await expect(contactCards(page)).toHaveCount(0, { timeout: 15_000 });
    return;
  }
  await expect(page.getByRole('grid', { name: 'Lista de contatos' })).toBeVisible({ timeout: 15_000 });
}

for (const tema of ['light', 'dark'] as const) {
  test.describe(`Contatos — screenshots de referência (tema ${tema}, etapa 90)`, () => {
    test.use({ colorScheme: tema, viewport: { width: 1280, height: 800 } });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem('theme', t), tema);
      await gotoContacts(page);
      // Prova de que o tema pedido está aplicado no <html> antes de fotografar.
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${tema}\\b`));
    });

    for (const vista of VISTAS) {
      test(`${vista.label}: mede a página e compara com a baseline (tolerância 0,2%)`, async ({ page }, testInfo) => {
        await abrirVista(page, vista.nome, vista.label);

        const medicao = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          cards: document.querySelectorAll('[data-testid="contact-card"]').length,
          tablistScrollWidth: document.querySelector('[role=tablist]')?.scrollWidth ?? null,
        }));

        testInfo.annotations.push({
          type: 'medicao',
          description:
            `tema=${tema} vista=${vista.nome} viewport=${medicao.innerWidth}x${medicao.innerHeight} ` +
            `scrollWidth=${medicao.scrollWidth} cards=${medicao.cards} ` +
            `tablistScrollWidth=${medicao.tablistScrollWidth}`,
        });
        await testInfo.attach(`medicao-contacts-${vista.nome}-${tema}.json`, {
          body: JSON.stringify({ tema, vista: vista.nome, ...medicao }, null, 2),
          contentType: 'application/json',
        });
        console.warn(
          `[etapa 90] ${tema}/${vista.nome} viewport=${medicao.innerWidth}x${medicao.innerHeight} ` +
            `scrollWidth=${medicao.scrollWidth} cards=${medicao.cards}`,
        );

        const baseline = arquivoDaBaseline(vista.nome, tema);
        // `--update-snapshots` liga 'changed' (ou 'all'); o padrão 'missing' não conta como geração deliberada.
        const gerandoBaseline = testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed';
        test.skip(
          !existsSync(baseline) && !gerandoBaseline,
          `baseline ${path.relative(process.cwd(), baseline)} ausente — a etapa 90 exige os PNGs ` +
            'versionados. Gere uma vez, em Linux, com E2E_TEST_EMAIL/E2E_TEST_PASSWORD definidas: ' +
            '`bun run test:e2e -- --project=setup --project=chromium-authenticated --update-snapshots`.',
        );

        await page.addStyleTag({ content: SEM_TOASTS });
        await expect(page).toHaveScreenshot(`contacts-${vista.nome}-${tema}${SNAPSHOT_EXT}`, {
          maxDiffPixelRatio: 0.002,
          animations: 'disabled',
          mask: mascarasDeDadoVivo(page),
        });
      });
    }
  });
}
