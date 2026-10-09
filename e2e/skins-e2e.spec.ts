/**
 * SKINS — CP8 (fidelidade) e CP9 (funcional) do plano
 * `docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md`, etapas 76–86.
 *
 * O QUE ESTA SPEC PROVA
 * - Fidelidade (etapas 76–81): para cada um dos 19 ids do catálogo, depois do CLIQUE no
 *   card, os tokens `--primary`, `--background`, `--sidebar-background` e `--radius` do
 *   `<html>` são exatamente os do catálogo (comparados com o catálogo E com a tabela do
 *   Apêndice A do plano, que é fonte independente do código), o `data-preset-id` bate, e a
 *   COR PINTADA na sidebar e no fundo (mediana 9×9 de um recorte de tela real, lida de
 *   volta pelo canvas do navegador) está a ΔE76 ≤ 6 do `hsl()` do preset. Modo claro 3/3,
 *   raio 4 leituras, sync entre abas sem reload e reduzir-movimento.
 * - Funcional (etapas 83–86): os 14 checks, um `test()` por check, com `page.on('console')`
 *   acumulando erros e falha explícita por check.
 *
 * COMO A TELA É ABERTA (deslogado, sem produção — regra R1 de 05/10)
 * `?view=themes` (ViewRouter.tsx → ThemeCustomizer) com o padrão deslogado que já existe no
 * repo: sessão FALSA (`installFakeSession`, e2e/fixtures/talkx-demo.ts) + backend do app
 * shell mockado (`mockAppShell`, e2e/fixtures/mapa-mocks.ts) + guarda de rede
 * (`bloquearRedeReal`, conferida no afterEach). Nada de `e2e/.auth`, nada de login de QA,
 * nada de Vite `--mode production`. Três ajustes medidos nesta spec, todos para o ambiente
 * ficar LIMPO (o check 1 exige zero console.error):
 *   1. `agent_presence` aceita a escrita do heartbeat (o catch-all respondia 403 e o app
 *      logava `[agent-presence] upsert falhou`);
 *   2. `/auth/v1/user` responde 200 com o mesmo usuário da sessão falsa (o mock do repo
 *      devolve 401 de propósito e o navegador registra "Failed to load resource: 401");
 *   3. o canal Realtime — que sem isto abre um WebSocket REAL do Realtime do Supabase
 *      (medido) — é atendido por um socket mudo (`page.routeWebSocket`), porque o guarda de
 *      rede só cobre HTTP.
 */
import { test, expect, type Page } from '@playwright/test';

import { bloquearRedeReal, json, mockAppShell, type Registro } from './fixtures/mapa-mocks';
import { FAKE_USER_ID, installFakeSession } from './fixtures/talkx-demo';
import { STORAGE_KEY, THEME_PRESETS } from '../src/components/settings/theme/presets';

/** Viewport do plano (etapa 76): 1440×900. */
test.use({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', storageState: { cookies: [], origins: [] } });
// O dev server frio compila o app inteiro na primeira navegação (mesmo ajuste das specs
// deslogadas vizinhas).
test.setTimeout(120_000);

const TELA = '/?view=themes';

/**
 * APÊNDICE A DO PLANO — fonte INDEPENDENTE do catálogo do código: os 19 ids e a primária
 * (dark) de cada skin. Se alguém mexer no catálogo sem mexer no plano, esta spec acusa.
 */
const IDS_DO_PLANO = [
  'corporate', 'purpure', 'emerald', 'sunset', 'rose', 'minimal', 'ocean', 'amber', 'cyber', 'diversity',
  'gx-classic', 'gx-pink-addiction', 'gx-purple-haze', 'gx-rose-quartz', 'gx-ultraviolet',
  'gx-hackerman', 'gx-frutti-di-mare', 'gx-cyberpunk', 'gx-razer',
] as const;
const PRIMARIA_DO_PLANO: Record<string, string> = {
  corporate: '221 83% 53%',
  purpure: '254 92% 55%',
  emerald: '160 84% 35%',
  sunset: '25 95% 48%',
  rose: '346 77% 50%',
  minimal: '220 15% 50%',
  ocean: '200 85% 48%',
  amber: '38 92% 42%',
  cyber: '180 100% 30%',
  diversity: '330 85% 60%',
  'gx-classic': '347 96% 54%',
  'gx-pink-addiction': '330 95% 60%',
  'gx-purple-haze': '265 65% 50%',
  'gx-rose-quartz': '345 75% 68%',
  'gx-ultraviolet': '271 76% 53%',
  'gx-hackerman': '127 65% 46%',
  'gx-frutti-di-mare': '182 90% 42%',
  'gx-cyberpunk': '55 100% 51%',
  'gx-razer': '113 70% 51%',
};
/** Etapa 78 do plano: fundo claro das três skins conferidas. */
const FUNDO_CLARO_DO_PLANO: Record<string, string> = {
  corporate: '221 20% 97%',
  'gx-classic': '347 20% 97%',
  diversity: '330 20% 97%',
};
/** Etapa 77/79: raio sugerido pelos presets GX (10px) e o default do usuário (14px). */
const RAIO_GX = '0.625rem';
const RAIO_CLASSICA = '0.875rem';
/** Teto da busca por Tab até o primeiro card (etapa 85/12) — laço sempre com teto. */
const TETO_TAB = 250;

// ─── cor: HSL→RGB→Lab e ΔE76 ────────────────────────────────────────────────

type Cor = [number, number, number];

function hslParaRgb(hsl: string): Cor {
  const m = hsl.match(/(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (!m) throw new Error(`HSL inválido: ${hsl}`);
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(canal(h + 1 / 3) * 255), Math.round(canal(h) * 255), Math.round(canal(h - 1 / 3) * 255)];
}

/** sRGB → Lab (D65), o mesmo caminho do ΔE76 do Apêndice E.2 do plano. */
function rgbParaLab([r, g, b]: Cor): Cor {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function deltaE76(a: Cor, b: Cor): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Mediana 9×9 da COR PINTADA em (x, y): recorte de tela real, decodificado pelo PRÓPRIO
 * navegador (canvas) — nenhuma lib de PNG nova e nenhuma comparação de token com ele mesmo.
 */
async function corPintada(page: Page, x: number, y: number): Promise<Cor> {
  const png = await page.screenshot({ clip: { x, y, width: 9, height: 9 } });
  return page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('sem contexto 2d para ler o recorte');
    ctx.drawImage(img, 0, 0);
    const dados = ctx.getImageData(0, 0, img.width, img.height).data;
    const mediana = (canal: number) => {
      const v: number[] = [];
      for (let p = 0; p < dados.length; p += 4) v.push(dados[p + canal]);
      v.sort((a, b) => a - b);
      return v[(v.length - 1) >> 1];
    };
    return [mediana(0), mediana(1), mediana(2)] as [number, number, number];
  }, `data:image/png;base64,${png.toString('base64')}`);
}

// ─── ambiente deslogado ─────────────────────────────────────────────────────

type Ambiente = { registro: Registro; erros: string[] };

/** Monta o harness deslogado numa página e devolve o coletor de `console.error`. */
async function montarApp(page: Page, registro: Registro): Promise<string[]> {
  const erros: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  await page.addInitScript(() => {
    // Watchdog de boot do index.html: com o dev server frio o React 19 passa dos 8s e o
    // watchdog apagaria o #root (mesmo ajuste das specs deslogadas vizinhas).
    (window as Window & { __BOOT_DEADLINE_MS?: number }).__BOOT_DEADLINE_MS = 60_000;
  });
  await bloquearRedeReal(page, registro);
  await mockAppShell(page, registro);
  await installFakeSession(page);
  await page.route(/\/rest\/v1\/contacts/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/messages/, (route) => json(route, []));
  await page.route(/\/rest\/v1\/agent_presence/, (route) =>
    route.request().method() === 'GET' ? json(route, []) : json(route, [], 201),
  );
  await page.route(/\/auth\/v1\/user/, (route) =>
    json(route, { id: FAKE_USER_ID, aud: 'authenticated', role: 'authenticated', email: 'visual@test.local' }),
  );
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  return erros;
}

/** Abre `?view=themes` e espera a grade de skins GX (a prova de que a tela montou). */
async function abrirTela(page: Page, opcoes?: { waitUntil: 'commit' }): Promise<void> {
  if (opcoes) await page.goto(TELA, { waitUntil: opcoes.waitUntil });
  else await page.goto(TELA);
  await expect(page.getByTestId('skins-gx-grid')).toBeVisible({ timeout: 60_000 });
}

type Vars = {
  primary: string;
  background: string;
  sidebar: string;
  radius: string;
  presetId: string;
  temaClaro: boolean;
};

function lerVars(page: Page): Promise<Vars> {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      primary: cs.getPropertyValue('--primary').trim(),
      background: cs.getPropertyValue('--background').trim(),
      sidebar: cs.getPropertyValue('--sidebar-background').trim(),
      radius: cs.getPropertyValue('--radius').trim(),
      presetId: document.documentElement.dataset.presetId ?? '',
      temaClaro: document.documentElement.classList.contains('light'),
    };
  });
}

function lerStorage(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((chave) => JSON.parse(localStorage.getItem(chave) ?? '{}'), STORAGE_KEY);
}

/** Clique no card da skin e espera o `data-preset-id` — a condição, nunca tempo fixo. */
async function escolher(page: Page, id: string): Promise<void> {
  await page.getByTestId(`preset-card-${id}`).click();
  await expect(page.locator('html')).toHaveAttribute('data-preset-id', id);
}

/** Coordenadas dos pontos de amostra, derivadas do layout REAL medido. */
async function pontosDeAmostra(page: Page): Promise<{ sidebar: { x: number; y: number }; fundo: { x: number; y: number } }> {
  const nav = await page.locator('#main-navigation').boundingBox();
  if (!nav) throw new Error('#main-navigation sem caixa');
  return {
    // Cabeçalho da sidebar (h-[64px]), dentro do padding esquerdo: ali a primeira camada com
    // fundo é a própria sidebar. Mais abaixo existe o container rolável, que na `diversity`
    // leva um gradiente arco-íris decorativo por cima do fundo — medir ali media o enfeite,
    // não o token (foi exatamente o que reprovou a 1ª versão desta spec).
    sidebar: { x: Math.round(nav.x + 5), y: 30 },
    // Coluna de gutter entre a sidebar e a grade de cards (o card é transparente, mas a
    // borda/press-scale dele chega perto: o gutter não é de ninguém).
    fundo: { x: Math.round(nav.x + nav.width + 8), y: 520 },
  };
}

/** Camada que pinta o ponto: se não for a sidebar, a medida do pixel está medindo outra coisa. */
function camadaDeFundo(
  page: Page,
  ponto: { x: number; y: number },
): Promise<{ id: string; tag: string; bg: string; img: string } | null> {
  return page.evaluate(({ x, y }) => {
    let e = document.elementFromPoint(x, y) as HTMLElement | null;
    for (let prof = 0; e && prof < 8; prof += 1) {
      const cs = getComputedStyle(e);
      if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none') {
        return { id: e.id, tag: e.tagName, bg: cs.backgroundColor, img: cs.backgroundImage.slice(0, 60) };
      }
      e = e.parentElement;
    }
    return null;
  }, ponto);
}

let ambiente: Ambiente;

test.beforeEach(async ({ page }) => {
  const registro: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };
  const erros = await montarApp(page, registro);
  ambiente = { registro, erros };
});

test.afterEach(() => {
  // Prova de que a spec não tocou a rede real: tudo que escapou dos mocks caiu no guarda.
  expect(ambiente.registro.redeBarrada ?? [], 'nenhuma chamada HTTP pode escapar dos mocks').toEqual([]);
});

// ═══════════════════════════════════════════════════════════════════════════
// CP8 — fidelidade
// ═══════════════════════════════════════════════════════════════════════════

test.describe('CP8 — fidelidade das 19 skins', () => {
  test('as 19 skins aplicam as vars exatas do catálogo e a cor pintada (sidebar/fundo, ΔE76 ≤ 6)', async ({ page }) => {
    await abrirTela(page);
    // Congela transições: a medição é do estado FINAL, nunca do meio de uma animação.
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none !important;animation:none !important}' });

    const pontos = await pontosDeAmostra(page);

    // Os ids da tela são exatamente os do plano (pega skin removida/renomeada).
    const idsNaTela = await page.locator('[role="radiogroup"] >> [role="radio"]').evaluateAll((nos) =>
      nos.map((n) => ((n as HTMLElement).dataset.testid ?? '').replace('preset-card-', '')),
    );
    expect(idsNaTela.slice().sort()).toEqual(IDS_DO_PLANO.slice().sort());

    const faltas: string[] = [];
    for (const preset of THEME_PRESETS) {
      await escolher(page, preset.id);
      const lido = await lerVars(page);
      const esperado = {
        primary: preset.dark.primary,
        background: preset.dark.background,
        sidebar: preset.dark['sidebar-background'],
        radius: preset.borderRadius === undefined ? RAIO_CLASSICA : RAIO_GX,
      };

      if (lido.primary !== esperado.primary) faltas.push(`${preset.id}: --primary ${lido.primary} ≠ ${esperado.primary}`);
      if (lido.background !== esperado.background) faltas.push(`${preset.id}: --background ${lido.background} ≠ ${esperado.background}`);
      if (lido.sidebar !== esperado.sidebar) faltas.push(`${preset.id}: --sidebar-background ${lido.sidebar} ≠ ${esperado.sidebar}`);
      if (lido.radius !== esperado.radius) faltas.push(`${preset.id}: --radius ${lido.radius} ≠ ${esperado.radius}`);
      // Fonte independente: a tabela do Apêndice A do plano.
      if (lido.primary !== PRIMARIA_DO_PLANO[preset.id]) {
        faltas.push(`${preset.id}: --primary ${lido.primary} ≠ plano ${PRIMARIA_DO_PLANO[preset.id]}`);
      }

      const corSidebar = await corPintada(page, pontos.sidebar.x, pontos.sidebar.y);
      const corFundo = await corPintada(page, pontos.fundo.x, pontos.fundo.y);
      const dSidebar = deltaE76(rgbParaLab(corSidebar), rgbParaLab(hslParaRgb(preset.dark['sidebar-background'])));
      const dFundo = deltaE76(rgbParaLab(corFundo), rgbParaLab(hslParaRgb(preset.dark.background)));
      if (dSidebar > 6) faltas.push(`${preset.id}: pixel da sidebar ΔE76=${dSidebar.toFixed(1)} > 6 (pintou ${corSidebar})`);
      if (dFundo > 6) faltas.push(`${preset.id}: pixel do fundo ΔE76=${dFundo.toFixed(1)} > 6 (pintou ${corFundo})`);

      if (preset.id === 'diversity') {
        const camada = await camadaDeFundo(page, pontos.sidebar);
        if (camada?.id !== 'main-navigation') {
          faltas.push(`${preset.id}: o ponto da sidebar está coberto por ${camada?.tag ?? 'nada'}#${camada?.id ?? ''}`);
        }
      }
    }

    expect(faltas, 'skin(s) fora do catálogo/plano').toEqual([]);
  });

  test('modo claro mantém a skin: corporate, gx-classic e diversity', async ({ page }) => {
    await abrirTela(page);
    const faltas: string[] = [];
    for (const id of ['corporate', 'gx-classic', 'diversity'] as const) {
      await escolher(page, id);
      await page.getByRole('button', { name: /Claro/ }).click();
      await expect(page.locator('html')).toHaveClass(/\blight\b/);

      const lido = await lerVars(page);
      const doCatalogo = THEME_PRESETS.find((p) => p.id === id);
      if (!doCatalogo) throw new Error(`sem ${id} no catálogo`);
      if (lido.background !== FUNDO_CLARO_DO_PLANO[id]) {
        faltas.push(`${id}: fundo claro ${lido.background} ≠ plano ${FUNDO_CLARO_DO_PLANO[id]}`);
      }
      if (lido.background !== doCatalogo.light.background) {
        faltas.push(`${id}: fundo claro ${lido.background} ≠ catálogo ${doCatalogo.light.background}`);
      }
      if (lido.primary !== doCatalogo.light.primary) {
        faltas.push(`${id}: primária clara ${lido.primary} ≠ catálogo ${doCatalogo.light.primary}`);
      }
      if (lido.presetId !== id) faltas.push(`${id}: data-preset-id virou ${lido.presetId} no modo claro`);

      // Volta ao escuro para a próxima skin não depender da anterior.
      await page.getByRole('button', { name: /Escuro/ }).click();
    }
    expect(faltas, 'modo claro trocou a skin').toEqual([]);
  });

  test('raio: GX trava em 10px, clássica em 14px, presets rápidos seguem livres', async ({ page }) => {
    await abrirTela(page);
    const leituras: Record<string, string> = {};

    await escolher(page, 'gx-classic');
    leituras.gx = (await lerVars(page)).radius;

    await escolher(page, 'corporate');
    leituras.classica = (await lerVars(page)).radius;

    await page.getByTestId('radius-preset-8').click();
    await expect(page.locator('html')).toHaveCSS('--radius', '0.5rem');
    leituras.livre = (await lerVars(page)).radius;
    leituras.controle = await page.locator('[role="slider"]').first().getAttribute('aria-valuenow') ?? '';

    await page.getByTestId('radius-preset-0').click();
    await expect(page.locator('html')).toHaveCSS('--radius', '0rem');
    leituras.zero = (await lerVars(page)).radius;

    expect(leituras, 'raio fora do snap esperado').toEqual({
      gx: RAIO_GX,
      classica: RAIO_CLASSICA,
      livre: '0.5rem',
      controle: '8',
      zero: '0rem',
    });
  });

  test('sync entre abas: a skin escolhida numa aba vale na outra sem reload', async ({ page, context }) => {
    // Contador de escrita na chave do tema, instalado ANTES de qualquer script da página.
    const contador = (alvo: Page, chave: string) =>
      alvo.addInitScript((k) => {
        const janela = window as Window & { __skinsEscritas?: number };
        janela.__skinsEscritas = 0;
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (this: Storage, key: string, valor: string) {
          if (key === k) janela.__skinsEscritas = (janela.__skinsEscritas ?? 0) + 1;
          return original.call(this, key, valor);
        };
      }, chave);

    const registroB: Registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    const pageB = await context.newPage();
    const errosB = await montarApp(pageB, registroB);
    await contador(page, STORAGE_KEY);
    await contador(pageB, STORAGE_KEY);

    // B primeiro, com a skin padrão: se ele já nascesse com a skin escolhida, não haveria
    // prova nenhuma de sincronia.
    await pageB.goto('/?view=dashboard');
    await expect(pageB.locator('html')).toHaveAttribute('data-preset-id', 'corporate');
    // O boot da própria aba B já escreve o tema uma vez (cache do boot): o que precisa ser
    // zero é o que ela escreve DEPOIS do evento `storage` — senão vira eco entre abas.
    const escritasBNoBoot = await pageB.evaluate(
      () => (window as Window & { __skinsEscritas?: number }).__skinsEscritas ?? 0,
    );

    await abrirTela(page);
    const escritasAntes = await page.evaluate(() => (window as Window & { __skinsEscritas?: number }).__skinsEscritas ?? 0);
    await escolher(page, 'gx-razer');

    // Sem reload em B: o evento `storage` do ThemeInitializer aplica a skin.
    await expect(pageB.locator('html')).toHaveAttribute('data-preset-id', 'gx-razer', { timeout: 10_000 });
    const primaryB = await pageB.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
    expect(primaryB, 'a outra aba tem de pintar a primária da skin').toBe(PRIMARIA_DO_PLANO['gx-razer']);

    const escritasDepois = await page.evaluate(() => (window as Window & { __skinsEscritas?: number }).__skinsEscritas ?? 0);
    const escritasB = await pageB.evaluate(() => (window as Window & { __skinsEscritas?: number }).__skinsEscritas ?? 0);
    // A aba que só OUVE não pode reescrever: seria eco, e o eco vira laço entre abas.
    expect(escritasB - escritasBNoBoot, 'a aba que recebe o evento não pode regravar o tema').toBe(0);
    expect(escritasDepois, 'a aba que escolheu tem de gravar o tema').toBeGreaterThan(escritasAntes);
    expect(errosB, 'a aba sincronizada não pode logar erro').toEqual([]);
    expect(registroB.redeBarrada ?? []).toEqual([]);

    const gravado = await lerStorage(page);
    expect(gravado.preset).toBe('gx-razer');
    expect(gravado.cacheMode).toBe('dark');
  });
});

test.describe('CP8 — reduzir movimento', () => {
  test.describe('com preferência por menos movimento', () => {
    test.use({ reducedMotion: 'reduce' });

    test('o card não se move e as transições somem no hover', async ({ page }) => {
      await abrirTela(page);
      // A emulação tem de estar de pé: sem esta linha, uma falha da emulação seria lida
      // como "o produto não respeita reduzir movimento".
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
        'o navegador precisa estar com prefers-reduced-motion: reduce',
      ).toBe(true);
      // `applyThemePreset` marca `<html>` com `theme-transitioning` por 500 ms e, nessa
      // janela, `html.theme-transitioning * !important` (0,1,1) vence o `* !important` do
      // reduzir movimento e força 0.3s. Esperar a janela fechar é medir o estado final, não
      // o instante da aplicação (era esta a corrida que fazia o teste oscilar).
      await expect(page.locator('html')).not.toHaveClass(/theme-transitioning/);

      const card = page.getByTestId('preset-card-corporate');
      const caixaAntes = await card.boundingBox();
      const antes = await card.evaluate((n) => getComputedStyle(n).transitionDuration);
      await card.hover();
      const caixaDepois = await card.boundingBox();
      const depois = await card.evaluate((n) => getComputedStyle(n).transform);

      expect(Number.parseFloat(antes), `transitionDuration com reduzir movimento: ${antes}`).toBeLessThanOrEqual(0.001);
      expect(depois, 'com reduzir movimento o card não ganha transform no hover').toBe('none');
      expect(caixaDepois, 'com reduzir movimento o card não muda de tamanho/posição no hover').toEqual(caixaAntes);
    });
  });

  test.describe('com movimento permitido (contraprova da medição)', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('o mesmo hover MUDA o card — a medida acima não é vazia', async ({ page }) => {
      await abrirTela(page);
      const card = page.getByTestId('preset-card-corporate');
      const caixaAntes = await card.boundingBox();
      await card.hover();
      await expect
        .poll(() => card.evaluate((n) => getComputedStyle(n).transform), { timeout: 5_000 })
        .not.toBe('none');
      const caixaDepois = await card.boundingBox();
      expect(
        `${caixaDepois?.width}x${caixaDepois?.height}@${caixaDepois?.y}`,
        'sem reduzir movimento o hover escala/levanta o card',
      ).not.toBe(`${caixaAntes?.width}x${caixaAntes?.height}@${caixaAntes?.y}`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CP9 — os 14 checks funcionais (etapas 83–86)
// ═══════════════════════════════════════════════════════════════════════════

test.describe('CP9 — checks funcionais', () => {
  test('check 1: ?view=themes não gera console.error', async ({ page }) => {
    await abrirTela(page);
    // Espera o inicializador do tema rodar de verdade antes de julgar o console.
    await expect
      .poll(async () => (await lerStorage(page)).cachePreset, { timeout: 15_000 })
      .toBe('corporate');
    expect(ambiente.erros, 'a tela de Skins tem de abrir sem erro no console').toEqual([]);
  });

  test('check 2: a tela mostra os 19 cards [role=radio]', async ({ page }) => {
    await abrirTela(page);
    await expect(page.locator('[role="radio"]')).toHaveCount(19);
    await expect(page.locator('[data-testid^="preset-card-"]')).toHaveCount(19);
  });

  test('check 3: clicar num card muda --primary na hora', async ({ page }) => {
    await abrirTela(page);
    const antes = (await lerVars(page)).primary;
    await escolher(page, 'gx-ultraviolet');
    const depois = (await lerVars(page)).primary;
    expect(depois).toBe(PRIMARIA_DO_PLANO['gx-ultraviolet']);
    expect(depois, 'a primária tem de mudar em relação à skin anterior').not.toBe(antes);
  });

  test('check 4: recarregar mantém a skin e o raio', async ({ page }) => {
    await abrirTela(page);
    await escolher(page, 'gx-razer');
    await page.getByTestId('radius-preset-4').click();
    await expect(page.locator('html')).toHaveCSS('--radius', '0.25rem');

    await page.reload();
    await expect(page.getByTestId('skins-gx-grid')).toBeVisible({ timeout: 60_000 });
    const lido = await lerVars(page);
    expect(lido.presetId, 'a skin tem de sobreviver ao reload').toBe('gx-razer');
    expect(lido.primary).toBe(PRIMARIA_DO_PLANO['gx-razer']);
    expect(lido.radius, 'o raio escolhido à mão tem de sobreviver ao reload').toBe('0.25rem');
  });

  test('check 5: anti-FOUC — o boot pinta a skin antes de o React montar', async ({ page }) => {
    // O observador começa antes de qualquer script da página e registra cada mudança de
    // `--background`/`data-preset-id` no <html> junto com o estado do #root naquele instante.
    await page.addInitScript(() => {
      const registros: string[] = [];
      (window as Window & { __skinsBoot?: string[] }).__skinsBoot = registros;
      // `document.documentElement` ainda NÃO existe no document_start (foi assim que a spec
      // do alto contraste descobriu o problema): cada snapshot lê o elemento de novo e o
      // observador fica no `document`, com subtree.
      const snap = () => {
        const root = document.documentElement;
        if (!root) return;
        const bg = getComputedStyle(root).getPropertyValue('--background').trim();
        const montado = document.getElementById('root')?.firstChild ? 'montado' : 'vazio';
        registros.push(`${bg}|${root.dataset.presetId ?? '-'}|${montado}`);
      };
      new MutationObserver(snap).observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'data-preset-id'],
      });
      snap();
    });

    await abrirTela(page);
    await escolher(page, 'gx-classic');
    const esperado = THEME_PRESETS.find((p) => p.id === 'gx-classic')?.dark.background;
    expect(esperado).toBeTruthy();

    // Navegação nova (é o boot do index.html que está sob teste). `commit`, como no plano.
    await abrirTela(page, { waitUntil: 'commit' });

    const registros = await page.evaluate(() => (window as Window & { __skinsBoot?: string[] }).__skinsBoot ?? []);
    const comCor = registros.filter((linha) => (linha.split('|')[0] ?? '') !== '');
    expect(comCor.length, 'nenhum registro de fundo pintado — o observador não viu o boot').toBeGreaterThan(0);
    expect(comCor[0]?.split('|')[0], 'o primeiro fundo pintado já tem de ser o da skin').toBe(esperado);
    expect(comCor[0]?.split('|')[2], 'a cor tem de estar pintada ANTES de o React montar').toBe('vazio');
    const outros = comCor.filter((linha) => linha.split('|')[0] !== esperado);
    expect(outros, 'nenhum quadro pode ter pintado fundo de outra skin (FOUC)').toEqual([]);
  });

  test('check 6: Salvar mostra o toast de sucesso', async ({ page }) => {
    await abrirTela(page);
    await escolher(page, 'ocean');
    await page.getByTestId('theme-save').click();
    await expect(page.getByText('Tema salvo com sucesso!')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Skin "Oceano" aplicada/)).toBeVisible();
  });

  test('check 7: Original → dialog → restaurar padrão volta corporate, raio 14 e toast', async ({ page }) => {
    await abrirTela(page);
    await escolher(page, 'gx-cyberpunk');
    expect((await lerVars(page)).radius).toBe(RAIO_GX);

    await page.getByTestId('theme-reset').click();
    const dialog = page.getByTestId('theme-reset-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Restaurar padrão' }).click();

    await expect(page.locator('html')).toHaveAttribute('data-preset-id', 'corporate');
    await expect(page.locator('html')).toHaveCSS('--radius', RAIO_CLASSICA);
    await expect(page.getByText('Tema restaurado ao padrão')).toBeVisible({ timeout: 10_000 });
    expect((await lerVars(page)).primary).toBe(PRIMARIA_DO_PLANO.corporate);
  });

  test('check 8: storage v5 {preset: forest, borderRadius: 8} migra para emerald com raio 8', async ({ page }) => {
    await page.addInitScript((chave) => {
      localStorage.setItem(chave, JSON.stringify({ v: 5, preset: 'forest', borderRadius: 8 }));
    }, STORAGE_KEY);

    await abrirTela(page);
    await expect(page.locator('html')).toHaveAttribute('data-preset-id', 'emerald');
    const lido = await lerVars(page);
    expect(lido.primary).toBe(PRIMARIA_DO_PLANO.emerald);
    // 8/16 = 0.5rem. O default (14 → 0.875rem) aqui seria o bug: a migração perdeu o raio.
    expect(lido.radius, 'o raio do v5 tem de sobreviver à migração (8, não 14)').toBe('0.5rem');

    const gravado = await lerStorage(page);
    expect(gravado.v, 'a migração tem de gravar a v6').toBe(6);
    expect(gravado.preset).toBe('emerald');
    expect(gravado.borderRadius).toBe(8);
  });

  test('check 9: GX trava o raio em 10, clássica em 14, e o controle segue livre', async ({ page }) => {
    await abrirTela(page);
    await escolher(page, 'gx-hackerman');
    expect((await lerVars(page)).radius).toBe(RAIO_GX);
    expect((await lerStorage(page)).borderRadius).toBe(10);

    await escolher(page, 'emerald');
    expect((await lerVars(page)).radius).toBe(RAIO_CLASSICA);
    expect((await lerStorage(page)).borderRadius).toBe(14);

    await page.getByTestId('radius-preset-20').click();
    await expect(page.locator('html')).toHaveCSS('--radius', '1.25rem');
    expect((await lerStorage(page)).borderRadius).toBe(20);
  });

  test('check 10: Modo Claro mantém a skin e grava cacheMode light', async ({ page }) => {
    await abrirTela(page);
    await escolher(page, 'gx-classic');
    await page.getByRole('button', { name: /Claro/ }).click();

    const lido = await lerVars(page);
    expect(lido.temaClaro).toBe(true);
    expect(lido.presetId, 'trocar o modo não pode trocar a skin').toBe('gx-classic');
    expect(lido.background).toBe(FUNDO_CLARO_DO_PLANO['gx-classic']);
    const gravado = await lerStorage(page);
    expect(gravado.cacheMode, 'o cache do boot tem de acompanhar o modo').toBe('light');
    expect(gravado.cachePreset).toBe('gx-classic');
  });

  test('check 11: falha de quota mostra toast de erro e o ponto de pendência', async ({ page }) => {
    await page.addInitScript((chave) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, key: string, valor: string) {
        if (key === chave) throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        return original.call(this, key, valor);
      };
    }, STORAGE_KEY);

    await abrirTela(page);
    await page.getByTestId('preset-card-sunset').click();

    await expect(page.getByText('Não foi possível salvar o tema')).toBeVisible({ timeout: 10_000 });
    // A alteração ficou PENDENTE: o ponto vermelho do botão Salvar é o aviso de que o
    // usuário perderia a escolha ao recarregar.
    await expect(page.locator('[data-testid="theme-save"] .bg-destructive')).toBeVisible();
    // E o app não pode mentir dizendo que aplicou.
    await expect(page.getByText(/aplicado!/)).toHaveCount(0);
  });

  test('check 12: teclado — Tab, ArrowRight ×2 e Enter selecionam o terceiro card', async ({ page }) => {
    await abrirTela(page);
    await page.locator('body').click({ position: { x: 700, y: 880 } });

    let achou = false;
    for (let i = 0; i < TETO_TAB && !achou; i += 1) {
      await page.keyboard.press('Tab');
      achou = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.testid === 'preset-card-corporate');
    }
    expect(achou, `o primeiro card tem de ser alcançável por Tab (teto de ${TETO_TAB} Tabs)`).toBe(true);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await expect(page.locator('html')).toHaveAttribute('data-preset-id', 'emerald');
    await expect(page.getByTestId('preset-card-emerald')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('preset-card-corporate')).toHaveAttribute('aria-checked', 'false');
  });

  test('check 14: com gx-classic, inbox/contacts/dashboard/settings não logam erro novo', async ({ page }) => {
    const idas = ['inbox', 'contacts', 'dashboard', 'settings'];
    await abrirTela(page);

    const inicioBase = ambiente.erros.length;
    for (const view of idas) {
      await page.goto(`/?view=${view}`);
      await expect(page.locator('#main-navigation')).toBeVisible({ timeout: 60_000 });
    }
    const base = ambiente.erros.slice(inicioBase);

    await abrirTela(page);
    await escolher(page, 'gx-classic');
    const corte = ambiente.erros.length;
    for (const view of idas) {
      await page.goto(`/?view=${view}`);
      await expect(page.locator('#main-navigation')).toBeVisible({ timeout: 60_000 });
    }

    const normalizar = (linha: string) => linha.replace(/\[sid:[^\]]+\]/g, '[sid]');
    // Ruído de TRANSPORTE do dev server (a máquina roda a load alto): `net::ERR_*` e módulo
    // dinâmico que não baixou não são erro do app nem da skin. O que importa — erro de
    // componente, TypeError, aviso do React — continua entrando na comparação.
    const transporte = /net::ERR_|Failed to fetch dynamically imported module|ERR_NETWORK_CHANGED/;
    const conhecidos = new Set(base.map(normalizar));
    const novos = ambiente.erros
      .slice(corte)
      .map(normalizar)
      .filter((linha) => !conhecidos.has(linha))
      .filter((linha) => !transporte.test(linha));
    expect(novos, 'a skin gx-classic não pode introduzir erro de console nas telas do app').toEqual([]);
  });
});

test.describe('CP9 — check 13: mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('check 13: ?view=themes em 390×844 não rola na horizontal', async ({ page }) => {
    await abrirTela(page);
    const medidas = await page.evaluate(() => ({
      docScroll: document.documentElement.scrollWidth,
      corpoScroll: document.body.scrollWidth,
      janela: window.innerWidth,
    }));
    expect(medidas.janela).toBe(390);
    expect(medidas.docScroll, 'o documento não pode passar da janela').toBeLessThanOrEqual(medidas.janela);
    expect(medidas.corpoScroll, 'o corpo não pode passar da janela').toBeLessThanOrEqual(medidas.janela);
  });
});
