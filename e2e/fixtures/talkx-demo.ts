import type { Page } from '@playwright/test';

export class FixtureVaziaError extends Error {
  constructor(tela: number) {
    super(
      `Fixture da tela-${String(tela).padStart(2, '0')} tem zero chaves — ` +
        `a etapa desta tela ainda não populou o fixture. ` +
        `Use test.skip() enquanto a fixture for {}.`,
    );
    this.name = 'FixtureVaziaError';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FixtureData = Record<string, any>;

const FIXTURE_COUNT = 17;

/**
 * Carrega o fixture JSON de uma tela.
 * Lança FixtureVaziaError quando o fixture tem zero chaves ({}).
 * Nunca retorna {} silenciosamente.
 */
export async function loadDemoData(tela: number): Promise<FixtureData> {
  if (tela < 1 || tela > FIXTURE_COUNT) {
    throw new RangeError(`tela deve estar entre 1 e ${FIXTURE_COUNT}, recebido: ${tela}`);
  }
  const padded = String(tela).padStart(2, '0');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const data: FixtureData = require(`./talkx-demo/tela-${padded}.json`) as FixtureData;
  if (Object.keys(data).length === 0) {
    throw new FixtureVaziaError(tela);
  }
  return data;
}

/**
 * Devolve true para telas que têm fixture com dados reais (não {}).
 * Útil para derivar a lista de telas cobertas pela régua visual (X004).
 */
export async function fixtureTemDados(tela: number): Promise<boolean> {
  try {
    await loadDemoData(tela);
    return true;
  } catch (e) {
    if (e instanceof FixtureVaziaError) return false;
    throw e;
  }
}

/**
 * Intercepta chamadas de API do TalkX com page.route e responde com dados
 * da fixture correspondente. Chamadas de escrita não previstas abortam o teste.
 *
 * Padrões interceptados:
 *   **/rest/v1/talkx_*   — tabelas diretas
 *   **/rest/v1/rpc/talkx_* — RPCs
 *   **/functions/v1/talkx-* — edge functions
 *
 * A chave na fixture é o caminho do endpoint sem a URL base, ex:
 *   "talkx_campaigns"       → GET **/rest/v1/talkx_campaigns*
 *   "rpc/talkx_overview_kpis" → POST **/rest/v1/rpc/talkx_overview_kpis*
 */
export async function mockTalkXBackend(page: Page, tela: number): Promise<void> {
  const data = await loadDemoData(tela);

  const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

  // Tabelas REST diretas: GET **/rest/v1/talkx_*
  await page.route('**/rest/v1/talkx_*', (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/');
    const tableSegment = segments.find((s) => s.startsWith('talkx_'));
    const method = route.request().method().toUpperCase();

    if (WRITE_METHODS.has(method)) {
      route
        .fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'escrita não prevista',
            detail: `${method} ${url.pathname} não é permitido em modo demo`,
          }),
        })
        .catch(() => undefined);
      return;
    }

    const rows = tableSegment && tableSegment in data ? data[tableSegment] : [];
    route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Range': `0-${Array.isArray(rows) ? rows.length - 1 : 0}/*` },
        body: JSON.stringify(rows),
      })
      .catch(() => undefined);
  });

  // RPCs: POST **/rest/v1/rpc/talkx_*
  await page.route('**/rest/v1/rpc/talkx_*', (route) => {
    const url = new URL(route.request().url());
    const segments = url.pathname.split('/');
    const rpcName = segments[segments.length - 1];
    const fixtureKey = `rpc/${rpcName}`;
    const result = fixtureKey in data ? data[fixtureKey] : {};
    route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      })
      .catch(() => undefined);
  });

  // Edge functions: **/functions/v1/talkx-*
  await page.route('**/functions/v1/talkx-*', (route) => {
    const url = new URL(route.request().url());
    const fnName = url.pathname.split('/').pop() ?? '';
    const result = fnName in data ? data[fnName] : {};
    route
      .fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(result),
      })
      .catch(() => undefined);
  });
}
