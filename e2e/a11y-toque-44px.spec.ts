/**
 * t_17d91156 — alvos de toque de 44x44 CSS px em PONTEIRO GROSSO (toque).
 *
 * Mede PIXEL REAL no Chromium com emulação de celular (`devices['Pixel 5']`:
 * `isMobile` + `hasTouch`, que é o que faz o Chromium reportar
 * `matchMedia('(pointer: coarse)') === true`). O gate não olha classe nenhuma: ele lê
 * `boundingBox()` do alvo de verdade renderizado pela aplicação (fechar do dialog e
 * checkbox de seleção do contato) — a única prova que o jsdom não consegue dar.
 *
 * O mesmo arquivo prova o outro lado: no ponteiro FINO (mouse, projeto
 * `chromium-a11y`) os dois alvos continuam compactos, ou seja a regra
 * `@media (pointer: coarse)` de `src/styles/utilities.css` (.alvo-toque-44) NÃO muda o
 * visual do desktop.
 *
 * Deslogado e determinístico: sessão FALSA (`installFakeSession`) + REST mocks; a rede
 * real fica barrada por `bloquearRedeReal` (qualquer request não mockada aparece no
 * `afterEach`). Nada de credencial ou dado de produção (regra R1).
 */
import { test, expect, devices, type Locator, type Page } from '@playwright/test';
import { contactCards, gotoContacts } from './fixtures/contacts-page';
import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';

/** Duas linhas para a tela não cair no estado vazio (o checkbox vive no ContactCard). */
const CONTATOS = [
  {
    id: '3f1c9a10-0000-4000-8000-000000000001',
    name: 'Ana Teste',
    surname: 'Alvo',
    contact_type: 'cliente',
    created_at: '2026-09-01T12:00:00.000Z',
    updated_at: '2026-09-01T12:00:00.000Z',
    phone: '+551****0001',
    email: 'ana.alvo@e2e.local',
    company: 'Promo Brindes',
    job_title: 'Compradora',
    tags: ['e2e'],
    avatar_url: null,
    total_count: 2,
  },
  {
    id: '3f1c9a10-0000-4000-8000-000000000002',
    name: 'Bruno Teste',
    surname: 'Alvo',
    contact_type: 'cliente',
    created_at: '2026-09-02T12:00:00.000Z',
    updated_at: '2026-09-02T12:00:00.000Z',
    phone: '+551****0002',
    email: 'bruno.alvo@e2e.local',
    company: 'Promo Brindes',
    job_title: 'Diretor',
    tags: ['e2e'],
    avatar_url: null,
    total_count: 2,
  },
];

async function mockContatos(page: Page): Promise<void> {
  // A lista da tela vem da RPC `search_contacts` (não do /rest/v1/contacts).
  await page.route(/\/rest\/v1\/rpc\/search_contacts/, (route) => json(route, CONTATOS));
  await page.route(/\/rest\/v1\/rpc\/contacts_count_by_type/, (route) =>
    json(route, [{ contact_type: 'cliente', count: CONTATOS.length }]),
  );
  await page.route(/\/rest\/v1\/rpc\/get_last_message_dates/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/rpc\/can_delete_contacts/, (route) =>
    json(route, CONTATOS.map((c) => ({ contact_id: c.id, can_delete: true }))),
  );
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, CONTATOS));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
}

async function preparar(page: Page, registro: Registro): Promise<void> {
  // Ordem: o guarda entra primeiro e os mocks específicos depois (no Playwright a
  // última rota registrada vence).
  await bloquearRedeReal(page, registro);
  await mockAppShell(page, registro);
  await mockContatos(page);
  await installFakeSession(page);
  await gotoContacts(page);
}

/** Caixa do alvo em px (falha com mensagem clara se o alvo não renderizou). */
async function caixa(alvo: Locator, nome: string) {
  const medida = await alvo.boundingBox();
  expect(medida, `${nome}: alvo sem caixa renderizada`).not.toBeNull();
  return medida!;
}

/** Fechar do dialog (Radix DialogPrimitive.Close) do "Adicionar Contato". */
async function abrirDialogo(page: Page): Promise<Locator> {
  // O FAB é `fixed z-20` e no celular os cards da lista passam por cima dele no hit-test,
  // então ele é acionado pelo teclado (o que também prova que ele é alcançável por foco).
  const fab = page.getByTestId('contact-create-fab');
  await fab.focus();
  await fab.press('Enter');
  const dialogo = page.getByRole('dialog', { name: 'Adicionar Contato' });
  await expect(dialogo).toBeVisible({ timeout: 15_000 });
  return dialogo;
}

/**
 * Espera a animação de entrada do Radix terminar. Durante ela o `boundingBox()` devolve o
 * tamanho ESCALADO (`zoom-in-95`) e a medida sai 43,8px em vez de 44px.
 */
async function esperarEntrada(page: Page, dialogo: Locator): Promise<void> {
  await page.waitForTimeout(250);
  await dialogo.evaluate(async (el) => {
    const animacoes = el.getAnimations({ subtree: true });
    await Promise.race([
      Promise.all(animacoes.map((a) => a.finished.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  });
}

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Emulação de toque do projeto `chromium-a11y` (que usa Desktop Chrome). `defaultBrowserType`
 * não pode ser trocado dentro de um describe, então só os campos de contexto entram: é
 * `isMobile` + `hasTouch` que fazem o Chromium reportar `(pointer: coarse)`.
 */
const PIXEL_5 = devices['Pixel 5'];

test.describe('alvos de toque 44px — celular (ponteiro grosso)', () => {
  test.use({
    viewport: PIXEL_5.viewport,
    deviceScaleFactor: PIXEL_5.deviceScaleFactor,
    isMobile: PIXEL_5.isMobile,
    hasTouch: PIXEL_5.hasTouch,
    userAgent: PIXEL_5.userAgent,
  });

  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await preparar(page, registro);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  test('emulação touch ativa o media query (o teste mediria o media query errado se não)', async ({ page }) => {
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
  });

  test('fechar do dialog e checkbox de seleção medem ≥44x44', async ({ page }) => {
    // ── Checkbox de seleção do contato (vista Cards, padrão da tela) ──
    await page.getByTitle('Cards').click();
    await expect(contactCards(page)).toHaveCount(2);
    const checkbox = page.getByRole('checkbox', { name: 'Selecionar Ana Teste' });
    await expect(checkbox).toBeVisible();
    const c = await caixa(checkbox, 'checkbox de seleção');
    expect(c.width, `largura do checkbox: ${c.width}px`).toBeGreaterThanOrEqual(44);
    expect(c.height, `altura do checkbox: ${c.height}px`).toBeGreaterThanOrEqual(44);

    // O alvo maior continua sendo o controle de verdade: o toque marca a seleção.
    await checkbox.click();
    await expect(page.getByRole('checkbox', { name: 'Desmarcar Ana Teste' })).toHaveAttribute(
      'data-state',
      'checked',
    );

    // ── Botão fechar do dialog ──
    const dialogo = await abrirDialogo(page);
    const fechar = dialogo.getByRole('button', { name: 'Close' });
    await expect(fechar).toBeVisible();
    await esperarEntrada(page, dialogo);
    // Prova DIRETA do alvo: no centro do 44x44, quem recebe o toque é o próprio botão
    // (ou o ícone dentro dele) — não o título nem o overlay.
    const recebe = await fechar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const alvo = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!alvo && (alvo === el || el.contains(alvo));
    });
    expect(recebe, 'o centro do alvo de 44x44 nao recebe o toque').toBe(true);

    const f = await caixa(fechar, 'fechar do dialog');
    expect(f.width, `largura do fechar: ${f.width}px`).toBeGreaterThanOrEqual(44);
    expect(f.height, `altura do fechar: ${f.height}px`).toBeGreaterThanOrEqual(44);

    // E o alvo maior não quebrou a ação: o X ainda fecha o dialog. No celular emulado o
    // Playwright erra o ponto do clique no X (o viewport visual não coincide com o de
    // layout), então aqui o fechamento é por teclado — também é caminho de gente.
    await fechar.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Adicionar Contato' })).toHaveCount(0);
  });
});

test.describe('alvos de toque 44px — desktop (ponteiro fino)', () => {
  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await preparar(page, registro);
  });

  test.afterEach(() => {
    expect(registro.redeBarrada).toEqual([]);
  });

  test('ponteiro fino: nada muda no visual — os alvos continuam compactos', async ({ page }) => {
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(false);

    await page.getByTitle('Cards').click();
    await expect(contactCards(page)).toHaveCount(2);
    const c = await caixa(page.getByRole('checkbox', { name: 'Selecionar Ana Teste' }), 'checkbox de seleção');
    expect(c.width, `largura do checkbox no desktop: ${c.width}px`).toBeLessThanOrEqual(24);
    expect(c.height, `altura do checkbox no desktop: ${c.height}px`).toBeLessThanOrEqual(24);

    const dialogo = await abrirDialogo(page);
    await esperarEntrada(page, dialogo);
    const f = await caixa(dialogo.getByRole('button', { name: 'Close' }), 'fechar do dialog');
    expect(f.width, `largura do fechar no desktop: ${f.width}px`).toBeLessThanOrEqual(32);
    expect(f.height, `altura do fechar no desktop: ${f.height}px`).toBeLessThanOrEqual(32);

    // Ponteiro fino continua fechando no clique (o caminho do mouse).
    await dialogo.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog', { name: 'Adicionar Contato' })).toHaveCount(0);
  });
});
