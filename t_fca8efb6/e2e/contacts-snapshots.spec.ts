import { existsSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { installFakeSession } from './fixtures/talkx-demo';
import { contactCards, gotoContacts } from './fixtures/contacts-page';
import {
  bloquearRedeReal, json, mockAppShell, querObjetoUnico, type Registro,
} from './fixtures/mapa-mocks';

/**
 * Etapa 90 do `docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md`:
 *
 * > Screenshot de referência (light/dark) das 3 vistas em
 * > `e2e/__screenshots__/contacts-*.png` com `toHaveScreenshot` tolerância 0,2%
 * > — DoD: PNGs versionados; CI compara.
 *
 * A tela roda com sessão FALSA (`installFakeSession`) e backend 100% mockado
 * (mesmo padrão de `contact-map-pin.spec.ts`, projeto `chromium-contacts-visual`):
 * contatos, KPIs, abas e "último contato" saem de `CONTATOS` abaixo e o relógio
 * do navegador fica parado em `AGORA`, então os pixels só mudam quando o layout
 * muda. Contra produção (login real) a comparação não se repetia: contagens,
 * banner de conexão e KPIs atrasados mudavam a foto entre rodadas.
 * `bloquearRedeReal` prova que nada sai para o Supabase real.
 *
 * O destino dos PNGs vem de `snapshotPathTemplate` em `playwright.config.ts`
 * (`{testDir}/__screenshots__/{arg}-{platform}{ext}`). Para regenerar, em Linux
 * (mesmo SO do CI), como ação deliberada e revisada no PR:
 *
 *     bun run test:e2e -- --project=chromium-contacts-visual --update-snapshots
 */
const SNAPSHOT_DIR = path.join(import.meta.dirname, '__screenshots__');
const SNAPSHOT_EXT = '.png';
const PLATFORM = process.platform;

const AGORA = new Date('2026-09-15T12:00:00.000Z');
const DIA = 86_400_000;

type Tema = 'light' | 'dark';

const VISTAS = [
  { nome: 'cards', label: 'Cards' },
  { nome: 'list', label: 'Lista' },
  { nome: 'table', label: 'Tabela' },
] as const;

function contato(
  n: number,
  nome: string,
  tipo: string,
  extra: { company?: string; job_title?: string; email?: string; tags?: string[]; dias: number },
) {
  const criado = new Date(AGORA.getTime() - extra.dias * DIA).toISOString();
  return {
    id: `00000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
    name: nome,
    nickname: null, surname: null,
    job_title: extra.job_title ?? null,
    company: extra.company ?? null,
    phone: `55119${String(80000000 + n * 1111).padStart(8, '0')}`,
    email: extra.email ?? null,
    contact_type: tipo,
    created_at: criado, updated_at: criado,
    deleted_at: null, is_lid_legacy: false,
    tags: extra.tags ?? [], avatar_url: null,
    address: null, address_number: null, neighborhood: null, city: null, state: null, postal_code: null,
    latitude: null, longitude: null, assigned_to: null, queue_id: null,
  };
}

const CONTATOS = [
  contato(1, 'Ana Beatriz Souza', 'cliente', { company: 'Brindes Paulista', job_title: 'Compradora', email: 'ana@brindespaulista.com.br', tags: ['vip'], dias: 2 }),
  contato(2, 'Bruno Carvalho', 'cliente', { company: 'Grupo Horizonte', job_title: 'Gerente de marketing', dias: 5 }),
  contato(3, 'Carla Mendes', 'fornecedor', { company: 'Têxtil Aurora', email: 'carla@textilaurora.com.br', dias: 12 }),
  contato(4, 'Diego Fernandes', 'transportadora', { company: 'Rápido Sul Logística', dias: 20 }),
  contato(5, 'Eduarda Lima', 'colaborador', { job_title: 'Designer', dias: 33 }),
  contato(6, 'Felipe Rocha', 'prestador_servico', { company: 'Rocha Serigrafia', dias: 47 }),
  contato(7, 'Gabriela Nunes', 'parceiro', { company: 'Agência Nunes', tags: ['evento'], dias: 61 }),
  contato(8, 'Henrique Alves', 'cliente', { company: 'Brindes Paulista', dias: 90 }),
];

const CONTAGEM_POR_TIPO = Object.entries(
  CONTATOS.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.contact_type]: (acc[c.contact_type] ?? 0) + 1 }), {}),
).map(([contact_type, count]) => ({ contact_type, count }));

async function mockBackendContatos(page: Page): Promise<void> {
  // `useContactsKpi` lê a tabela `contacts` direto; a lista e as abas vêm das RPCs.
  await page.route(/\/rest\/v1\/contacts/, (route) => {
    if (route.request().method() !== 'GET') return json(route, { message: 'blocked' }, 403);
    return json(route, querObjetoUnico(route) ? CONTATOS[0] : CONTATOS);
  });
  await page.route(/\/rest\/v1\/rpc\/search_contacts/, (route) =>
    json(route, CONTATOS.map((c) => ({ ...c, total_count: CONTATOS.length }))));
  await page.route(/\/rest\/v1\/rpc\/contacts_count_by_type/, (route) => json(route, CONTAGEM_POR_TIPO));
  await page.route(/\/rest\/v1\/rpc\/get_last_message_dates/, (route) =>
    json(route, CONTATOS.slice(0, 4).map((c, i) => ({
      contact_id: c.id,
      last_message_at: new Date(AGORA.getTime() - (i + 1) * 3 * 3_600_000).toISOString(),
    }))));
  await page.route(/\/rest\/v1\/rpc\/can_delete_contacts/, (route) =>
    json(route, CONTATOS.map((c) => ({ contact_id: c.id, can_delete: true }))));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
}

function arquivoDaBaseline(nome: string, tema: Tema): string {
  return path.join(SNAPSHOT_DIR, `contacts-${nome}-${tema}-${PLATFORM}${SNAPSHOT_EXT}`);
}

/** Toasts globais (ex.: aviso de SIP não configurado) não fazem parte da tela de Contatos. */
const SEM_TOASTS = '[data-sonner-toaster], [role="region"][aria-label^="Notifications"] { display: none !important; }';

async function abrirVista(page: Page, nome: string, label: string): Promise<void> {
  await page.getByTitle(label).click();
  if (nome === 'cards') {
    await expect(contactCards(page)).toHaveCount(CONTATOS.length, { timeout: 15_000 });
    return;
  }
  if (nome === 'list') {
    await expect(contactCards(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('contact-list-item')).toHaveCount(CONTATOS.length);
    return;
  }
  await expect(page.getByRole('grid', { name: 'Lista de contatos' })).toBeVisible({ timeout: 15_000 });
}

for (const tema of ['light', 'dark'] as const) {
  test.describe(`Contatos — screenshots de referência (tema ${tema}, etapa 90)`, () => {
    test.use({ colorScheme: tema, viewport: { width: 1280, height: 800 } });

    let registro: Registro;

    test.beforeEach(async ({ page }) => {
      registro = { writesApp: [], mapbox: [], redeBarrada: [] };
      await page.clock.setFixedTime(AGORA);
      // O Playwright casa as rotas na ordem inversa: o guarda entra primeiro.
      await bloquearRedeReal(page, registro);
      await mockAppShell(page, registro);
      await mockBackendContatos(page);
      await installFakeSession(page);
      // Depois de `installFakeSession`, que grava o tema escuro.
      await page.addInitScript((t) => window.localStorage.setItem('theme', t), tema);
      await gotoContacts(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${tema}\\b`));
      await expect(page.getByTestId('kpi-value').first()).toHaveText(String(CONTATOS.length));
    });

    test.afterEach(() => {
      expect(registro.redeBarrada ?? []).toEqual([]);
    });

    for (const vista of VISTAS) {
      test(`${vista.label}: compara com a baseline (tolerância 0,2%)`, async ({ page }, testInfo) => {
        await abrirVista(page, vista.nome, vista.label);

        const baseline = arquivoDaBaseline(vista.nome, tema);
        // `--update-snapshots` liga 'changed' (ou 'all'); o padrão 'missing' não conta como geração deliberada.
        const gerandoBaseline = testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed';
        test.skip(
          !existsSync(baseline) && !gerandoBaseline,
          `baseline ${path.relative(process.cwd(), baseline)} ausente — gere com ` +
            '`bun run test:e2e -- --project=chromium-contacts-visual --update-snapshots`.',
        );

        await page.addStyleTag({ content: SEM_TOASTS });
        // Fontes vêm do Google Fonts com `display=swap`: sem esperar, a foto pode sair na fonte de fallback.
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`contacts-${vista.nome}-${tema}${SNAPSHOT_EXT}`, {
          maxDiffPixelRatio: 0.002,
          animations: 'disabled',
        });
      });
    }
  });
}
