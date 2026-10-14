import { assert, assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  ensureValidToken,
  GMAIL_REAUTH_MESSAGE,
  isGmailReauthError,
  parseGmailFailureAttempts,
  recordGmailAccountFailure,
  recordGmailAccountSuccess,
  sanitizeGmailErrorMessage,
} from "../gmail-helpers.ts";
import { Logger } from "../validation.ts";

type ContaRow = { sync_status: string; last_error: string | null };
type Update = { tabela: string; valores: Record<string, unknown>; eq: Array<[string, unknown]> };

/** Fake com estado por conta: o SELECT enxerga o que o UPDATE gravou. */
function fakeContas(linhas: Record<string, ContaRow>, updates: Update[]) {
  const api: Record<string, unknown> = {
    rpc(fn: string) {
      if (fn !== "get_gmail_tokens") throw new Error(`rpc inesperada: ${fn}`);
      return Promise.resolve({ data: [{ access_token: "t", refresh_token: "r" }], error: null });
    },
    from(tabela: string) {
      const filtros: Array<[string, unknown]> = [];
      let valoresPendentes: Record<string, unknown> | null = null;
      let selecionou = false;
      const idAlvo = () => String(filtros.find(([c]) => c === "id")?.[1] ?? "");
      const builder: Record<string, unknown> = {};
      builder.update = (valores: Record<string, unknown>) => {
        valoresPendentes = valores;
        return builder;
      };
      builder.select = (_cols: string) => {
        selecionou = true;
        return builder;
      };
      builder.eq = (coluna: string, valor: unknown) => {
        filtros.push([coluna, valor]);
        return builder;
      };
      const linha = (): ContaRow | null => {
        if (tabela !== "gmail_accounts") return null;
        return linhas[idAlvo()] ?? null;
      };
      builder.single = () => Promise.resolve({ data: selecionou ? linha() : null, error: null });
      builder.maybeSingle = () => Promise.resolve({ data: selecionou ? linha() : null, error: null });
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (valoresPendentes) {
          const alvo = linhas[idAlvo()];
          if (alvo) Object.assign(alvo, valoresPendentes);
          updates.push({ tabela, valores: valoresPendentes, eq: [...filtros] });
          valoresPendentes = null;
        }
        return Promise.resolve(resolve({ data: null, error: null }));
      };
      return builder;
    },
  };
  return api;
}

function supabaseContas(linhas: Record<string, ContaRow>, updates: Update[]) {
  return fakeContas(linhas, updates) as unknown as Parameters<typeof recordGmailAccountFailure>[0];
}

function fakeSupabase(tokens: unknown, updates: Update[]) {
  return {
    rpc(fn: string) {
      if (fn !== "get_gmail_tokens") throw new Error(`rpc inesperada: ${fn}`);
      return Promise.resolve({ data: [tokens], error: null });
    },
    from(tabela: string) {
      return {
        update(valores: Record<string, unknown>) {
          return { eq: (coluna: string, valor: unknown) => {
            updates.push({ tabela, valores, eq: [[coluna, valor]] });
            return Promise.resolve({ data: null, error: null });
          } };
        },
      };
    },
  };
}

Deno.test("isGmailReauthError classifica refresh recusado como reautenticação", () => {
  assert(isGmailReauthError(new Error("400 invalid_grant: Token has been expired or revoked")));
  assert(isGmailReauthError(new Error("Failed to refresh token: unauthorized_client")));
  assert(isGmailReauthError(new Error("refresh token revoked pelo Google")));
  assert(!isGmailReauthError(new Error("Gmail API respondeu 500")));
  assert(!isGmailReauthError(new Error("fetch failed")));
});

Deno.test("sanitizeGmailErrorMessage remove token e e-mail completo", () => {
  const limpa = sanitizeGmailErrorMessage("refresh ya29.abc123 falhou para fulano@gmail.com (invalid_grant)");
  assert(!limpa.includes("ya29.abc123"), "token vazou");
  assert(!limpa.includes("fulano@gmail.com"), "e-mail completo vazou");
  assertStringIncludes(limpa, "invalid_grant");
  assert(sanitizeGmailErrorMessage("x".repeat(500)).length <= 200);
});

Deno.test("ensureValidToken propaga o corpo do refresh recusado (sem engolir)", async () => {
  Deno.env.set("GOOGLE_CLIENT_ID", "cid-teste");
  Deno.env.set("GOOGLE_CLIENT_SECRET", "segredo-teste");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token expired" }), { status: 400 }),
    )) as typeof fetch;
  try {
    const updates: Update[] = [];
    const supabase = fakeSupabase({ access_token: "t", refresh_token: "r" }, updates);
    const erro = await assertRejects(
      () =>
        ensureValidToken(
          supabase as unknown as Parameters<typeof ensureValidToken>[0],
          { id: "conta-1", token_expires_at: new Date(Date.now() - 60_000).toISOString() },
          new Logger("test"),
        ),
      Error,
    );
    assert(erro.message.includes("invalid_grant"), `corpo do Google perdido: ${erro.message}`);
    assertEquals(updates.length, 0);
  } finally {
    globalThis.fetch = realFetch;
    Deno.env.delete("GOOGLE_CLIENT_ID");
    Deno.env.delete("GOOGLE_CLIENT_SECRET");
  }
});

Deno.test("token revogado grava reauth_required sem vazar segredo", async () => {
  const updates: Update[] = [];
  const linhas: Record<string, ContaRow> = { "conta-1": { sync_status: "synced", last_error: null } };
  const erro = new Error("400 invalid_grant para ya29.secreto de fulano@gmail.com");
  const status = await recordGmailAccountFailure(supabaseContas(linhas, updates), "conta-1", erro);
  assertEquals(status, "reauth_required");
  assertEquals(updates.length, 1);
  assertEquals(updates[0].valores["sync_status"], "reauth_required");
  const gravado = String(updates[0].valores["last_error"] ?? "");
  assert(gravado.startsWith(GMAIL_REAUTH_MESSAGE), `mensagem inesperada: ${gravado}`);
  assert(!gravado.includes("ya29.secreto"), "token vazou");
  assert(!gravado.includes("fulano@gmail.com"), "e-mail completo vazou");
});

Deno.test("falhas transitórias consecutivas incrementam a contagem (1→2→3)", async () => {
  const updates: Update[] = [];
  const linhas: Record<string, ContaRow> = { "conta-1": { sync_status: "synced", last_error: null } };
  const supabase = supabaseContas(linhas, updates);
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const status = await recordGmailAccountFailure(supabase, "conta-1", new Error("Gmail API respondeu 500"));
    assertEquals(status, "error");
  }
  assertEquals(updates.length, 3);
  for (let i = 0; i < 3; i++) {
    const gravado = String(updates[i].valores["last_error"] ?? "");
    assert(
      gravado.startsWith(`${i + 1} tentativa(s) de sincronização falharam`),
      `tentativa ${i + 1} não incrementou: ${gravado}`,
    );
  }
  assertEquals(linhas["conta-1"].sync_status, "error");
});

Deno.test("sucesso zera a contagem: próxima falha volta a 1", async () => {
  const updates: Update[] = [];
  const linhas: Record<string, ContaRow> = { "conta-1": { sync_status: "synced", last_error: null } };
  const supabase = supabaseContas(linhas, updates);
  await recordGmailAccountFailure(supabase, "conta-1", new Error("fetch failed"));
  await recordGmailAccountFailure(supabase, "conta-1", new Error("fetch failed"));
  assertEquals(linhas["conta-1"].last_error?.startsWith("2 tentativa(s)"), true);
  await recordGmailAccountSuccess(supabase, "conta-1");
  assertEquals(linhas["conta-1"].sync_status, "synced");
  assertEquals(linhas["conta-1"].last_error, null);
  await recordGmailAccountFailure(supabase, "conta-1", new Error("fetch failed"));
  const gravado = String(updates[updates.length - 1].valores["last_error"] ?? "");
  assert(gravado.startsWith("1 tentativa(s) de sincronização falharam"), `não zerou: ${gravado}`);
});

Deno.test("leitura do estado anterior falhou: registra como 1ª tentativa e segue", async () => {
  const updates: Update[] = [];
  const seletorQuebrado = {
    select: (_cols: string) => ({
      eq: (_c: string, _v: unknown) => ({
        maybeSingle: () => Promise.reject(new Error("db fora do ar")),
        single: () => Promise.reject(new Error("db fora do ar")),
      }),
    }),
    update: (valores: Record<string, unknown>) => ({
      eq: (coluna: string, valor: unknown) => {
        updates.push({ tabela: "gmail_accounts", valores, eq: [[coluna, valor]] });
        return {
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(resolve({ data: null, error: null })),
        };
      },
    }),
  };
  const status = await recordGmailAccountFailure(
    { from: (_tabela: string) => seletorQuebrado } as unknown as Parameters<typeof recordGmailAccountFailure>[0],
    "conta-1",
    new Error("Gmail API respondeu 500"),
  );
  assertEquals(status, "error");
  assertEquals(updates.length, 1);
  assert((updates[0].valores.last_error as string).startsWith("1 tentativa(s)"));
});

Deno.test("parseGmailFailureAttempts só aceita o prefixo de tentativas", () => {
  assertEquals(parseGmailFailureAttempts("3 tentativa(s) de sincronização falharam: boom"), 3);
  assertEquals(parseGmailFailureAttempts(null), 0);
  assertEquals(parseGmailFailureAttempts(GMAIL_REAUTH_MESSAGE), 0);
  assertEquals(parseGmailFailureAttempts("tentativa(s) sem número"), 0);
});
