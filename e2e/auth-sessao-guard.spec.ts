/**
 * Guarda de sessão das rotas protegidas: sem sessão, com sessão EXPIRADA e com sessão
 * CORROMPIDA o app precisa cair em /auth UMA vez, guardando a origem (`state.from`), e
 * nunca entrar em laço de redirecionamento.
 *
 * Por que navegador real: o redirecionamento do React Router não é navegação de
 * documento (é `history.replaceState`), então só dá para contá-lo dentro da página —
 * `page.on('framenavigated')` não veria nada. Contamos chamadas de `pushState`/
 * `replaceState` com `addInitScript`, e o laço do StrictMode (efeito dobrado) não conta
 * duas vezes porque só o que MUDA o caminho para /auth é um redirecionamento.
 *
 * Nada de produção (R1): `bloquearRedeReal` responde localmente 403 a qualquer chamada
 * ao host oficial, e cada teste confere o que tentou sair da máquina.
 */
import { test, expect, type Page } from '@playwright/test';
import { bloquearRedeReal, SUPABASE_HOST, type Registro } from './fixtures/mapa-mocks';

/** Mesmo host/projeto das fixtures do repo (`mapa-mocks.SUPABASE_HOST`). */
const HOST_OFICIAL = new URL(SUPABASE_HOST).host;
const ROTAS_PROTEGIDAS = ['/queues/comparison', '/sla'];

type Navegacao = { caminho: string; estado: unknown };

/**
 * Chave do storage do supabase-js: `sb-<ref>-auth-token`. O ref sai do host da URL
 * configurada — o oficial, salvo quando o banco LOCAL está ligado por
 * `VITE_ZAPP_LOCAL_SUPABASE_URL` (aí o app pode ser vitest/local). Repetimos a mesma
 * regra de `src/config/supabase.ts` para o teste instalar a chave que o app vai LER.
 */
function chaveDaSessao(): string {
  const local = process.env.VITE_ZAPP_LOCAL_SUPABASE_URL?.trim();
  if (local) {
    try {
      const url = new URL(local);
      if (url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)) {
        return `sb-${url.hostname.split('.')[0]}-auth-token`;
      }
    } catch {
      /* cai no host oficial */
    }
  }
  return `sb-${HOST_OFICIAL.split('.')[0]}-auth-token`;
}

function b64url(objeto: unknown): string {
  return Buffer.from(JSON.stringify(objeto)).toString('base64url');
}

/** Sessão no formato que o supabase-js persiste (JWT de fixture, nada real). */
function sessaoFalsa(expiraEmSegundos: number): string {
  const payload = {
    sub: 'e2e-guard-0000-0000-0000-000000000000',
    email: 'guarda.e2e@exemplo.test',
    role: 'authenticated',
    aud: 'authenticated',
    exp: expiraEmSegundos,
    iat: 0,
    iss: `https://${HOST_OFICIAL}/auth/v1`,
  };
  return JSON.stringify({
    access_token: `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.assinatura-falsa`,
    refresh_token: 'refresh-falso-e2e',
    expires_at: expiraEmSegundos,
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: payload.sub,
      aud: 'authenticated',
      role: 'authenticated',
      email: payload.email,
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
    },
  });
}

const AGORA = () => Math.floor(Date.now() / 1000);

/** Instala o storage da sessão ANTES de qualquer script do app. */
async function instalarStorage(page: Page, valor: string | null): Promise<void> {
  await page.addInitScript(
    ({ chave, conteudo }) => {
      window.localStorage.removeItem(chave);
      if (conteudo !== null) window.localStorage.setItem(chave, conteudo);
    },
    { chave: chaveDaSessao(), conteudo: valor },
  );
}

/** Conta as trocas de URL feitas pelo router (history API), com o state de cada uma. */
async function contarNavegacao(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const janela = window as unknown as { __navAuth?: Navegacao[] };
    janela.__navAuth = [];
    const registrar =
      (original: (estado: unknown, titulo: string, url?: string | URL | null) => void) =>
      function (this: History, estado: unknown, titulo: string, url?: string | URL | null) {
        try {
          const alvo = new URL(String(url ?? window.location.href), window.location.href);
          janela.__navAuth!.push({ caminho: alvo.pathname, estado });
        } catch {
          /* URL que não dá para ler não interessa ao teste */
        }
        return original.call(this, estado, titulo, url);
      };
    window.history.pushState = registrar(window.history.pushState);
    window.history.replaceState = registrar(window.history.replaceState);
  });
}

/** Entradas /auth registradas e quantas delas mudaram de caminho (uma por redirecionamento). */
async function medirRedirecionamentos(page: Page): Promise<{ entradas: Navegacao[]; trocas: number }> {
  const entradas = await page.evaluate(() => ((window as unknown as { __navAuth?: Navegacao[] }).__navAuth ?? []).filter((n) => n.caminho === '/auth'));
  const trocas = await page.evaluate(() => {
    const nav = (window as unknown as { __navAuth?: Navegacao[] }).__navAuth ?? [];
    return nav.filter((n, i) => n.caminho === '/auth' && nav[i - 1]?.caminho !== '/auth').length;
  });
  return { entradas, trocas };
}

function caminhoDaOrigem(entrada: Navegacao | undefined): string | undefined {
  const estado = entrada?.estado as { usr?: { from?: { pathname?: string } } } | undefined;
  return estado?.usr?.from?.pathname;
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Guarda de sessão nas rotas protegidas', () => {
  // O 1º teste paga o boot do dev server sob carga (medido: 20-43 s).
  test.describe.configure({ timeout: 90_000 });

  let registro: Registro;

  test.beforeEach(async ({ page }) => {
    registro = { writesApp: [], mapbox: [], redeBarrada: [] };
    await bloquearRedeReal(page, registro);
    await contarNavegacao(page);
  });

  /** Só o host oficial pode ter sido barrado — prova de que nada foi à internet de verdade. */
  function redeSoOficial(): void {
    expect(
      (registro.redeBarrada ?? []).every((url) => url.includes(HOST_OFICIAL)),
      `host inesperado tentou sair: ${JSON.stringify(registro.redeBarrada)}`,
    ).toBe(true);
  }

  async function provarRedirecionamentoUnico(page: Page, rota: string): Promise<void> {
    try {
      await page.waitForURL(/\/auth$/, { timeout: 30_000 });
    } catch {
      // Boot do dev server frio pode estourar o watchdog do app antes do redirect.
      await page.reload();
      await page.waitForURL(/\/auth$/, { timeout: 60_000 });
    }
    await expect(page.locator('#login-email')).toBeVisible({ timeout: 20_000 });

    const { entradas, trocas } = await medirRedirecionamentos(page);
    expect(trocas, `esperava 1 redirecionamento para /auth; entradas: ${JSON.stringify(entradas)}`).toBe(1);
    for (const entrada of entradas) {
      expect(caminhoDaOrigem(entrada), `origem não preservada em ${JSON.stringify(entrada.estado)}`).toBe(rota);
    }

    // Sem laço: 2 s depois nada mudou e nenhum novo redirecionamento apareceu.
    await page.waitForTimeout(2000);
    const depois = await medirRedirecionamentos(page);
    expect(new URL(page.url()).pathname).toBe('/auth');
    expect(depois.trocas, `laço de redirecionamento: ${JSON.stringify(depois.entradas)}`).toBe(trocas);
  }

  for (const rota of ROTAS_PROTEGIDAS) {
    test(`sessão ausente manda para /auth guardando a origem (${rota})`, async ({ page }) => {
      await instalarStorage(page, null);
      await page.goto(rota);
      await provarRedirecionamentoUnico(page, rota);
      redeSoOficial();
    });

    test(`sessão expirada manda para /auth guardando a origem (${rota})`, async ({ page }) => {
      await instalarStorage(page, sessaoFalsa(AGORA() - 3600));
      await page.goto(rota);
      await provarRedirecionamentoUnico(page, rota);
      redeSoOficial();
    });

    test(`sessão corrompida manda para /auth guardando a origem (${rota})`, async ({ page }) => {
      await instalarStorage(page, '{isto-nao-e-json');
      await page.goto(rota);
      await provarRedirecionamentoUnico(page, rota);
      redeSoOficial();
    });

    test(`sessão válida NÃO cai no login — prova que a chave do storage é a certa (${rota})`, async ({ page }) => {
      // Anti-vacuidade das 3 provas acima: se a chave do storage estivesse errada, os
      // cenários de ausente/corrompida/expirada passariam todos pelo mesmo motivo. Aqui a
      // sessão é aceita, então o app sai da rota e NÃO mostra a tela de login.
      await instalarStorage(page, sessaoFalsa(AGORA() + 3600));
      await page.goto(rota);
      await expect(page.getByRole('main', { name: /acesso à plataforma/i })).toHaveCount(0, { timeout: 10_000 });
      expect(new URL(page.url()).pathname, 'sessão válida foi tratada como deslogado').toBe(rota);
      await expect(page.locator('#login-email')).toHaveCount(0);
      redeSoOficial();
    });
  }
});
