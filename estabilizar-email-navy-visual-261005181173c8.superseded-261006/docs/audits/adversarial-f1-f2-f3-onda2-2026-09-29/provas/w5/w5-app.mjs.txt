// Helpers de navegacao W5: sobe a app real (bundle de producao servido por vite preview)
// com o backend mockado e chega ate o inbox com uma conversa aberta.
import { installMocks, REF, fakeSession } from './w5-mocks.mjs';

export const BASE = process.env.BASE ?? 'http://127.0.0.1:4173';
export const OUT = '/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae/w5-artefatos';
export const CONTACT_NAME = 'W5 Contato Endereco';

/** Prepara contexto: mocks + sessao falsa (sem login humano, sem backend real). */
export async function prepareContext(ctx, opts = {}) {
  const mocks = await installMocks(ctx, opts);
  try {
    await ctx.routeWebSocket('wss://**', (ws) => ws.close());
  } catch { /* engine sem routeWebSocket: o WS falha e o app segue (realtime nao e pre-requisito) */ }
  await ctx.addInitScript(
    ([key, val]) => { try { window.localStorage.setItem(key, val); } catch { /* noop */ } },
    [`sb-${REF}-auth-token`, JSON.stringify(fakeSession())],
  );
  return mocks;
}

/** Navega ate o inbox e abre a conversa da fixture. Devolve a page. */
export async function openInbox(page, { timeout = 30000 } = {}) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#main-navigation').waitFor({ state: 'visible', timeout });

  // Tour de boas-vindas: overlay que bloqueia cliques.
  const skip = page.getByRole('button', { name: /Pular tour/i });
  if (await skip.count()) {
    await skip.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }

  // Chip "Todas" nao filtra por assigned_to (o chip padrao depende do FSM/atribuicao).
  const todas = page.locator('button', { hasText: /^Todas/ }).first();
  if (await todas.count()) {
    await todas.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
  }

  // Abre a conversa da fixture.
  const item = page.getByText(CONTACT_NAME, { exact: false }).first();
  await item.waitFor({ state: 'visible', timeout: 15000 });
  await item.click();
  await page.waitForTimeout(1500);
  return page;
}
