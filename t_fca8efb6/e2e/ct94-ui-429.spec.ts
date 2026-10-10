import { test, expect } from '@playwright/test';

// CT-94 — a UI reagindo ao 429, disparado PELA TELA.
// Duas medicoes guiaram este teste:
//  1) 65 aberturas SEQUENCIAIS levam ~1,6 min -> a janela de 60s rola, o contador nao
//     passa de ~40 e nao ha 429. Precisa de TAXA.
//  2) navegar de novo sem esperar o dado chegar CANCELA o fetch em voo (8 paginas
//     produziram so 2 chamadas). Precisa esperar o KPI strip.
// Logo: varias paginas em paralelo, cada uma esperando o dado antes de recarregar.
test.use({ storageState: 'e2e/.auth/user.json' });

test('CT-94: a tela do catalogo reagindo ao 429 (rajada pela propria UI)', async ({ page }) => {
  test.setTimeout(240_000);
  const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://zapp-web-v2.vercel.app';
  const status: string[] = [];
  const registrar = (p: typeof page) => {
    p.on('response', (r) => {
      if (r.url().includes('/functions/v1/promogifts-catalog')) status.push(String(r.status()));
    });
  };
  registrar(page);

  const esperarDados = async (p: typeof page) => {
    await p
      .waitForSelector('[data-testid="catalog-kpi-strip"], [data-testid="catalog-kpi-strip-placeholder"]', { timeout: 25000 })
      .catch(() => {});
  };

  const inicio = Date.now();
  const paginas = await Promise.all(Array.from({ length: 8 }, () => page.context().newPage()));
  paginas.forEach(registrar);
  await Promise.all(paginas.map(async (p) => {
    for (let i = 0; i < 12 && !status.includes('429'); i++) {
      await p.goto(BASE + '/?view=catalog', { waitUntil: 'domcontentloaded' }).catch(() => {});
      const pular = p.getByRole('button', { name: /pular tour/i });
      if (await pular.count().catch(() => 0)) await pular.first().click().catch(() => {});
      await esperarDados(p);       // sem isso a proxima navegacao cancela o fetch
    }
  }));
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  // a prova visual sai da tela principal, que tambem participou da rajada
  await page.goto(BASE + '/?view=catalog', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const pular = page.getByRole('button', { name: /pular tour/i });
  if (await pular.count().catch(() => 0)) await pular.first().click().catch(() => {});
  await esperarDados(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '.tmp/ct94-ui-429.png', fullPage: true });
  await Promise.all(paginas.map((p) => p.close().catch(() => {})));

  console.warn('CT-94 | ' + status.length + ' chamadas em ' + segundos + 's | status: [' + [...new Set(status)].join(',') + ']');
  expect(status).toContain('429');
});
