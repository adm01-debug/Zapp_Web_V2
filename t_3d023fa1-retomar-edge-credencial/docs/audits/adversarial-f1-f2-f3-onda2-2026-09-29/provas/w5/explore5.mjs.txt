import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { prepareContext, BASE, OUT } from './w5-app.mjs';
import { CONTACT_ID } from './w5-mocks.mjs';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await prepareContext(ctx, {});
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30000 });
const skip = page.getByRole('button', { name: /Pular tour/i });
if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(600); }
await page.evaluate((id) => window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId: id } })), CONTACT_ID);
await page.waitForTimeout(4000);

const dump = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].map((b) => ({
    aria: b.getAttribute('aria-label'),
    title: b.getAttribute('title'),
    text: (b.textContent || '').trim().slice(0, 30),
    visible: !!(b.offsetWidth || b.offsetHeight),
  }));
  return { btns: btns.filter((b) => b.aria || b.title || b.text), forms: [...document.querySelectorAll('textarea,input')].map((i) => ({ id: i.id, ph: i.getAttribute('placeholder'), aria: i.getAttribute('aria-label') })) };
});
fs.writeFileSync(`${OUT}/explore5-buttons.json`, JSON.stringify(dump, null, 2));
console.log('--- BOTOES visiveis com rotulo ---');
console.log(dump.btns.filter((b) => b.visible).map((b) => `aria=${b.aria} | title=${b.title} | text=${b.text}`).join('\n'));
console.log('--- INPUTS ---');
console.log(dump.forms.map((f) => JSON.stringify(f)).join('\n'));
await browser.close();
