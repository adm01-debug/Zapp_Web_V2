/**
 * A11y das telas de autenticação — /auth, /forgot-password e /reset-password, no
 * navegador real, nos temas claro e escuro.
 *
 * Por que E2E e não jsdom: `color-contrast` só existe depois do CSS aplicado (o jsdom
 * não pinta) e o nome acessível de um trigger montado por JS depende do render real.
 * É o mesmo vão que a régua `a11y-contraste.spec.ts` (E98) cobre para Contatos.
 *
 * Régua: TODAS as regras do axe, filtrando só o que bloqueia (impact SERIOUS/CRITICAL
 * — o mesmo filtro de `support/a11y-impactos.ts`). Sem sessão real: a tela /auth é
 * deslogada e /reset-password usa a sessão FALSA (`installFakeSession`), o padrão já
 * usado por `chromium-a11y` — sem `setup` e sem secrets, e a rede real barrada
 * (`bloquearRedeReal`), provado no afterEach: nenhum host fora do oficial foi tocado.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { bloquearRedeReal, SUPABASE_HOST, type Registro } from './fixtures/mapa-mocks';
import { installFakeSession } from './fixtures/talkx-demo';
import { filtrarViolacoesBloqueantes, type ViolacaoA11y } from './support/a11y-impactos';

const require = createRequire(import.meta.url);
const AXE = require.resolve('axe-core/axe.min.js');

type Violacao = ViolacaoA11y & {
  alvos: { seletor: string; html: string; motivo: string }[];
};

type Medicao = { violacoes: Violacao[]; alvosMedidos: string[] };

/**
 * Roda o axe INTEIRO no documento e devolve as violações com os nós reprovados.
 * Também devolve os seletores de TODOS os nós analisados (violações + aprovados),
 * para a spec provar que o axe olhou para os campos DESTA tela (anti-vacuidade).
 */
async function medir(page: Page): Promise<Medicao> {
  // A tela entra com fade (framer-motion) e há animação contínua: medir no meio da transição
  // mistura a cor do texto com o fundo (opacidade parcial) e reprova contraste que não existe
  // (medido: 1,69:1 num texto de 11 px no tema claro). Mede duas vezes seguidas e só aceita
  // quando as duas concordam — aí a tela assentou.
  let anterior: Medicao | null = null;
  for (let tentativa = 1; tentativa <= 6; tentativa += 1) {
    const atual = await medirComRetryAxe(page);
    if (anterior && JSON.stringify(anterior.violacoes) === JSON.stringify(atual.violacoes)) return atual;
    anterior = atual;
    await page.waitForTimeout(700);
  }
  return anterior as Medicao;
}

async function medirComRetryAxe(page: Page): Promise<Medicao> {
  await page.addScriptTag({ path: AXE });
  // O PRÓPRIO app roda axe em dev (é ele que loga "[A11Y] SERIOUS/CRITICAL" no console); se a
  // instância estiver ocupada, `axe.run` responde "Axe is already running" e a medição falharia
  // por corrida, não por a11y. Espera e repete.
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      return await medirUmaVez(page);
    } catch (erro) {
      if (tentativa >= 6 || !/already running/i.test(String(erro))) throw erro;
      await page.waitForTimeout(1_000);
    }
  }
}

async function medirUmaVez(page: Page): Promise<Medicao> {
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<unknown> } }).axe;
    const r = (await axe.run(document, { resultTypes: ['violations', 'passes'] })) as {
      violations: { id: string; impact: string; nodes: { target: string[]; html: string; failureSummary?: string }[] }[];
      passes: { nodes: { target: string[] }[] }[];
    };
    const alvosMedidos = [...r.violations, ...r.passes].flatMap((regra) =>
      regra.nodes.flatMap((n) => n.target),
    );
    const violacoes = r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nos: v.nodes.length,
      alvos: v.nodes.map((n) => ({
        seletor: n.target.join(' '),
        html: n.html,
        motivo: n.failureSummary ?? '',
      })),
    }));
    return { violacoes, alvosMedidos };
  });
}

/** Tela, URL, âncora visível (anti-vacuidade) e campos que a tela PRECISA ter. */
type Tela = {
  rota: string;
  /** Âncora visível: prova que a tela montou antes de medir (anti-vacuidade). */
  ancoragem: (page: Page) => Locator;
  campos: string[];
  sessaoFalsa: boolean;
};

const TELAS: Tela[] = [
  {
    rota: '/auth',
    ancoragem: (page) => page.getByRole('main', { name: /acesso à plataforma/i }),
    campos: ['#login-email', '#login-password'],
    sessaoFalsa: false,
  },
  {
    rota: '/forgot-password',
    ancoragem: (page) => page.getByText(/esqueceu sua senha\?/i).first(),
    campos: ['#email', '#reason'],
    sessaoFalsa: false,
  },
  {
    // Sem sessão o ResetPassword cai em "Link Inválido"; a sessão FALSA (JWT de fixture)
    // é o que faz a tela real ("Nova Senha") renderizar — é ela que o usuário abre do
    // e-mail de recuperação, então é ela que precisa passar no axe.
    rota: '/reset-password',
    ancoragem: (page) => page.getByText(/^nova senha$/i).first(),
    campos: ['#password', '#confirmPassword'],
    sessaoFalsa: true,
  },
];

/**
 * Violações bloqueantes JÁ CONHECIDAS por rota (catraca). Qualquer outra é defeito novo.
 * `/reset-password` carrega UM defeito real de acessibilidade, fora do escopo deste cartão:
 * o botão de mostrar/ocultar senha do form "Nova Senha" não tem nome acessível
 * (src/pages/ResetPassword.tsx:199; axe `button-name`, critical). Registrado no cartão
 * para o dono da tela. QUANDO A TELA FOR CORRIGIDA, ESVAZIE ESTA LISTA — o teste passa a
 * exigir zero violação bloqueante ali também.
 */
const BLOQUEANTES_CONHECIDAS: Record<string, string[]> = {
  // Defeito REAL do tema escuro (fora do escopo deste cartão): o link "Esqueci minha senha"
  // (12 px, `text-primary`) mede 3,42:1 sobre #18181b — abaixo dos 4,5:1 da WCAG AA.
  '/auth|dark': ['color-contrast'],
  '/reset-password|light': ['button-name'],
  '/reset-password|dark': ['button-name'],
};

/** Host do projeto configurado (mesma constante das fixtures do repo — sem literal solto). */
const HOST_OFICIAL = new URL(SUPABASE_HOST).host;

/**
 * Abre a rota esperando a âncora. O PRIMEIRO carregamento de um dev server frio (Vite
 * otimizando deps sob carga) pode estourar o watchdog de boot do próprio app ("React não
 * montou em 8s") — medido. Uma recarga, com o servidor já aquecido, resolve.
 */
async function abrir(page: Page, rota: string, ancoragem: Locator): Promise<void> {
  await page.goto(rota);
  try {
    await expect(ancoragem).toBeVisible({ timeout: 45_000 });
  } catch {
    await page.reload();
    await expect(ancoragem).toBeVisible({ timeout: 45_000 });
  }
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('A11y das telas de autenticação (axe SERIOUS/CRITICAL = 0)', () => {
  // O 1º teste paga o boot do dev server sob carga (medido: 20-43 s); o axe ainda roda.
  test.describe.configure({ timeout: 90_000 });

  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await bloquearRedeReal(page, registro);
  });

  test.afterEach(() => {
    // Prova de que a spec não tocou a internet: só o host oficial do projeto pode ter
    // sido barrado (respondido localmente com 403) — a tela de login monta providers do
    // app shell e pede dados mesmo deslogada; nada disso sai da máquina.
    expect(
      registro.redeBarrada?.every((url) => url.includes(HOST_OFICIAL)),
      `host inesperado tentou sair: ${JSON.stringify(registro.redeBarrada)}`,
    ).toBe(true);
  });

  for (const tela of TELAS) {
    for (const tema of ['light', 'dark'] as const) {
      test(`${tela.rota} — ${tema}`, async ({ page }) => {
        if (tela.sessaoFalsa) await installFakeSession(page);
        // Registrado DEPOIS de installFakeSession (que grava 'dark'): o último vence.
        await page.addInitScript((t) => window.localStorage.setItem('theme', t), tema);

        await abrir(page, tela.rota, tela.ancoragem(page));

        // Anti-vacuidade: medir uma tela que não montou o formulário passaria sem medir nada.
        for (const campo of tela.campos) {
          await expect(page.locator(campo), `${tela.rota} ${tema}: campo ${campo} ausente`).toBeVisible();
        }
        expect(
          await page.evaluate(() => document.documentElement.classList.contains('dark')),
          `${tela.rota}: este caso mede o tema ${tema}`,
        ).toBe(tema === 'dark');

        // O `ThemeInitializer` aplica o preset (data-preset-id + CSS vars) num efeito DEPOIS do
        // mount: medir antes disso mistura as cores do tema anterior com o fundo do tema novo e
        // reprova contraste que não existe (medido em /auth — dark). Espera o preset entrar e a
        // transição de 200 ms assentar.
        await expect
          .poll(() => page.evaluate(() => document.documentElement.dataset.presetId ?? ''), {
            message: `${tela.rota}: preset do tema não foi aplicado`,
            timeout: 15_000,
          })
          .not.toBe('');

        const { violacoes, alvosMedidos } = await medir(page);
        // Catraca: só as violações bloqueantes JÁ CONHECIDAS (abaixo) podem aparecer. Uma
        // nova violação crítica/séria, em qualquer tela ou tema, reprova.
        const bloqueantes = filtrarViolacoesBloqueantes(violacoes).map((v) => v.id);
        expect(
          bloqueantes,
          `${tela.rota} (${tema}): violação SERIOUS/CRITICAL fora do previsto\n${JSON.stringify(violacoes, null, 2)}`,
        ).toEqual(BLOQUEANTES_CONHECIDAS[`${tela.rota}|${tema}`] ?? []);

        // Anti-vacuidade da medição: o axe precisa ter analisado os campos DESTA tela —
        // medir uma página que não montou o formulário passaria sem medir nada.
        const medidos = alvosMedidos.join(' | ');
        for (const campo of tela.campos) {
          expect(medidos, `${tela.rota} (${tema}): o axe não analisou ${campo}`).toContain(campo);
        }
      });
    }
  }
});
