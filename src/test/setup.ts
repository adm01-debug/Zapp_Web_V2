import "@testing-library/jest-dom";
import { expect, vi } from "vitest";
// CT-67 — matcher de acessibilidade do axe (`expect(container).toHaveNoViolations()`)
// disponível para TODA a suíte via `setupFiles` (vitest.config.ts). O matcher
// vem de `vitest-axe/dist/matchers` e não do atalho público
// `vitest-axe/matchers`: o `matchers.d.ts` da RAIZ do pacote 0.1.0 é
// `export type * from "./dist/matchers"` — re-export só de tipos — e o TS
// então acusa TS1362 ("cannot be used as a value") ao registrar o matcher. O
// subpath `dist/matchers` está no `files` publicado e re-exporta o valor de
// verdade; o runtime é idêntico (o atalho da raiz só faz `export * from`).
// `AxeMatchers` traz a tipagem e é estendido no módulo `vitest` abaixo —
// mesmo mecanismo que o `@testing-library/jest-dom` usa para registrar as
// asserções dele.
import { toHaveNoViolations } from "vitest-axe/dist/matchers";
import type { AxeMatchers } from "vitest-axe/dist/matchers";

declare module "vitest" {
  // O matcher do axe entra no `Assertion`/`AsymmetricMatchersContaining` do
  // vitest. A interface "vazia" que só estende o mixin é o único jeito de
  // fazer a augmentation — mesmo padrão do `vitest-axe/dist/extend-expect`
  // (que usa o namespace global `Vi`, inócuo no Vitest 4).
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

expect.extend({ toHaveNoViolations });

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver (etapa 46): o jsdom não traz o observer, e o hook de capacidade
// da aba Arquivos (`useFilesContainerColumns`) mede o contêiner por ele. Antes existia
// só em `volumeControlMocks.ts`, por causa do Popper do Radix — agora vale para a suíte.
// `configurable: true` é obrigatório: sem isso, os arquivos de teste que definem o
// próprio stub caem em "Cannot redefine property: ResizeObserver" na inicialização.
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: MockResizeObserver,
});
Object.defineProperty(globalThis, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: MockResizeObserver,
});

// ==========================================================================
// GUARDA DE REDE — nenhum teste fala com o Supabase de PRODUCAO.
//
// Contexto (incidente de 02-03/10/2026): o cliente do app
// (`src/integrations/supabase/client.ts`) tem a URL e a anon key de PRODUCAO
// fixas no codigo — a key e publica por design e a URL e fixa de proposito
// (ver o comentario do proprio arquivo). Um teste que monta um componente sem
// mockar o cliente faz request REAL contra producao.
//
// Medido em 03/10/2026, antes desta guarda: a suite disparava **408 requests**
// ao projeto de producao por execucao (370 em `catalog_send_events`), quase
// todos negados por RLS (42501 / 401). Rodando no CI a cada push, no
// `bun test` local e em agentes, isso virou ~30 mil 401 por dia, inflou o log
// pago e contribuiu para a saturacao do Postgres que pendurou o Auth
// (ver `docs/runbooks/auth-pendurado-saturacao-postgres.md`).
//
// Esta guarda troca o `fetch` global por um que RECUSA qualquer destino
// Supabase. Nenhum teste precisa de rede real — todos mockam. Um teste que
// venha a precisar falha aqui de forma explicita, dizendo o que mockar, em vez
// de vazar silenciosamente para producao (era esse o modo de falha).
//
// WebSocket/Realtime NAO passa por aqui de proposito: os testes de realtime
// usam servidor local e mockam o transporte.
// ==========================================================================
const HOST_SUPABASE = /(^|\.)supabase\.(co|in)$/i;
const fetchReal = globalThis.fetch;

globalThis.fetch = ((input: unknown, init?: unknown) => {
  const url =
    typeof input === 'string'
      ? input
      : ((input as { url?: string } | null)?.url ?? String(input));
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    // URL relativa (jsdom) ou entrada nao-URL: segue o fluxo normal.
  }
  if (HOST_SUPABASE.test(host)) {
    return Promise.reject(
      new Error(
        `[guarda-de-rede] teste tentou falar com o Supabase REAL (${host}). ` +
          'Mocke o modulo que faz a chamada (ex.: ' +
          'vi.mock("@/integrations/supabase/client")) ou o hook ' +
          '(ex.: vi.mock("@/hooks/integrations/useCatalogRecentSends")). ' +
          'Teste nao fala com producao.'
      )
    );
  }
  return (fetchReal as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
}) as typeof fetch;
