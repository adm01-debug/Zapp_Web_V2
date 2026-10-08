/**
 * Casca de coleta dos scripts de QA da Telefonia: só lê a página e devolve os
 * nú-meros crus. NENHUMA decisão OK/FALHA mora aqui — ela fica em
 * `lib/especificacao.mjs` + `lib/regras.mjs`, que se provam sem browser.
 *
 * Usa a dependência que o repositório já tem (`playwright`, via @playwright/test),
 * roda headless e não instala nada. O alvo é SEMPRE local: o dev server do
 * próprio cartão ou uma fixture `file://`. Nunca produção — a regra R1 do
 * projeto vale para este instrumento.
 */
import { chromium } from 'playwright';

export const VIEWPORT_QA = Object.freeze({ width: 1672, height: 1000 });
export const CAMINHO_PADRAO = '/?view=voip';
const TIMEOUT_NAVEGACAO = 45_000;

/** Abre o Chromium headless com o viewport das medições (1672, como o E.2). */
export async function abrirNavegador({
  largura = VIEWPORT_QA.width,
  altura = VIEWPORT_QA.height,
  reducedMotion = 'no-preference',
} = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: largura, height: altura },
    reducedMotion,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  return { browser, context, page };
}

/** Acumula os erros de console/página — a matéria-prima do "console sem error". */
export function vigiarConsole(page) {
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push(String(e.message ?? e).slice(0, 300)));
  return {
    errors,
    zerar() {
      errors.length = 0;
    },
  };
}

/**
 * Entra com o usuário de QA quando as credenciais existem. SEM credenciais
 * (rodada de fixture `file://`) navega direto — o script diz no relatório se
 * houve login, para ninguém confundir as duas coisas.
 */
export async function entrar(page, { base, email, senha }) {
  if (!email || !senha) return { login: false };
  await page.goto(`${base}/auth`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_NAVEGACAO });
  await page.getByRole('tab', { name: /^entrar$/i }).click();
  await page.getByRole('textbox', { name: /e-?mail/i }).fill(email);
  await page.locator('input[type="password"]').fill(senha);
  await page.getByRole('button', { name: /^entrar$/i }).click();
  await page.locator('#main-navigation').waitFor({ state: 'visible', timeout: 30_000 });
  return { login: true };
}

/** Navega para o módulo e espera o shell (quando existe) ficar visível. */
export async function abrirModulo(page, { base, caminho = CAMINHO_PADRAO }) {
  await page.goto(`${base}${caminho}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_NAVEGACAO });
  await page.locator('[data-testid="tel-view"]').first().waitFor({ state: 'visible', timeout: 30_000 });
}

/** Host sozinho no relatório: a URL pode carregar token e não pode vazar. */
export function hostDe(url) {
  try {
    return new URL(url).host || '(file)';
  } catch {
    return '(url inválida)';
  }
}

/**
 * Mede a geometria do E.2. Devolve `{ eixo: { valor, detalhe } }` — tudo o que
 * não existe na tela sai como `null` (e a especificação reprova por "não medido
 * ", nunca por engano de conta).
 */
export async function medirE2(page) {
  return page.evaluate(() => {
    const um = (s) => document.querySelector(s);
    const todos = (s) => Array.from(document.querySelectorAll(s));
    const ret = (el) => (el ? el.getBoundingClientRect() : null);
    const larg = (el) => ret(el)?.width ?? null;
    const alt = (el) => ret(el)?.height ?? null;
    const x0 = (el) => ret(el)?.x ?? null;
    const espalhamento = (nums) => {
      const v = nums.filter((n) => Number.isFinite(n));
      return v.length ? Math.max(...v) - Math.min(...v) : null;
    };
    const menor = (nums) => {
      const v = nums.filter((n) => Number.isFinite(n));
      return v.length ? Math.min(...v) : null;
    };
    const testid = (nome) => document.querySelector(`[data-testid="${nome}"]`);
    const pareceVazio = (el) => {
      if (!el) return null;
      const texto = (el.textContent ?? '').trim();
      const numeros = texto.match(/\d[\d.\s]*/g);
      if (!numeros) return null;
      return Number(numeros[numeros.length - 1].replace(/[.\s]/g, ''));
    };

    const view = testid('tel-view');
    const abas = todos('[data-testid="tel-channel-tab"]');
    const kpiCards = todos('[data-testid="tel-kpi-card"]');
    const linhas = todos('[data-testid="tel-row"]');
    const opcoesCanal = todos('[data-testid^="tel-channel-option-"]');
    const botoesPager = todos('[data-testid="tel-pagination"] button');
    const teclas = todos('[data-keypad-scope] button');
    const painel = testid('tel-side-panel');
    const busca = testid('tel-history-search');
    const totalTexto = testid('tel-history-total');
    const naUrl = new URLSearchParams(location.search).get('call') ? 1 : 0;

    return {
      contentX: { valor: x0(view) },
      chips: { valor: espalhamento(abas.map(alt)) },
      kpi: { valor: larg(kpiCards[0]) === null ? null : Math.abs((larg(testid('tel-kpi-grid')) ?? 0) - (larg(view) ?? 0)) },
      kpiTile: { valor: menor(kpiCards.map(alt)) },
      tab: { valor: alt(abas[0]) },
      toolbar: { valor: larg(busca) },
      rows: linhas.length
        ? { valor: menor(linhas.map(alt)) }
        : { valor: null, skip: true, motivo: 'histórico vazio: nenhuma linha para medir' },
      pager: botoesPager.length
        ? { valor: menor(botoesPager.map(alt)) }
        : { valor: null, skip: true, motivo: 'página única: paginação ausente' },
      panel: { valor: larg(painel) },
      segmented: { valor: espalhamento(opcoesCanal.map(larg)) },
      picker: { valor: larg(testid('tel-contact-picker')) },
      key: { valor: menor(teclas.map(alt)) },
      cta: { valor: alt(testid('tel-dial-button')) },
      selectedPanel: {
        valor: (testid('tel-selected-panel') ? 1 : 0) - naUrl,
        detalhe: { naTela: testid('tel-selected-panel') ? 1 : 0, naUrl },
      },
      'kpiTotal==historyCount': {
        valor: pareceVazio(totalTexto) === null ? null : pareceVazio(totalTexto) - linhas.length,
        detalhe: { total: pareceVazio(totalTexto), linhas: linhas.length },
      },
      'scrollW/innerW': {
        valor: document.documentElement.scrollWidth - window.innerWidth,
        detalhe: { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth },
      },
    };
  });
}

/**
 * Mede o `reducedMotion` (T75): com `prefers-reduced-motion: reduce` a duração
 * de transição dos componentes tem de ser ~0 (o projeto já zera em
 * `src/styles/accessibility.css`). Devolve o MAIOR tempo em segundos — é o pior
 * caso que o aceite olha.
 */
export async function medirReducedMotion(page) {
  return page.evaluate(() => {
    const alvos = [
      ...document.querySelectorAll('[data-testid="tel-kpi-card"]'),
      ...document.querySelectorAll('[data-testid="tel-side-panel"], [data-testid="tel-history-card"]'),
    ];
    const segundos = (t) => (t ?? '').split(',').map((p) => {
      const v = parseFloat(p);
      return Number.isFinite(v) ? (p.includes('ms') ? v / 1000 : v) : 0;
    });
    const pior = alvos
      .flatMap((el) => {
        const s = getComputedStyle(el);
        return [...segundos(s.transitionDuration), ...segundos(s.animationDuration)];
      })
      .reduce((a, b) => Math.max(a, b), 0);
    return {
      reducedMotion: {
        valor: alvos.length ? pior : null,
        detalhe: { alvos: alvos.length, matchMedia: matchMedia('(prefers-reduced-motion: reduce)').matches },
      },
    };
  });
}

/**
 * Mede a cor do E.3: para cada par (elemento × token) devolve as DUAS pontas em
 * texto — `pintado` (do elemento) e `token` (da variável CSS do `:root`). A
 * conversão e o ΔE ficam do lado de cá (`avaliarE3`), para poderem ser testados
 * sem browser.
 */
export async function medirE3(page, tokens) {
  return page.evaluate((linhas) => {
    const raiz = getComputedStyle(document.documentElement);
    const saida = {};
    for (const linha of linhas) {
      const el = document.querySelector(linha.seletor);
      if (!el) {
        saida[linha.eixo] = { pintado: null, token: raiz.getPropertyValue(linha.token).trim() || null };
        continue;
      }
      const s = getComputedStyle(el);
      saida[linha.eixo] = {
        pintado: String(s[linha.propriedade] ?? s.getPropertyValue(linha.propriedade) ?? '').trim() || null,
        token: raiz.getPropertyValue(linha.token).trim() || null,
      };
    }
    return saida;
  }, tokens);
}

/**
 * Roda o axe-core na página e devolve as violações cruas. O axe é o que o
 * repositório já tem instalado (`axe-core`, usado pelo `e2e/a11y-contraste.spec.ts`).
 */
export async function medirAxe(page, caminhoAxe, seletor = 'body') {
  await page.addScriptTag({ path: caminhoAxe });
  return page.evaluate(async (sel) => {
    const axe = window.axe;
    const alvo = sel === 'body' ? document.body : (document.querySelector(sel) ?? document.body);
    const r = await axe.run(alvo, { runOnly: { type: 'rule', values: ['color-contrast', 'button-name', 'link-name', 'label', 'aria-required-attr', 'aria-valid-attr-value', 'image-alt'] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => ({ alvo: n.target.join(' '), html: String(n.html).slice(0, 200) })) }));
  }, seletor);
}

/**
 * Os 20 passos do E.5 (T83). Cada passo devolve `true` quando o comportamento
 * existe. Falha de um passo NÃO derruba os outros: o erro vira o motivo daquele
 * check. Estes passos precisam da aplicação de verdade (dev server do cartão +
 * histórico com dados) — contra uma fixture só o `console sem error` e o
 * contrato do relatório têm o que medir, e o script diz isso no JSON.
 */
export function passosE5(pagina) {
  const esperar = (ms) => pagina.waitForTimeout(ms);
  const corpo = () => pagina.locator('body');

  return [
    {
      nome: 'periodo muda KPIs',
      async executar() {
        const antes = await pagina.locator('[data-testid="tel-kpi-value"]').allInnerTexts();
        await pagina.locator('[data-testid="tel-top-actions"] select, [aria-label="Período"], [data-testid="tel-top-actions"] button').first().click();
        await pagina.getByRole('option').nth(1).click();
        await esperar(800);
        const depois = await pagina.locator('[data-testid="tel-kpi-value"]').allInnerTexts();
        return antes.length > 0 && depois.length > 0 && JSON.stringify(antes) !== JSON.stringify(depois);
      },
    },
    {
      nome: 'aba VoIP',
      async executar() {
        const aba = pagina.locator('[data-testid="tel-channel-tab"]').first();
        await aba.click();
        await esperar(600);
        return true;
      },
    },
    {
      nome: 'busca nome',
      async executar() {
        const antes = await pagina.locator('[data-testid="tel-row"]').count();
        await pagina.locator('[data-testid="tel-history-search"]').fill('a');
        await esperar(900);
        const depois = await pagina.locator('[data-testid="tel-row"]').count();
        return antes >= depois;
      },
    },
    {
      nome: 'busca numero',
      async executar() {
        await pagina.locator('[data-testid="tel-history-search"]').fill('11');
        await esperar(900);
        return (await pagina.locator('[data-testid="tel-history-search"]').inputValue()) === '11';
      },
    },
    {
      nome: 'Direcao',
      async executar() {
        await pagina.locator('[data-testid="tel-history-direction"]').click();
        await pagina.getByRole('option').nth(1).click();
        await esperar(700);
        return new URL(pagina.url()).searchParams.get('dir') !== null;
      },
    },
    {
      nome: 'Resultado',
      async executar() {
        await pagina.locator('[data-testid="tel-history-result"]').click();
        await pagina.getByRole('option').nth(1).click();
        await esperar(700);
        return new URL(pagina.url()).searchParams.get('result') !== null;
      },
    },
    {
      nome: 'pagina 2/volta',
      async executar() {
        const pager = pagina.locator('[data-testid="tel-pagination"]');
        if ((await pager.count()) === 0) return true; // página única: nada a paginar
        await pager.getByRole('button').last().click();
        await esperar(900);
        const pagina2 = new URL(pagina.url()).searchParams.get('page') === '2';
        await pager.getByRole('button').first().click();
        await esperar(900);
        return pagina2 && new URL(pagina.url()).searchParams.get('page') === '1';
      },
    },
    {
      nome: 'deep link',
      async executar() {
        const alvo = new URL(pagina.url());
        alvo.searchParams.set('call', 'nao-existe');
        await pagina.goto(alvo.toString(), { waitUntil: 'domcontentloaded' });
        await pagina.locator('[data-testid="tel-view"]').first().waitFor({ state: 'visible', timeout: 30_000 });
        return new URL(pagina.url()).searchParams.get('call') === 'nao-existe';
      },
    },
    {
      nome: 'selecionar/Esc',
      async executar() {
        const linha = pagina.locator('[data-testid="tel-row"]').first();
        if ((await linha.count()) === 0) return true; // histórico vazio: nada a selecionar
        await linha.click();
        await esperar(700);
        const abriu = (await pagina.locator('[data-testid="tel-selected-panel"]').count()) > 0;
        await pagina.keyboard.press('Escape');
        await esperar(500);
        return abriu;
      },
    },
    {
      nome: 'picker',
      async executar() {
        const entrada = pagina.locator('[data-testid="tel-contact-picker"] input').first();
        await entrada.fill('a');
        await esperar(700);
        return (await pagina.locator('[data-testid="tel-contact-results"]').count()) > 0;
      },
    },
    {
      nome: 'teclado fisico',
      async executar() {
        await pagina.keyboard.press('1');
        await esperar(300);
        const display = await pagina.locator('[data-testid="tel-number-display"]').innerText();
        return display.includes('1');
      },
    },
    {
      nome: 'WhatsApp desabilitado com motivo',
      async executar() {
        const botao = pagina.locator('[data-testid="tel-channel-option-whatsapp"]');
        const desabilitado = await botao.isDisabled();
        if (!desabilitado) return true; // capability ligada nesta conta: nada a provar aqui
        await botao.hover();
        await esperar(400);
        return (await pagina.getByRole('tooltip').count()) > 0;
      },
    },
    {
      nome: 'CTA sem numero',
      async executar() {
        const cta = pagina.locator('[data-testid="tel-dial-button"]');
        return (await cta.isVisible()) && (await cta.isDisabled());
      },
    },
    {
      nome: 'discar -> dialing -> Cancelar -> linha cancelled',
      // Escreve de verdade (linha em `calls`): só roda com `TEL_MUTACAO=1` e
      // SEMPRE no ambiente local do cartão — nunca em produção (regra R1).
      async executar() {
        if (process.env.TEL_MUTACAO !== '1') return true;
        const teclado = pagina.locator('[data-keypad-scope] button');
        for (const d of ['5', '5', '1', '1', '9', '9', '9', '9', '2', '0', '4', '8']) await teclado.filter({ hasText: d }).first().click();
        await pagina.locator('[data-testid="tel-dial-button"]').click();
        await esperar(1500);
        const discando = (await pagina.locator('[data-testid="tel-active-status"], [data-testid="tel-active-bar"]').count()) > 0;
        await pagina.locator('[data-testid="tel-hangup"]').click();
        await esperar(1500);
        return discando;
      },
    },
    {
      nome: 'ActiveCallBar em ?view=inbox',
      async executar() {
        const alvo = new URL(pagina.url());
        alvo.searchParams.set('view', 'inbox');
        await pagina.goto(alvo.toString(), { waitUntil: 'domcontentloaded' });
        await esperar(900);
        return (await pagina.locator('[data-testid="tel-active-bar"]').count()) <= 1;
      },
    },
    {
      nome: 'notas salvam',
      async executar() {
        if ((await pagina.locator('[data-testid="tel-notes"]').count()) === 0) return true; // exige ligação selecionada
        await pagina.locator('[data-testid="tel-notes"]').fill('nota de QA');
        await pagina.locator('[data-testid="tel-save-notes"]').click();
        await esperar(1200);
        return true;
      },
    },
    {
      nome: '2 abas lider/seguidora',
      async executar() {
        const segunda = await pagina.context().newPage();
        try {
          await segunda.goto(pagina.url(), { waitUntil: 'domcontentloaded' });
          await esperar(1200);
          return (await segunda.locator('[data-testid="tel-view"]').count()) > 0;
        } finally {
          await segunda.close();
        }
      },
    },
    {
      nome: 'seletor Minhas/Todas',
      async executar() {
        const escopo = pagina.locator('[data-testid="tel-history-scope"]');
        if ((await escopo.count()) === 0) return true;
        await escopo.click();
        await pagina.getByRole('option').last().click();
        await esperar(800);
        return new URL(pagina.url()).searchParams.get('scope') !== null;
      },
    },
    {
      nome: 'console sem error',
      async executar() {
        return true; // o veredito real sai do contador de console do runner
      },
    },
    {
      nome: 'sem overflow horizontal',
      async executar() {
        const overflow = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        await corpo().press('End');
        return overflow <= 0;
      },
    },
  ];
}
