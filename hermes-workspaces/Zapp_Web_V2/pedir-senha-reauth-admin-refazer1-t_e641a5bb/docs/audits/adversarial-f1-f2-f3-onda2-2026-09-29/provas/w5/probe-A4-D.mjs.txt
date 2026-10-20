// W5 / A4-D — o 2o editor de contato (EditContactDialog) abre com o endereco VAZIO para um
// contato que TEM endereco. Prova dupla: (1) screenshot do campo vazio; (2) payload real no
// HAR — a query `contact-enriched` nao pede nenhuma coluna de endereco (e a resposta nao as tem).
// Caminho 1: Inbox -> Detalhes do Contato -> Mais acoes -> Editar Contato.
// Caminho 2: Inbox -> aba CRM 360 -> card Empresa -> Editar.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { prepareContext, BASE, OUT } from './w5-app.mjs';
import { CONTACT_ID } from './w5-mocks.mjs';

const log = [];
const step = (s) => { log.push(s); console.log(`[W5-A4-D] ${s}`); };
const ADDRESS_COLS = ['postal_code', 'address', 'address_number', 'neighborhood', 'city', 'state', 'latitude', 'longitude'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const mocks = await prepareContext(ctx, { retrieveDelayMs: 300 });
const page = await ctx.newPage();
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30000 });
const skip = page.getByRole('button', { name: /Pular tour/i });
if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(600); }
await page.evaluate((id) => window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId: id } })), CONTACT_ID);
await page.waitForTimeout(4000);
step('conversa aberta com o painel "Detalhes do Contato"');

const panelShows = await page.evaluate((addr) => ({
  painelMostraEndereco: document.body.innerText.includes(addr),
  trecho: (document.body.innerText.match(new RegExp(addr + '[^\\n]*')) || [null])[0],
}), 'Avenida Paulista');
step(`painel/UI mostra "${'Avenida Paulista'}" em algum lugar? ${panelShows.painelMostraEndereco} :: ${panelShows.trecho}`);

const readDialogFields = () => page.evaluate(() => {
  const d = document.querySelector('[data-testid="edit-contact-dialog"]') || document.querySelector('[role="dialog"]');
  const val = (sel) => { const el = d?.querySelector(sel); return el ? el.value : null; };
  return {
    titulo: d?.querySelector('h2,h3')?.textContent?.trim() ?? null,
    name: val('#name'),
    email: val('#email'),
    postal_code: val('#postal_code'),
    address: val('#address'),
    address_number: val('#address_number'),
    neighborhood: val('#neighborhood'),
    city: val('#city'),
    state: val('#state'),
    addressPlaceholder: d?.querySelector('#address')?.getAttribute('placeholder') ?? null,
  };
});

// ---------- Caminho 1: painel do contato ----------
// O gatilho do painel de detalhes tem aria-label="Mais" (Tile com menu DropdownMenu).
await page.locator('[aria-label="Mais"]').first().click();
await page.waitForTimeout(900);
await page.getByRole('menuitem', { name: /Editar Contato/ }).click();
await page.locator('#address').waitFor({ state: 'visible', timeout: 15000 });
await page.waitForTimeout(1200);
const c1 = await readDialogFields();
step(`CAMINHO 1 (Detalhes do Contato): address=${JSON.stringify(c1.address)} number=${JSON.stringify(c1.address_number)} city=${JSON.stringify(c1.city)} cep=${JSON.stringify(c1.postal_code)} | nome=${JSON.stringify(c1.name)} empresa? email=${JSON.stringify(c1.email)}`);
await page.screenshot({ path: `${OUT}/A4-D-1-editor-1-endereco-vazio.png` });

// Payload real: toda query a contacts nesta sessao.
const contactResponses = mocks.traffic
  .filter((t) => t.kind === 'response' && t.url.includes('/rest/v1/contacts'))
  .map((t) => {
    const u = new URL(t.url);
    const body = JSON.parse(t.body);
    const row = Array.isArray(body) ? body[0] : body;
    return { select: u.searchParams.get('select'), colunasNaResposta: row ? Object.keys(row) : [], temColunaDeEndereco: row ? ADDRESS_COLS.filter((c) => c in row) : [] };
  });
step(`payloads de /rest/v1/contacts: ${JSON.stringify(contactResponses)}`);

// Fecha (Cancelar) e vai para o CRM 360
await page.getByRole('button', { name: 'Cancelar' }).first().click();
await page.waitForTimeout(1000);

// ---------- Caminho 2: aba CRM 360 -> card Empresa -> Editar ----------
const tabNames = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map((t) => ({ name: (t.textContent || '').trim(), aria: t.getAttribute('aria-selected') })));
step(`abas visiveis apos fechar o editor: ${JSON.stringify(tabNames)}`);
const crmTab = page.locator('[role="tab"]', { hasText: 'CRM 360' }).first();
await crmTab.click({ timeout: 15000 });
await page.waitForTimeout(3500);
await page.getByTestId('crm360-tab').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
const btnEditar = page.locator('[data-testid="crm360-tab"]').getByRole('button', { name: /^Editar$/ }).first();
const temEditar = await btnEditar.count();
let c2 = null;
if (temEditar) {
  await btnEditar.click();
  await page.locator('#address').waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1200);
  c2 = await readDialogFields();
  step(`CAMINHO 2 (CRM 360): address=${JSON.stringify(c2.address)} city=${JSON.stringify(c2.city)} nome=${JSON.stringify(c2.name)}`);
  await page.screenshot({ path: `${OUT}/A4-D-2-editor-via-crm360-endereco-vazio.png` });
} else {
  step('CAMINHO 2: botao "Editar" do card Empresa nao encontrado');
}

// Prova do payload do 2o editor: a query de dados enriquecidos nao pede coluna de endereco.
const enriched = mocks.traffic
  .filter((t) => t.kind === 'response' && t.url.includes('/rest/v1/contacts') && (new URL(t.url).searchParams.get('select') || '').includes('ai_sentiment'))
  .map((t) => ({ select: new URL(t.url).searchParams.get('select'), body: t.body }));

const result = {
  contatoNoBancoSimulado: { address: 'Avenida Paulista', address_number: '1578', neighborhood: 'Bela Vista', city: 'Sao Paulo', state: 'SP', postal_code: '01310200', latitude: -23.561414, longitude: -46.655881 },
  uiMostraEnderecoEmAlgumLugar: panelShows,
  caminho1_detalhesDoContato: c1,
  caminho2_crm360: c2,
  payloadsContacts: contactResponses,
  queryEnrichedNoHAR: enriched,
};
fs.writeFileSync(`${OUT}/A4-D-result.json`, JSON.stringify(result, null, 2));
fs.writeFileSync(`${OUT}/A4-D-traffic.json`, JSON.stringify(mocks.traffic, null, 2));
fs.writeFileSync(`${OUT}/A4-D-console.log`, consoleLines.join('\n'));
console.log('--- RESULTADO A4-D ---');
console.log(JSON.stringify(result, null, 2));
await browser.close();
