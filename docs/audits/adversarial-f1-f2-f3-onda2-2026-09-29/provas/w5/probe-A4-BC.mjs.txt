// W5 / A4-C + A4-B — com a flag `mapa.searchbox-autocomplete` DESLIGADA (mock da RPC de flags):
//  (C) o picker do inbox cai no ramo legado: a "terceira copia" da lista nao tem estado de
//      busca/causa-de-falha — durante e depois de uma falha a area da lista fica vazia;
//  (B) o CADASTRO de contato (ContactForm) continua chamando /suggest — a flag e ignorada ali.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { prepareContext, BASE, OUT } from './w5-app.mjs';
import { CONTACT_ID } from './w5-mocks.mjs';

const log = [];
const step = (s) => { log.push(s); console.log(`[W5-A4] ${s}`); };
let forwardStatus = 500;
let forwardDelayMs = 2500;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const mocks = await prepareContext(ctx, {
  flags: [
    { key: 'mapa.searchbox-autocomplete', enabled: false },
    { key: 'inbox.status-fsm', enabled: true },
  ],
  retrieveDelayMs: 300,
  suggestDelayMs: 100,
  forwardStatus: () => forwardStatus,
  forwardDelayMs: () => forwardDelayMs,
});

const page = await ctx.newPage();
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));

const count = (frag) => mocks.traffic.filter((t) => t.url.includes(frag)).length;
const probe = () => page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const dtext = d ? d.innerText : '';
  // A "terceira copia" e o bloco renderizado por LocationPicker.tsx:218-233 — so existe quando ha
  // resultados. O marcador e o texto "Escolha o endereco certo:".
  const legacyMarker = 'Escolha o endereço certo';
  const legacyBlock = [...document.querySelectorAll('[role="dialog"] div')]
    .filter((el) => (el.textContent || '').includes(legacyMarker))
    .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
  const toast = [...document.querySelectorAll('li[data-state], [data-radix-toast-viewport] li')]
    .map((n) => (n.textContent || '').trim()).filter(Boolean);
  const buscouAlgo = [...document.querySelectorAll('[role="dialog"] button')].some((b) => (b.textContent || '').trim() === 'Buscar');
  return {
    listbox: document.querySelectorAll('[role="listbox"]').length,
    roleOption: document.querySelectorAll('[role="option"]').length,
    listaLegadaVisivel: !!legacyBlock,
    itensLegado: legacyBlock ? [...legacyBlock.querySelectorAll('button')].length : 0,
    legadoBlockHtml: legacyBlock ? legacyBlock.outerHTML.slice(0, 600) : null,
    spinnerNoBotaoBuscar: !!d && !!d.querySelector('button svg.animate-spin'),
    buscaDesabilitadaDuranteRequest: (() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => (x.textContent || '').trim() === 'Buscar' || (x.querySelector('svg.animate-spin') && x.closest('[role="dialog"]'))); return b ? b.disabled : null; })(),
    toasts: toast,
    botaoBuscarPresente: buscouAlgo,
    dialogTextoSemQuebras: dtext.replace(/\n+/g, ' | ').slice(0, 400),
  };
});

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30000 });
const skip = page.getByRole('button', { name: /Pular tour/i });
if (await skip.count()) { await skip.first().click().catch(() => {}); await page.waitForTimeout(600); }

// ============================ A4-C ============================
await page.evaluate((id) => window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId: id } })), CONTACT_ID);
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Mais', exact: true }).first().click();
await page.getByRole('button', { name: 'Enviar localização', exact: true }).first().click();
await page.getByText('Compartilhar Localização').first().waitFor({ state: 'visible', timeout: 15000 });
await page.getByRole('tab', { name: /Escolher no Mapa/i }).click();
await page.waitForTimeout(800);

const branch = await probe();
step(`ramo flag OFF: listbox=${branch.listbox} roleOption=${branch.roleOption} listaLegadaVisivel=${branch.listaLegadaVisivel}`);
await page.screenshot({ path: `${OUT}/A4-C-1-ramo-legado.png` });

const suggestsAntesC = count('/suggest');
await page.locator('input[placeholder="Buscar endereço..."]').fill('Avenida Pau');
const antesDaBusca = await probe();
await page.getByRole('button', { name: 'Buscar', exact: true }).click();

await page.waitForTimeout(900);
const emVoo = await probe();
step(`BUSCA EM VOO: listaLegadaVisivel=${emVoo.listaLegadaVisivel} spinnerNoBotao=${emVoo.spinnerNoBotaoBuscar} listbox=${emVoo.listbox}`);
await page.screenshot({ path: `${OUT}/A4-C-2-busca-em-voo-sem-estado.png` });

await page.waitForTimeout(4000);
const aposFalha = await probe();
step(`APOS FALHA DO /forward: listaLegadaVisivel=${aposFalha.listaLegadaVisivel} listbox=${aposFalha.listbox} roleOption=${aposFalha.roleOption} toast=${JSON.stringify(aposFalha.toasts)}`);
step(`texto do dialog apos a falha: ${JSON.stringify(aposFalha.dialogTextoSemQuebras)}`);
await page.screenshot({ path: `${OUT}/A4-C-3-falha-sem-estado-na-lista.png` });

// Sucesso do /forward -> lista legada aparece (sem role/ícone/destaque)
forwardStatus = 200;
forwardDelayMs = 200;
await page.getByRole('button', { name: 'Buscar', exact: true }).click();
await page.waitForTimeout(3000);
const sucesso = await probe();
const legadoHtml = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const btns = [...d.querySelectorAll('button')].filter((b) => (b.textContent || '').includes('Endereco W5'));
  return { nItens: btns.length, primeiroHtml: btns[0] ? btns[0].outerHTML.slice(0, 300) : null };
});
step(`sucesso do /forward: itens=${legadoHtml.nItens} roleOption=${sucesso.roleOption} listbox=${sucesso.listbox}`);
await page.screenshot({ path: `${OUT}/A4-C-4-lista-legada-sem-estado.png` });

// ============================ A4-B ============================
await page.getByRole('button', { name: 'Cancelar' }).first().click();
await page.waitForTimeout(1500);
const suggestsAntesB = count('/suggest');

await page.getByRole('button', { name: /Contatos/ }).first().click();
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Novo Contato' }).first().click();
await page.locator('#address').waitFor({ state: 'visible', timeout: 15000 });
step('dialogo "Novo Contato" (cadastro) aberto com o campo Logradouro');

await page.locator('#address').fill('Avenida Pau');
await page.waitForTimeout(4000);
const suggestsDepoisB = count('/suggest');
const formState = await page.evaluate(() => {
  const lb = document.querySelector('[role="listbox"]');
  return {
    listbox: !!lb,
    opcoes: lb ? lb.querySelectorAll('[role="option"]').length : 0,
    conteudo: lb ? (lb.innerText || '').replace(/\n+/g, ' | ').slice(0, 200) : null,
    combobox: document.querySelectorAll('[role="combobox"]').length,
  };
});
step(`CADASTRO com flag OFF: /suggest antes=${suggestsAntesB} depois=${suggestsDepoisB} (delta=${suggestsDepoisB - suggestsAntesB}) listbox=${formState.listbox} opcoes=${formState.opcoes}`);
await page.screenshot({ path: `${OUT}/A4-B-cadastro-buscando-com-flag-off.png` });

const suggestUrls = mocks.traffic.filter((t) => t.url.includes('/suggest')).map((t) => t.url);
const result = {
  flagSimulada: 'mapa.searchbox-autocomplete = false (resposta da RPC de flags mockada no navegador)',
  A4C: {
    ramoDoPicker: branch,
    suggestsNoPickerComFlagOff: suggestsAntesC,
    buscaEmVoo: emVoo,
    aposFalha,
    antesDaBusca,
    listaLegadaSucesso: { ...legadoHtml, ...sucesso },
  },
  A4B: {
    suggestRequestsAntesDoCadastro: suggestsAntesB,
    suggestRequestsDepoisDoCadastro: suggestsDepoisB,
    deltaSuggest: suggestsDepoisB - suggestsAntesB,
    formState,
    urlsSuggest: suggestUrls,
    sessionTokens: suggestUrls.map((u) => new URL(u).searchParams.get('session_token')),
  },
};
fs.writeFileSync(`${OUT}/A4-BC-result.json`, JSON.stringify(result, null, 2));
fs.writeFileSync(`${OUT}/A4-BC-traffic.json`, JSON.stringify(mocks.traffic, null, 2));
fs.writeFileSync(`${OUT}/A4-BC-console.log`, consoleLines.join('\n'));
console.log('--- RESULTADO A4-B / A4-C ---');
console.log(JSON.stringify(result, null, 2));
await browser.close();
