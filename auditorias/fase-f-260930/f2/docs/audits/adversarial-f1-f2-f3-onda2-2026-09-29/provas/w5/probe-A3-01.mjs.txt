// W5 / A3-01 — clique duplo numa sugestao de endereco com /retrieve atrasado.
// Alvo: bundle REAL (dist/ de producao servido por vite preview), navegador real,
// backend mockado. Prova: (1) toast DESTRUTIVO falso "Nao consegui obter a coordenada";
// (2) a localizacao e aplicada DEPOIS; (3) N-1 /retrieve e N-1 sessoes a mais.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { prepareContext, BASE, OUT } from './w5-app.mjs';
import { CONTACT_ID } from './w5-mocks.mjs';

const T = [];
const mark = (label) => { T.push({ t: Date.now(), label }); console.log(`[W5-A3-01] ${label}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const mocks = await prepareContext(ctx, { retrieveDelayMs: 1400, suggestDelayMs: 120 });
const page = await ctx.newPage();
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30000 });
const skip = page.getByRole('button', { name: /Pular tour/i });
if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(600); }

// Abre a conversa da fixture (mesmo evento que a busca global dispara).
await page.evaluate((id) => {
  window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId: id } }));
}, CONTACT_ID);
await page.waitForTimeout(3500);
mark('conversa aberta no inbox');

// Abre o picker de localizacao pelo caminho real: botao "Mais" do composer ->
// item "Localizacao" (TertiaryToolsMenu, aria-label "Enviar localização").
const mais = page.getByRole('button', { name: 'Mais', exact: true }).first();
await mais.click();
mark('menu "Mais" do composer aberto');
const locItem = page.getByRole('button', { name: 'Enviar localização', exact: true });
await locItem.first().waitFor({ state: 'visible', timeout: 10000 });
await locItem.first().click();
await page.getByText('Compartilhar Localização').first().waitFor({ state: 'visible', timeout: 15000 });
mark('LocationPicker aberto');

// Aba "Escolher no Mapa" — e o ramo onde o autocomplete atras da flag roda.
await page.getByRole('tab', { name: /Escolher no Mapa/i }).click();
const combo = page.getByRole('combobox');
await combo.waitFor({ state: 'visible', timeout: 10000 });
mark('aba "Escolher no Mapa" ativa; combobox visivel');

// Digita >=3 caracteres -> debounce 300ms -> /suggest.
await combo.fill('Avenida Pau');
const options = page.locator('[role="option"]');
await options.first().waitFor({ state: 'visible', timeout: 15000 });
const optionCount = await options.count();
mark(`lista de sugestoes visivel (opcoes=${optionCount}) status=ok`);

const retrievesBefore = mocks.traffic.filter((t) => t.url.includes('/retrieve/')).length;

// ---- O DEFEITO: clique duplo no MESMO item enquanto o /retrieve esta em voo ----
mark('CLIQUE DUPLO na 1a sugestao (clickCount=2)');
const t0 = Date.now();
await options.first().click({ clickCount: 2, force: true });

// O toast destrutivo falso deve aparecer.
const toast = page.getByText('Não consegui obter a coordenada', { exact: false });
let toastVisible = false;
try {
  await toast.first().waitFor({ state: 'visible', timeout: 8000 });
  toastVisible = true;
  mark(`TOAST DESTRUTIVO visivel (t+${Date.now() - t0}ms)`);
} catch {
  mark('toast NAO apareceu');
}
await page.screenshot({ path: `${OUT}/A3-01-toast.png` });

const toastHtml = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('[data-radix-toast-viewport] li, li[data-state]')];
  const hit = nodes.find((n) => (n.textContent || '').includes('Não consegui obter a coordenada'));
  if (!hit) return { found: false };
  const cs = getComputedStyle(hit);
  return {
    found: true,
    destructiveClass: hit.className.includes('destructive'),
    className: hit.className,
    backgroundColor: cs.backgroundColor,
    borderColor: cs.borderTopColor,
    role: hit.getAttribute('role'),
    text: (hit.textContent || '').trim(),
    titleEl: (hit.querySelector('[data-radix-toast-title], [class*="title"]')?.textContent || '').trim(),
    descEl: (hit.querySelector('[data-radix-toast-description], [class*="description"]')?.textContent || '').trim(),
  };
});

// Depois do toast: a localizacao e aplicada (o defeito e o toast falso, nao a perda).
const applied = page.getByText('Avenida Paulista', { exact: false });
let appliedVisible = false;
try {
  await applied.first().waitFor({ state: 'visible', timeout: 12000 });
  appliedVisible = true;
  mark(`LOCALIZACAO APLICADA depois do toast (t+${Date.now() - t0}ms)`);
} catch {
  mark('localizacao NAO aplicada');
}
await page.screenshot({ path: `${OUT}/A3-01-aplicado.png` });

const retrieves = mocks.traffic.filter((t) => t.url.includes('/retrieve/'));
const suggests = mocks.traffic.filter((t) => t.url.includes('/suggest'));
const sessions = retrieves.map((r) => new URL(r.url).searchParams.get('session_token'));
const suggestSessions = suggests.map((r) => new URL(r.url).searchParams.get('session_token'));

const result = {
  opcoesNaLista: optionCount,
  toastDestrutivoVisivel: toastVisible,
  toastHtml,
  localizacaoAplicadaDepois: appliedVisible,
  cliquesIntencionais: 1,
  retrieveRequests: retrieves.length,
  retrieveRequestsAntesDoClique: retrievesBefore,
  retrieveRequestsExtras: retrieves.length - retrievesBefore - 1,
  sessionTokensNosRetrieve: sessions,
  sessionTokensDistintos: [...new Set(sessions)].length,
  suggestRequests: suggests.length,
  sessionTokensNosSuggest: suggestSessions,
  retrieveUrls: retrieves.map((r) => new URL(r.url).pathname),
  appliedText: appliedVisible ? (await applied.first().textContent()) : null,
  timeline: T.map((x) => `+${x.t - t0}ms ${x.label}`),
};
fs.writeFileSync(`${OUT}/A3-01-result.json`, JSON.stringify(result, null, 2));
fs.writeFileSync(`${OUT}/A3-01-traffic.json`, JSON.stringify(mocks.traffic, null, 2));
fs.writeFileSync(`${OUT}/A3-01-console.log`, consoleLines.join('\n'));

console.log('--- RESULTADO A3-01 ---');
console.log(JSON.stringify({ ...result, retrieveUrls: undefined, timeline: undefined, toastHtml: undefined }, null, 2));
console.log('--- TIMELINE ---');
console.log(result.timeline.join('\n'));
console.log('--- TOAST (diagnostico destrutivo) ---');
console.log(JSON.stringify(toastHtml, null, 2));

await browser.close();
