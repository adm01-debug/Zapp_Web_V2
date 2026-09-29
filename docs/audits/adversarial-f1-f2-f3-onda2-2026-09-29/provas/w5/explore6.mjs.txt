import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { prepareContext, BASE, OUT } from './w5-app.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await prepareContext(ctx, { flags: [{ key: 'mapa.searchbox-autocomplete', enabled: false }, { key: 'inbox.status-fsm', enabled: true }] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30000 });
const skip = page.getByRole('button', { name: /Pular tour/i });
if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(600); }

// Vai para Contatos pela sidebar
const contatos = page.getByRole('button', { name: /Contatos/ }).first();
console.log('contatos nav count:', await contatos.count());
await contatos.click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/explore6-contatos.png` });

const dump = await page.evaluate(() => ({
  body: document.body.innerText.slice(0, 1200),
  btns: [...document.querySelectorAll('button')].map((b) => ({ aria: b.getAttribute('aria-label'), text: (b.textContent || '').trim().slice(0, 34), vis: !!(b.offsetWidth || b.offsetHeight) })).filter((b) => b.vis && (b.aria || b.text)),
  inputs: [...document.querySelectorAll('input')].map((i) => ({ id: i.id, ph: i.getAttribute('placeholder'), aria: i.getAttribute('aria-label') })),
}));
fs.writeFileSync(`${OUT}/explore6.json`, JSON.stringify(dump, null, 2));
console.log('--- INPUTS ---');
console.log(dump.inputs.map((i) => JSON.stringify(i)).join('\n'));
console.log('--- BOTOES ---');
console.log(dump.btns.map((b) => `aria=${b.aria} | text=${b.text}`).join('\n'));
console.log('--- BODY ---');
console.log(dump.body);
await browser.close();
