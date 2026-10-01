import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';

/**
 * Backend fake do Talk X para E2E determinístico (plano V4, etapa X003).
 *
 * `mockTalkXBackend(page, tela)` carrega `e2e/fixtures/talkx-demo/<tela>.json`
 * e intercepta, via `page.route`, as chamadas do módulo:
 *   - `rest/v1/talkx_*`            → GET devolve a fixture da tela; escrita → 403
 *   - `rest/v1/rpc/talkx_*`        → escrita não prevista (403)
 *   - `functions/v1/talkx-*`       → escrita não prevista (403)
 *
 * Qualquer escrita não prevista é bloqueada com o corpo `{ "message": "escrita não prevista" }`
 * — o demo nunca grava nem envia nada em produção. Criadores (`get_team_profiles`)
 * e contatos (insights) respondem vazios para o demo não ler produção.
 *
 * A fixture cresce junto com cada etapa de tela: a etapa que cria uma tabela/RPC
 * Talk X acrescenta a resposta dela no JSON da tela correspondente (ver e2e/README.md).
 */

export const ESCRITA_NAO_PREVISTA = 'escrita não prevista';

export type TalkXDemoData = Record<string, unknown[]>;

const here = import.meta.dirname;
const cache = new Map<string, TalkXDemoData>();

export function loadDemoData(tela: string): TalkXDemoData {
  if (!cache.has(tela)) {
    const file = join(here, 'talkx-demo', `${tela}.json`);
    cache.set(tela, JSON.parse(readFileSync(file, 'utf8')) as TalkXDemoData);
  }
  return cache.get(tela)!;
}

function writeBlocked(route: Route) {
  return route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ message: ESCRITA_NAO_PREVISTA }),
  });
}

function emptyJson(route: Route) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
}

const isRead = (m: string) => m === 'GET' || m === 'HEAD';

export async function mockTalkXBackend(page: Page, tela: string) {
  const data = loadDemoData(tela);

  // Tabelas talkx_*: GET devolve a fixture; escrita é bloqueada.
  await page.route(/\/rest\/v1\/talkx_[a-z_]+/, (route) => {
    if (!isRead(route.request().method())) return writeBlocked(route);
    const table = route.request().url().match(/\/rest\/v1\/(talkx_[a-z_]+)/)?.[1];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data[table ?? ''] ?? []),
    });
  });

  // RPCs talkx_* e edge functions talkx-*: o demo nunca dispara envio/escrita.
  await page.route(/\/rest\/v1\/rpc\/talkx_[a-z_]+/, writeBlocked);
  await page.route(/\/functions\/v1\/talkx-[a-z-]+/, writeBlocked);

  // Criadores (get_team_profiles) e contatos (insights) respondem vazios para o
  // demo não ler produção. RPCs são POST no Supabase; contatos é GET/HEAD.
  await page.route(/\/rest\/v1\/rpc\/get_team_profiles/, (route) =>
    route.request().method() === 'POST' ? emptyJson(route) : writeBlocked(route),
  );
  await page.route(/\/rest\/v1\/contacts/, (route) =>
    isRead(route.request().method()) ? emptyJson(route) : writeBlocked(route),
  );
}
