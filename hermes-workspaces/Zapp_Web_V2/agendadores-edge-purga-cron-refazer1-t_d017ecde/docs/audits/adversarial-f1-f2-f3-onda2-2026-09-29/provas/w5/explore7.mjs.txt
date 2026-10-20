import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { prepareContext, BASE, OUT } from './w5-app.mjs';
import { CONTACT_ID } from './w5-mocks.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await prepareContext(ctx, {});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30000 });
const skip = page.getByRole('button', { name: /Pular tour/i });
if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(600); }
await page.evaluate((id) => window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId: id } })), CONTACT_ID);
await page.waitForTimeout(4500);

const n = await page.getByRole('button', { name: 'Mais ações' }).count();
console.log('botoes "Mais ações":', n);
for (let i = 0; i < n; i++) {
  const b = page.getByRole('button', { name: 'Mais ações' }).nth(i);
  const box = await b.boundingBox();
  console.log(`[${i}] visible=${await b.isVisible()} box=${JSON.stringify(box)}`);
}
const btn = page.getByRole('button', { name: 'Mais ações' }).last();
await btn.click({ force: true });
await page.waitForTimeout(1500);

const dump = await page.evaluate(() => ({
  menuitems: [...document.querySelectorAll('[role="menuitem"]')].map((m) => (m.textContent || '').trim()),
  dataRadix: [...document.querySelectorAll('[data-radix-popper-content-wrapper] *')].map((m) => (m.textContent || '').trim()).filter((t) => t && t.length < 40).slice(0, 30),
  anyEditText: [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && /Editar/.test(e.textContent || '')).map((e) => (e.textContent || '').trim()).slice(0, 10),
}));
fs.writeFileSync(`${OUT}/explore7.json`, JSON.stringify(dump, null, 2));
console.log('--- MENUITEMS ---'); console.log(JSON.stringify(dump.menuitems));
console.log('--- RADIX ---'); console.log(JSON.stringify(dump.dataRadix));
console.log('--- TEXTOS COM "Editar" ---'); console.log(JSON.stringify(dump.anyEditText));
await page.screenshot({ path: `${OUT}/explore7-menu.png` });
await browser.close();
