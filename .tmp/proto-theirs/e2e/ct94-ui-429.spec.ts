/**
 * CT-94 — a UI reagindo ao 429 da edge `promogifts-catalog`.
 *
 * ANTES: o spec só provava o HTTP. Fazia uma rajada de navegações sequenciais
 * até a edge devolver 429 e terminava em `expect(status).toContain('429')` — a
 * reação da TELA existia (toast + cooldown que desabilita as ações, coberta por
 * unit tests) mas não era afirmada em lugar nenhum; o screenshot não é asserção.
 *
 * AGORA: o fluxo provado é o mesmo — resposta 429 da `promogifts-catalog` -> reação
 * da tela — só que determinístico. Em vez de estourar a cota real de 60 req/min
 * (lento e instável), a edge é mockada com `page.route` e responde 429 na hora.
 * O que este spec afirma no fim:
 *
 *   1. a própria tela disparou a chamada que leva o 429;
 *   2. feedback VISÍVEL ao usuário: toast "Muitas requisições, aguarde 1 min"
 *      (disparado por `useRateLimitCooldown`, o mesmo contrato dos unit tests);
 *   3. ação de retry/atualização DESABILITADA durante o cooldown: "Atualizar"
 *      (header) e "Tentar de novo" (estado de erro) — `retryDisabled={coolingDown}`;
 *   4. a prova HTTP continua no MESMO fluxo: o navegador recebeu 429 de verdade.
 *
 * Sessão FALSA (`installFakeSession`) e backend inteiramente mockado: sem
 * `storageState`, sem secrets e sem tocar produção — o spec roda localmente e
 * no workflow de PR (mesmo padrão de `talkx-launch.spec.ts`).
 *
 * Como rodar (sem secrets, sem `setup`):
 *   bunx playwright test e2e/ct94-ui-429.spec.ts --project=chromium-authenticated --no-deps
 * O projeto `chromium` coleta só `auth.spec.ts` (`testMatch` no
 * playwright.config.ts), por isso a invocação usa o project catch-all
 * `chromium-authenticated` — que é onde este spec é coletado.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { installFakeSession, FAKE_USER_ID } from './fixtures/talkx-demo';
import { E2E_CATALOG_PATH } from './fixtures/catalog';

/** Edge que devolve 429 quando a cota de 60 req/min estoura. */
const EDGE_CATALOG = '/functions/v1/promogifts-catalog';
/** Texto exato do toast de `useRateLimitCooldown` (catalogShared.tsx). */
const TOAST_RATE_LIMIT = 'Muitas requisições, aguarde 1 min';
const ESCRITA_NAO_PREVISTA = 'escrita não prevista';

const isRead = (metodo: string) => metodo === 'GET' || metodo === 'HEAD';

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface CatalogoHarness {
  /** corpos das requisições que chegaram à edge `promogifts-catalog`. */
  chamadas: string[];
  /** status HTTP que a TELA recebeu da edge (via `page.on('response')`). */
  status: string[];
}

/**
 * Monta o backend fake: sessão falsa, shell do app, identidade do usuário e a
 * edge do catálogo respondendo 429.
 */
async function prepararCatalogo429(page: Page): Promise<CatalogoHarness> {
  const chamadas: string[] = [];
  const status: string[] = [];

  await installFakeSession(page);

  // ── Edge functions ────────────────────────────────────────────────────────
  // Um único handler decide por caminho (sem depender da ordem de registro):
  // `promogifts-catalog` responde 429; qualquer outra edge é escrita não prevista.
  await page.route(/\/functions\/v1\//, async (route) => {
    const caminho = new URL(route.request().url()).pathname;
    if (!caminho.endsWith(EDGE_CATALOG)) {
      return json(route, { message: ESCRITA_NAO_PREVISTA }, 403);
    }
    chamadas.push(route.request().postData() ?? '');
    // Atraso curto: garante que a asserção do toast já esteja em curso quando o
    // 429 chega (a resposta interceptada seria imediata e poderia precedê-la).
    await new Promise((resolve) => setTimeout(resolve, 400));
    return json(route, { error: 'Muitas requisições' }, 429);
  });

  // A TELA recebeu um 429 de verdade — não é screenshot nem console.
  page.on('response', (resposta) => {
    if (resposta.url().includes(EDGE_CATALOG)) status.push(String(resposta.status()));
  });

  // ── REST (PostgREST) ──────────────────────────────────────────────────────
  // Shell do app + identidade do usuário fake (mesmo contrato de `mockTalkXAuth`).
  await page.route(/\/rest\/v1\//, (route) => {
    const caminho = new URL(route.request().url()).pathname.replace(/^.*\/rest\/v1\/?/, '');
    if (caminho.startsWith('rpc/')) {
      if (route.request().method() !== 'POST') return json(route, { message: ESCRITA_NAO_PREVISTA }, 403);
      if (caminho.slice('rpc/'.length) === 'user_has_permission') return json(route, true);
      return json(route, { message: ESCRITA_NAO_PREVISTA }, 403);
    }
    if (!isRead(route.request().method())) return json(route, { message: ESCRITA_NAO_PREVISTA }, 403);
    const tabela = caminho.split('?')[0];
    if (tabela === 'profiles') {
      return json(route, [
        { id: FAKE_USER_ID, user_id: FAKE_USER_ID, name: 'E2E Catálogo', email: 'visual@test.local', role: 'admin', is_active: true },
      ]);
    }
    if (tabela === 'user_roles') return json(route, [{ role: 'admin' }]);
    return json(route, []);
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  // `supabase.auth.getUser()` (usado por useCatalogFavorites) não deve ir à rede
  // real com o token fake: responde o usuário da sessão falsa.
  await page.route(/\/auth\/v1\/user/, (route) =>
    json(route, { id: FAKE_USER_ID, aud: 'authenticated', role: 'authenticated', email: 'visual@test.local' }),
  );

  return { chamadas, status };
}

// Sessão falsa injetada por `installFakeSession` — não usa o `user.json` do
// projeto `setup` (nem exige E2E_TEST_EMAIL/E2E_TEST_PASSWORD para rodar aqui).
test.use({ storageState: { cookies: [], origins: [] } });

test('CT-94: o 429 da edge vira toast visível e desabilita "Atualizar" no cooldown', async ({ page }) => {
  const harness = await prepararCatalogo429(page);

  await page.goto(E2E_CATALOG_PATH, { waitUntil: 'commit' });

  // 0) A tela do catálogo montou — é o efeito de carga dela que chama a edge.
  await expect(page.getByRole('heading', { name: 'Catálogo de Produtos' })).toBeVisible({ timeout: 30_000 });

  // 1) A própria tela disparou a chamada à edge (o 429 não é injetado "à mão"
  //    na UI: vem do fluxo real de fetch do catálogo).
  await expect.poll(() => harness.chamadas.length, { timeout: 20_000 }).toBeGreaterThan(0);

  // 2) e 3) Feedback visível e cooldown, aguardados EM PARALELO: o cooldown dura
  //    10 s (`useRateLimitCooldown`) e o toast do sonner se dispensa sozinho —
  //    esperar em série poderia consumir a janela de um antes de checar o outro.
  await Promise.all([
    expect(page.getByText(TOAST_RATE_LIMIT).first()).toBeVisible({ timeout: 20_000 }),
    expect(page.getByRole('button', { name: 'Atualizar', exact: true })).toBeDisabled({ timeout: 20_000 }),
    expect(page.getByRole('button', { name: 'Tentar de novo', exact: true })).toBeDisabled({ timeout: 20_000 }),
  ]);

  // 4) A prova HTTP continua no MESMO fluxo — a tela recebeu 429 de verdade.
  expect(harness.status).toContain('429');
});
