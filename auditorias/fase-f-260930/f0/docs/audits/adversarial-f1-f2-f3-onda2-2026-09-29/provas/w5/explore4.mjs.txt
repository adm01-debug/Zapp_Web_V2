import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { prepareContext, OUT } from './w5-app.mjs';
import { BASE } from './w5-app.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const mocks = await prepareContext(ctx);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30000 });
const skip = page.getByRole('button', { name: /Pular tour/i });
if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(800); }
await page.waitForTimeout(3000);

const dump = await page.evaluate(() => {
  const sidebar = document.querySelector('[data-testid="conversation-list"], aside, [role="complementary"]');
  const all = [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').includes('Sem conversas'));
  return {
    sidebarHtml: (sidebar?.innerHTML ?? '(sem sidebar)').slice(0, 4000),
    emptyStateEls: all.length,
    online: navigator.onLine,
  };
});
fs.writeFileSync(`${OUT}/explore4-sidebar.html`, dump.sidebarHtml);
console.log('emptyStateEls:', dump.emptyStateEls);
console.log('--- SIDEBAR HTML (2500) ---');
console.log(dump.sidebarHtml.slice(0, 2500));

// Tenta o deep-link de contato (mesmo evento que a busca global usa).
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId: '04dff4dc-c6b1-4283-ac22-bd8639804759' } }));
});
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/explore4-deeplink.png` });
const after = await page.evaluate(() => document.body.innerText.slice(0, 900));
console.log('--- BODY AFTER DEEPLINK ---');
console.log(after);

const ep = {};
for (const t of mocks.traffic) { const u = new URL(t.url); const k = `${t.method} ${u.pathname}${u.search.slice(0, 90)}`; ep[k] = (ep[k] ?? 0) + 1; }
console.log('--- ENDPOINTS ---');
console.log(Object.entries(ep).map(([k, v]) => `${v}x ${k}`).join('\n'));
await browser.close();
