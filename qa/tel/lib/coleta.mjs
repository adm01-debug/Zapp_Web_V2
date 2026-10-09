/**
 * Casca de coleta dos scripts de QA da Telefonia: só lê a página e devolve os
 * números crus. NENHUMA decisão OK/FALHA mora aqui — ela fica em
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
 * existe, `{ skip: true, motivo }` quando a tela/fixture não tem a capacidade
 * necessária, ou `{ ok: false, motivo }` quando o elemento existe mas o efeito
 * real não aconteceu. Falha de um passo NÃO derruba os outros: o erro vira o
 * motivo daquele check.
 */
export function passosE5(pagina) {
  const esperar = (ms) => pagina.waitForTimeout(ms);
  const corpo = () => pagina.locator('body');
  const skip = (motivo) => ({ skip: true, motivo });
  const falha = (motivo) => ({ ok: false, motivo });
  const existe = async (locator) => (await locator.count()) > 0;
  const primeiro = (selector) => pagina.locator(selector).first();
  const valorCampo = async (locator) => {
    try {
      return await locator.inputValue({ timeout: 1000 });
    } catch {
      return (await locator.innerText({ timeout: 1000 }).catch(() => '')).trim();
    }
  };
  const normalizar = (texto) => String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const estadoHistorico = async () => {
    const linhas = pagina.locator('[data-testid="tel-row"]');
    const quantidade = await linhas.count();
    const textos = quantidade > 0 ? await linhas.allInnerTexts() : [];
    const vazio = await pagina.locator('[data-testid="tel-history-empty"]').first().isVisible().catch(() => false);
    return { quantidade, textos, vazio };
  };
  const urlRefleteBusca = (urlAntes, termo) => {
    const urlDepois = pagina.url();
    if (urlDepois === urlAntes) return false;
    const termoNormalizado = normalizar(termo);
    try {
      return Array.from(new URL(urlDepois).searchParams.values())
        .some((valor) => normalizar(valor).includes(termoNormalizado));
    } catch {
      return false;
    }
  };
  const historicoFiltrou = (antes, depois, termo) => {
    if (antes.quantidade === 0) return false;
    if (depois.vazio || depois.quantidade < antes.quantidade) return true;
    const termoNormalizado = normalizar(termo);
    const todasDepoisCasam = depois.textos.length > 0
      && depois.textos.every((texto) => normalizar(texto).includes(termoNormalizado));
    const todasAntesCasavam = antes.textos.length > 0
      && antes.textos.every((texto) => normalizar(texto).includes(termoNormalizado));
    return todasDepoisCasam && !todasAntesCasavam;
  };

  return [
    {
      nome: 'periodo muda KPIs',
      async executar() {
        const kpis = pagina.locator('[data-testid="tel-kpi-value"]');
        if ((await kpis.count()) === 0) return skip('sem KPIs para comparar');
        const controle = primeiro('[data-testid="tel-top-actions"] select, [aria-label="Período"], [data-testid="tel-top-actions"] button');
        if (!(await existe(controle))) return skip('controle de período ausente');
        const antes = await kpis.allInnerTexts();
        await controle.click();
        const opcoes = pagina.getByRole('option');
        if ((await opcoes.count()) < 2) return skip('controle de período sem segunda opção');
        await opcoes.nth(1).click();
        await esperar(800);
        const depois = await kpis.allInnerTexts();
        return antes.length > 0 && depois.length > 0 && JSON.stringify(antes) !== JSON.stringify(depois)
          ? true
          : falha('KPIs não mudaram após trocar o período');
      },
    },
    {
      nome: 'aba VoIP',
      async executar() {
        const aba = pagina.locator('[data-testid="tel-channel-tab"]').filter({ hasText: /voip/i }).first();
        if (!(await existe(aba))) return skip('aba VoIP ausente');
        await aba.click();
        await esperar(600);
        const selecionada = await aba.getAttribute('aria-selected');
        const urlVoip = new URL(pagina.url()).searchParams.get('channel') === 'voip';
        return selecionada === 'true' || urlVoip ? true : falha('aba VoIP não ficou selecionada');
      },
    },
    {
      nome: 'busca nome',
      async executar() {
        const busca = primeiro('[data-testid="tel-history-search"]');
        if (!(await existe(busca))) return skip('campo de busca ausente');
        const antes = await estadoHistorico();
        if (antes.quantidade === 0) return skip('histórico vazio: não há nomes para filtrar');
        const termo = '__qa_sem_resultado__';
        await busca.fill(termo);
        await esperar(900);
        const depois = await estadoHistorico();
        return historicoFiltrou(antes, depois, termo)
          ? true
          : falha('busca por nome não reduziu o histórico nem mostrou estado vazio para termo inexistente');
      },
    },
    {
      nome: 'busca numero',
      async executar() {
        const busca = primeiro('[data-testid="tel-history-search"]');
        if (!(await existe(busca))) return skip('campo de busca ausente');
        const termo = '11';
        const antes = await estadoHistorico();
        if (antes.quantidade === 0) return skip('histórico vazio: não há números para filtrar');
        const urlAntes = pagina.url();
        await busca.fill(termo);
        await esperar(900);
        const depois = await estadoHistorico();
        if (urlRefleteBusca(urlAntes, termo) || historicoFiltrou(antes, depois, termo)) return true;
        const todosAntesJaCasavam = antes.textos.length > 0
          && antes.textos.every((texto) => normalizar(texto).includes(termo));
        return todosAntesJaCasavam
          ? skip('histórico já continha apenas números com 11 e sem URL/estado para distinguir filtro')
          : falha('busca por número não filtrou o histórico nem refletiu a busca na URL/estado');
      },
    },
    {
      nome: 'Direcao',
      async executar() {
        const filtro = primeiro('[data-testid="tel-history-direction"]');
        if (!(await existe(filtro))) return skip('filtro de direção ausente');
        await filtro.click();
        const opcoes = pagina.getByRole('option');
        if ((await opcoes.count()) < 2) return skip('filtro de direção sem segunda opção');
        await opcoes.nth(1).click();
        await esperar(700);
        return new URL(pagina.url()).searchParams.get('dir') !== null ? true : falha('direção não alterou a URL/estado');
      },
    },
    {
      nome: 'Resultado',
      async executar() {
        const filtro = primeiro('[data-testid="tel-history-result"]');
        if (!(await existe(filtro))) return skip('filtro de resultado ausente');
        await filtro.click();
        const opcoes = pagina.getByRole('option');
        if ((await opcoes.count()) < 2) return skip('filtro de resultado sem segunda opção');
        await opcoes.nth(1).click();
        await esperar(700);
        return new URL(pagina.url()).searchParams.get('result') !== null ? true : falha('resultado não alterou a URL/estado');
      },
    },
    {
      nome: 'pagina 2/volta',
      async executar() {
        const pager = pagina.locator('[data-testid="tel-pagination"]');
        if ((await pager.count()) === 0) return skip('página única: paginação ausente');
        await pager.getByRole('button').last().click();
        await esperar(900);
        const pagina2 = new URL(pagina.url()).searchParams.get('page') === '2';
        await pager.getByRole('button').first().click();
        await esperar(900);
        const voltou = new URL(pagina.url()).searchParams.get('page') === '1';
        return pagina2 && voltou ? true : falha('paginação não foi para a página 2 e voltou para a 1');
      },
    },
    {
      nome: 'deep link',
      async executar() {
        const alvo = new URL(pagina.url());
        alvo.searchParams.set('call', 'nao-existe');
        await pagina.goto(alvo.toString(), { waitUntil: 'domcontentloaded' });
        const view = pagina.locator('[data-testid="tel-view"]').first();
        await view.waitFor({ state: 'visible', timeout: 30000 });
        const painel = pagina.locator('[data-testid="tel-selected-panel"]').first();
        const painelAbriu = await painel.isVisible().catch(() => false);
        return painelAbriu
          ? falha('deep link para call inexistente abriu painel selecionado')
          : true;
      },
    },
    {
      nome: 'selecionar/Esc',
      async executar() {
        const linha = pagina.locator('[data-testid="tel-row"]').first();
        if ((await linha.count()) === 0) return skip('histórico vazio: nada a selecionar');
        await linha.click();
        await esperar(700);
        const painel = pagina.locator('[data-testid="tel-selected-panel"]').first();
        const abriu = await painel.isVisible().catch(() => false);
        if (!abriu) return falha('seleção da linha não abriu o painel');
        await pagina.keyboard.press('Escape');
        await esperar(500);
        const fechou = !(await painel.isVisible().catch(() => false));
        return fechou ? true : falha('Escape não fechou o painel selecionado');
      },
    },
    {
      nome: 'picker',
      async executar() {
        const entrada = pagina.locator('[data-testid="tel-contact-picker"] input').first();
        if (!(await existe(entrada))) return skip('picker de contato ausente');
        await entrada.fill('a');
        await esperar(700);
        return (await pagina.locator('[data-testid="tel-contact-results"]').count()) > 0
          ? true
          : falha('picker não exibiu resultados após busca');
      },
    },
    {
      nome: 'teclado fisico',
      async executar() {
        const display = primeiro('[data-testid="tel-number-display"]');
        if (!(await existe(display))) return skip('display do número ausente');
        const antes = await display.innerText();
        await pagina.keyboard.press('1');
        await esperar(300);
        const depois = await display.innerText();
        return depois.includes('1') && depois !== antes ? true : falha('teclado físico não alterou o display do número');
      },
    },
    {
      nome: 'WhatsApp desabilitado com motivo',
      async executar() {
        const botao = pagina.locator('[data-testid="tel-channel-option-whatsapp"]');
        if (!(await existe(botao))) return skip('opção WhatsApp ausente');
        const desabilitado = await botao.isDisabled();
        if (!desabilitado) return skip('WhatsApp habilitado nesta conta: não há bloqueio a explicar');
        await botao.hover();
        await esperar(400);
        const temTooltip = (await pagina.getByRole('tooltip').count()) > 0;
        const temMotivo = Boolean(await botao.getAttribute('title') || await botao.getAttribute('aria-describedby'));
        return temTooltip || temMotivo ? true : falha('WhatsApp desabilitado não exibiu motivo');
      },
    },
    {
      nome: 'CTA sem numero',
      async executar() {
        const cta = pagina.locator('[data-testid="tel-dial-button"]');
        if (!(await existe(cta))) return skip('CTA de ligação ausente');
        return (await cta.isVisible()) && (await cta.isDisabled()) ? true : falha('CTA sem número não está visível e desabilitado');
      },
    },
    {
      nome: 'discar -> dialing -> Cancelar -> linha cancelled',
      // Escreve de verdade (linha em `calls`): só roda com `TEL_MUTACAO=1`.
      async executar() {
        if (process.env.TEL_MUTACAO !== '1') return skip('TEL_MUTACAO!=1: passo com escrita não executado');
        const teclado = pagina.locator('[data-keypad-scope] button');
        if ((await teclado.count()) === 0) return skip('teclado de discagem ausente');
        for (const d of ['5', '5', '1', '1', '9', '9', '9', '9', '2', '0', '4', '8']) await teclado.filter({ hasText: d }).first().click();
        const botaoDiscar = pagina.locator('[data-testid="tel-dial-button"]');
        if (!(await existe(botaoDiscar))) return falha('botão de discagem ausente');
        await botaoDiscar.click();
        await esperar(1500);
        const discando = (await pagina.locator('[data-testid="tel-active-status"], [data-testid="tel-active-bar"]').count()) > 0;
        const desligar = pagina.locator('[data-testid="tel-hangup"]');
        if (!(await existe(desligar))) return falha('botão Cancelar/Desligar ausente após discar');
        await desligar.click();
        await esperar(1500);
        const cancelada = (await pagina.locator('[data-testid="tel-row"]').filter({ hasText: /cancelled|cancelad[ao]/i }).count()) > 0;
        return discando && cancelada ? true : falha('não confirmou estado dialing seguido de linha cancelled');
      },
    },
    {
      nome: 'ActiveCallBar em ?view=inbox',
      async executar() {
        const alvo = new URL(pagina.url());
        alvo.searchParams.set('view', 'inbox');
        await pagina.goto(alvo.toString(), { waitUntil: 'domcontentloaded' });
        await esperar(900);
        const view = pagina.locator('[data-testid="tel-view"]').first();
        if (!(await existe(view))) return falha('view de telefonia ausente no inbox');
        const barras = pagina.locator('[data-testid="tel-active-bar"]');
        const quantidade = await barras.count();
        if (quantidade === 0) return skip('sem ligação ativa: ActiveCallBar não é aplicável');
        if (quantidade > 1) return falha('ActiveCallBar duplicou no inbox');
        return (await barras.first().isVisible().catch(() => false))
          ? true
          : falha('ActiveCallBar existe, mas não está visível no inbox');
      },
    },
    {
      nome: 'notas salvam',
      async executar() {
        const campo = pagina.locator('[data-testid="tel-notes"]').first();
        if (!(await existe(campo))) return skip('campo de notas ausente: exige ligação selecionada');
        const salvar = pagina.locator('[data-testid="tel-save-notes"]').first();
        if (!(await existe(salvar))) return falha('botão de salvar notas ausente');
        const nota = `nota de QA ${Date.now()}`;
        await campo.fill(nota);
        await salvar.click();
        await esperar(1200);
        await pagina.reload({ waitUntil: 'domcontentloaded' });
        await esperar(800);
        const campoRecarregado = pagina.locator('[data-testid="tel-notes"]').first();
        if (!(await existe(campoRecarregado))) return falha('campo de notas sumiu após recarregar');
        const salvo = await valorCampo(campoRecarregado);
        return salvo.includes(nota) ? true : falha('nota salva não persistiu após recarregar');
      },
    },
    {
      nome: '2 abas lider/seguidora',
      async executar() {
        const segunda = await pagina.context().newPage();
        try {
          const lockAntes = await pagina.evaluate(() => window.localStorage?.getItem('zapp.call.tab-leader') ?? null).catch(() => null);
          await segunda.goto(pagina.url(), { waitUntil: 'domcontentloaded' });
          await esperar(1200);
          if ((await segunda.locator('[data-testid="tel-view"]').count()) === 0) return falha('segunda aba não carregou a tela');
          const [lockPrincipal, lockSegunda] = await Promise.all([
            pagina.evaluate(() => window.localStorage?.getItem('zapp.call.tab-leader') ?? null).catch(() => null),
            segunda.evaluate(() => window.localStorage?.getItem('zapp.call.tab-leader') ?? null).catch(() => null),
          ]);
          const lock = lockPrincipal ?? lockSegunda ?? lockAntes;
          if (!lock) return skip('papel líder/seguidora não exposto nesta tela/fixture');
          let parsed;
          try { parsed = JSON.parse(lock); } catch { return falha('lock líder/seguidora inválido no localStorage'); }
          return parsed?.tabId && Number.isFinite(parsed?.expiresAt) && lockPrincipal === lockSegunda
            ? true
            : falha('abas não compartilharam um único lock líder/seguidora');
        } finally {
          await segunda.close();
        }
      },
    },
    {
      nome: 'seletor Minhas/Todas',
      async executar() {
        const escopo = pagina.locator('[data-testid="tel-history-scope"]');
        if ((await escopo.count()) === 0) return skip('seletor Minhas/Todas ausente');
        await escopo.click();
        const opcoes = pagina.getByRole('option');
        if ((await opcoes.count()) === 0) return skip('seletor Minhas/Todas sem opções');
        await opcoes.last().click();
        await esperar(800);
        return new URL(pagina.url()).searchParams.get('scope') !== null ? true : falha('seletor Minhas/Todas não alterou escopo');
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
        return overflow <= 0 ? true : falha(`overflow horizontal de ${overflow}px`);
      },
    },
  ];
}
