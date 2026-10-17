// B02 — fonte unica da politica de origem do CORS das edge functions.
//
// Defeito que estes testes travam: o `validation.ts` fundido no SL2 importa
// `isAllowedOrigin`/`FALLBACK_ORIGIN` de `./cors-origins.ts`; sem este arquivo
// na arvore, `deno check` falha com TS2307 em todas as funcoes que passam por
// `validation.ts` (auth-login, approve-password-reset, ai-transcribe-audio,
// connection-health-check, detect-new-device).
//
// O que estes testes travam:
//   (a) a allow-list: canonica + zappweb.app.br + previews do projeto +
//       localhost/127.0.0.1; o alias padrao (zappwebv2-juca1.vercel.app),
//       origem externa e string vazia sao recusados;
//   (b) o fallback: origem recusada ou ausente devolve FALLBACK_ORIGIN.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
//   supabase/functions/_shared/__tests__/cors-origins.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allowedOriginFor,
  FALLBACK_ORIGIN,
  isAllowedOrigin,
} from "../cors-origins.ts";

function reqComOrigem(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request("https://exemplo.test/functions/v1/auth-login", { headers });
}

// ---------------------------------------------------------------------------
// (a) a allow-list
// ---------------------------------------------------------------------------

Deno.test("origens canonicas do projeto sao aceitas", () => {
  assert(isAllowedOrigin("https://zapp-web-v2.vercel.app"), "canonica recusada");
  assert(isAllowedOrigin("https://zappweb.app.br"), "zappweb.app.br recusado");
});

Deno.test("previews do projeto e loopback local sao aceitos", () => {
  assert(
    isAllowedOrigin("https://zappwebv2-abc123-minha-branch-juca1.vercel.app"),
    "preview do projeto recusado",
  );
  assert(isAllowedOrigin("http://localhost:54321"), "localhost recusado");
  assert(isAllowedOrigin("http://127.0.0.1:8000"), "127.0.0.1 recusado");
});

Deno.test("alias padrao, origem externa e vazio sao recusados", () => {
  assertEquals(
    isAllowedOrigin("https://zappwebv2-juca1.vercel.app"),
    false,
    "alias padrao nao pode entrar de proposito (endereco canonico unico)",
  );
  assertEquals(isAllowedOrigin("https://evil.com"), false, "origem externa aceita");
  assertEquals(isAllowedOrigin(""), false, "origem vazia aceita");
});

// ---------------------------------------------------------------------------
// (b) o fallback
// ---------------------------------------------------------------------------

Deno.test("fallback e o endereco canonico", () => {
  assertEquals(FALLBACK_ORIGIN, "https://zapp-web-v2.vercel.app");
});

Deno.test("origem recusada ou ausente devolve o fallback; aceita devolve ela mesma", () => {
  assertEquals(allowedOriginFor(reqComOrigem("https://evil.com")), FALLBACK_ORIGIN);
  assertEquals(allowedOriginFor(reqComOrigem(null)), FALLBACK_ORIGIN);
  assertEquals(
    allowedOriginFor(reqComOrigem("https://zapp-web-v2.vercel.app")),
    "https://zapp-web-v2.vercel.app",
  );
});
