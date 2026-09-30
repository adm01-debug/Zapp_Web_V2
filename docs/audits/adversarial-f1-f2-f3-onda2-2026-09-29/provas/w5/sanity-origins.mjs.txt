// Sanidade: garante que NENHUM request saiu para fora dos mocks durante um fluxo completo.
import { chromium } from '@playwright/test';
import { prepareContext, BASE, OUT } from './w5-app.mjs';
import { CONTACT_ID } from './w5-mocks.mjs';
import fs from 'node:fs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const mocks = await prepareContext(ctx, { retrieveDelayMs: 300 });
const seen = new Map();
const failed = [];
ctx.on('request', (r) => {
  const o = new URL(r.url()).origin;
  seen.set(o, (seen.get(o) ?? 0) + 1);
});
ctx.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url().slice(0, 120)} :: ${r.failure()?.errorText}`));

const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30000 });
const skip = page.getByRole('button', { name: /Pular tour/i });
if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(600); }
await page.evaluate((id) => window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId: id } })), CONTACT_ID);
await page.waitForTimeout(4000);
await page.getByRole('button', { name: 'Mais', exact: true }).first().click();
await page.getByRole('button', { name: 'Enviar localização', exact: true }).first().click();
await page.waitForTimeout(1500);
await page.getByRole('tab', { name: /Escolher no Mapa/i }).click();
const combo = page.getByRole('combobox');
await combo.waitFor({ state: 'visible', timeout: 10000 });
await combo.fill('Avenida Pau');
await page.getByRole('option').first().waitFor({ state: 'visible', timeout: 15000 });
await page.getByRole('option').first().click({ clickCount: 2, force: true });
await page.waitForTimeout(4000);

const out = { origens: Object.fromEntries([...seen.entries()].sort((a, b) => b[1] - a[1])), requestsfalhos: failed };
fs.writeFileSync(`${OUT}/sanity-origins.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
