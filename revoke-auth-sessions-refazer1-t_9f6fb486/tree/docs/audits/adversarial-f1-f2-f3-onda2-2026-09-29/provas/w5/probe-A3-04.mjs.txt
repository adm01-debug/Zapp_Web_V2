// W5 / A3-04 — a pausa de 429 nao se encerra sozinha e o botao "Tentar novamente"
// some ao ser clicado durante o backoff. Bundle REAL (dist/ + vite preview), navegador real.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { prepareContext, BASE, OUT } from './w5-app.mjs';
import { CONTACT_ID } from './w5-mocks.mjs';

const log = [];
const step = (s) => { log.push(s); console.log(`[W5-A3-04] ${s}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
// /suggest sempre 429 enquanto o flag de bloqueio estiver ligado.
let suggestMode = '429';
const mocks = await prepareContext(ctx, {
  retrieveDelayMs: 300,
  suggestDelayMs: 80,
  suggestStatus: () => (suggestMode === '429' ? 429 : 200),
});

const page = await ctx.newPage();
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30000 });
const skip = page.getByRole('button', { name: /Pular tour/i });
if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(600); }

await page.evaluate((id) => window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId: id } })), CONTACT_ID);
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Mais', exact: true }).first().click();
await page.getByRole('button', { name: 'Enviar localização', exact: true }).first().click();
await page.getByText('Compartilhar Localização').first().waitFor({ state: 'visible', timeout: 15000 });
await page.getByRole('tab', { name: /Escolher no Mapa/i }).click();
const combo = page.getByRole('combobox');
await combo.waitFor({ state: 'visible', timeout: 10000 });
step('picker aberto na aba Mapa');

// Dispara o primeiro /suggest -> 429
await combo.fill('Avenida Pau');
await page.waitForTimeout(3000);
const suggestCountBeforeRetry = mocks.traffic.filter((t) => t.url.includes('/suggest')).length;

const stateOf = async () => {
  const txt = await page.evaluate(() => document.body.innerText);
  const inList = await page.evaluate(() => {
    const lb = document.querySelector('[role="listbox"]');
    if (!lb) return { retry: 0, options: 0 };
    return {
      retry: [...lb.querySelectorAll('button')].filter((b) => (b.textContent || '').includes('Tentar novamente')).length,
      options: lb.querySelectorAll('[role="option"]').length,
    };
  });
  return {
    erroTitulo: txt.includes('Falha ao buscar sugestões.'),
    causa429: txt.includes('Limite de buscas atingido'),
    pausaTexto: (txt.match(/Sugestões pausadas[^\n]*/) || [null])[0],
    retryButton: inList.retry,
    opcoesNaLista: inList.options,
  };
};

const s1 = await stateOf();
step(`estado pos-429: erro=${s1.erroTitulo} causa=${s1.causa429} botaoRetry=${s1.retryButton}`);
await page.screenshot({ path: `${OUT}/A3-04-1-erro-com-retry.png` });

// ---- O DEFEITO: clicar em "Tentar novamente" DURANTE o backoff → o botao some ----
await page.locator('[role="listbox"]').getByRole('button', { name: 'Tentar novamente' }).first().click();
await page.waitForTimeout(1500);
const s2 = await stateOf();
const suggestAposRetry = mocks.traffic.filter((t) => t.url.includes('/suggest')).length;
step(`apos clicar em Tentar novamente: pausaTexto="${s2.pausaTexto}" botaoRetry=${s2.retryButton} suggests=${suggestAposRetry} (antes=${suggestCountBeforeRetry})`);
await page.screenshot({ path: `${OUT}/A3-04-2-pausado-sem-botao.png` });

// ---- Contador chegando a 0 e nao religando sozinho ----
const frames = [];
const t0 = Date.now();
for (const waitMs of [0, 20000, 42000, 63000, 75000]) {
  const elapsed = Date.now() - t0;
  if (waitMs > elapsed) await page.waitForTimeout(waitMs - elapsed);
  const st = await stateOf();
  const suggests = mocks.traffic.filter((t) => t.url.includes('/suggest')).length;
  frames.push({ t: `+${Math.round((Date.now() - t0) / 1000)}s`, pausaTexto: st.pausaTexto, retryButton: st.retryButton, suggestRequests: suggests });
  step(`t+${Math.round((Date.now() - t0) / 1000)}s pausa="${st.pausaTexto}" botaoRetry=${st.retryButton} suggest=${suggests}`);
}
await page.screenshot({ path: `${OUT}/A3-04-3-pausa-expirada-em-0s.png` });

// ---- Controle: digitar de novo DEPOIS do backoff faz voltar a buscar (prova de que o
// defeito e nao haver retomada automatica, e nao um bloqueio permanente) ----
suggestMode = '200';
await combo.fill('Avenida Paulist');
await page.waitForTimeout(4000);
const stAfter = await stateOf();
const suggestsAfter = mocks.traffic.filter((t) => t.url.includes('/suggest')).length;
step(`controle pos-backoff com tecla: status ok? ${!stAfter.erroTitulo && !stAfter.pausaTexto} suggest=${suggestsAfter}`);
await page.screenshot({ path: `${OUT}/A3-04-4-controle-volta-ao-digitar.png` });

const result = {
  estadoPos429: s1,
  estadoAposClicarRetry: s2,
  suggestRequestsAposRetryDuranteBackoff: suggestAposRetry,
  suggestRequestsAntesDoRetry: suggestCountBeforeRetry,
  contador: frames,
  voltaAoDigitar: { pausa: stAfter.pausaTexto, suggestRequests: suggestsAfter },
  totalSuggestRequests: mocks.traffic.filter((t) => t.url.includes('/suggest')).length,
};
fs.writeFileSync(`${OUT}/A3-04-result.json`, JSON.stringify(result, null, 2));
fs.writeFileSync(`${OUT}/A3-04-traffic.json`, JSON.stringify(mocks.traffic, null, 2));
fs.writeFileSync(`${OUT}/A3-04-console.log`, consoleLines.join('\n'));
console.log('--- RESULTADO A3-04 ---');
console.log(JSON.stringify(result, null, 2));
await browser.close();
