import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  ensureValidToken,
  gmailNextAttemptAt,
  gmailRetryDelayMs,
  GMAIL_SYNC_CLAIM_STALE_MS,
  GMAIL_REAUTH_MESSAGE,
  selectGmailAccountsDue,
  isGmailReauthError,
  recordGmailAccountFailure,
  sanitizeGmailErrorMessage,
} from "../gmail-helpers.ts";
import { Logger } from "../validation.ts";

type Update = { tabela: string; valores: Record<string, unknown>; eq: Array<[string, unknown]> };

/** Fake mínimo do client: registra o UPDATE em gmail_accounts e serve o RPC de tokens. */
function fakeSupabase(tokens: { access_token: string; refresh_token: string } | null, updates: Update[]) {
  return {
    rpc(fn: string) {
      if (fn !== "get_gmail_tokens") throw new Error(`rpc inesperada: ${fn}`);
      return Promise.resolve(tokens ? { data: [tokens], error: null } : { data: null, error: null });
    },
    from(tabela: string) {
      const registro: Update = { tabela, valores: {}, eq: [] };
      const builder: Record<string, unknown> = {};
      builder.update = (valores: Record<string, unknown>) => { registro.valores = valores; updates.push(registro); return builder; };
      builder.eq = (coluna: string, valor: unknown) => { registro.eq.push([coluna, valor]); return builder; };
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: null, error: null }));
      return builder;
    },
  };
}

const supabaseParaFalha = (updates: Update[]) =>
  fakeSupabase({ access_token: "t", refresh_token: "r" }, updates) as unknown as Parameters<typeof recordGmailAccountFailure>[0];

Deno.test("token revogado (invalid_grant) vira reauth_required sem vazar e-mail nem token", async () => {
  const updates: Update[] = [];
  const erro = new Error(
    'Gmail token refresh rejected (400): {"error":"invalid_grant","error_description":"Token has been expired or revoked."} joaquim@empresa.com ya29.a0AfH6SMBsegredo',
  );

  const status = await recordGmailAccountFailure(supabaseParaFalha(updates), "conta-1", erro, 1);

  assertEquals(status, "reauth_required");
  assertEquals(updates.length, 1);
  assertEquals(updates[0].valores.sync_status, "reauth_required");
  assertEquals(updates[0].valores.next_attempt_at, null, "reauth não deve ficar agendado para retry automático");
  assertEquals(updates[0].eq, [["id", "conta-1"]]);
  const lastError = String(updates[0].valores.last_error);
  assertEquals(lastError.startsWith(GMAIL_REAUTH_MESSAGE), true);
  assertEquals(lastError.includes("joaquim@empresa.com"), false);
  assertEquals(lastError.includes("ya29."), false);
});

Deno.test("falha transitória fica em error com a contagem de tentativas", async () => {
  const updates: Update[] = [];

  const status = await recordGmailAccountFailure(
    supabaseParaFalha(updates),
    "conta-2",
    new Error("Gmail API error (503): upstream indisponível"),
    3,
  );

  assertEquals(status, "error");
  assertEquals(updates[0].valores.sync_status, "error");
  assertEquals(updates[0].valores.error_count, 3);
  assertEquals(new Date(String(updates[0].valores.next_attempt_at)).getTime() > Date.now(), true);
  assertEquals(String(updates[0].valores.last_error).startsWith("3 tentativa(s) de sincronização falharam"), true);
});

Deno.test("backoff do Gmail cresce exponencialmente, tem teto e agenda com relógio injetável", () => {
  assertEquals([1, 2, 3, 4, 20].map(gmailRetryDelayMs), [60_000, 120_000, 240_000, 480_000, 3_600_000]);
  const now = Date.parse("2026-10-21T12:00:00.000Z");
  assertEquals(gmailNextAttemptAt(3, now), "2026-10-21T12:04:00.000Z");
  assertEquals(gmailRetryDelayMs(0), 60_000, "entrada zerada ou inválida não pode desativar o retry");
});

Deno.test("isGmailReauthError reconhece token revogado e não confunde falha transitória", () => {
  assertEquals(isGmailReauthError(new Error("... invalid_grant ...")), true);
  assertEquals(isGmailReauthError(new Error("Token has been expired or revoked.")), true);
  assertEquals(isGmailReauthError(new Error("unauthorized_client")), true);
  assertEquals(isGmailReauthError(new Error("Gmail API error (503): upstream")), false);
  assertEquals(isGmailReauthError(undefined), false);
});

Deno.test("selectGmailAccountsDue exclui reauth/inativas e respeita o próximo retry", () => {
  const now = Date.parse("2026-10-21T12:00:00.000Z");
  const accounts = [
    { id: "due", is_active: true, sync_status: "error", next_attempt_at: "2026-10-21T11:59:59.000Z" },
    { id: "no-retry", is_active: true, sync_status: "pending", next_attempt_at: null },
    { id: "future", is_active: true, sync_status: "error", next_attempt_at: "2026-10-21T12:00:01.000Z" },
    { id: "revoked", is_active: true, sync_status: "reauth_required", next_attempt_at: null },
    { id: "inactive", is_active: false, sync_status: "pending", next_attempt_at: null },
    { id: "bad-date", is_active: true, sync_status: "error", next_attempt_at: "not-a-date" },
  ];

  assertEquals(selectGmailAccountsDue(accounts, now).map((account) => account.id), ["due", "no-retry", "bad-date"]);
});

Deno.test("selectGmailAccountsDue só recupera claim syncing após expiração comprovada", () => {
  const now = Date.parse("2026-10-21T12:00:00.000Z");
  const accounts = [
    { id: "fresh-claim", is_active: true, sync_status: "syncing", updated_at: new Date(now - GMAIL_SYNC_CLAIM_STALE_MS + 1).toISOString() },
    { id: "stale-claim", is_active: true, sync_status: "syncing", updated_at: new Date(now - GMAIL_SYNC_CLAIM_STALE_MS).toISOString() },
    { id: "unknown-claim", is_active: true, sync_status: "syncing", updated_at: "invalid-date" },
  ];
  assertEquals(selectGmailAccountsDue(accounts, now).map((account) => account.id), ["stale-claim"]);
});

Deno.test("sanitizeGmailErrorMessage mascara e-mail/token e limita o tamanho", () => {
  const cru = `falha em contato@empresa.com ya29.a0AfH6SMBsegredo ${"a".repeat(300)}`;
  const limpo = sanitizeGmailErrorMessage(cru);

  assertEquals(limpo.length, 200);
  assertEquals(limpo.includes("contato@empresa.com"), false);
  assertEquals(limpo.includes("ya29."), false);
  assertEquals(limpo.includes("[email]"), true);
  assertEquals(limpo.includes("[token]"), true);
});

Deno.test("ensureValidToken propaga o corpo do refresh recusado para permitir a classificação", async () => {
  Deno.env.set("GOOGLE_CLIENT_ID", "cid-teste");
  Deno.env.set("GOOGLE_CLIENT_SECRET", "segredo-teste");
  const updates: Update[] = [];
  const supabase = fakeSupabase({ access_token: "velho", refresh_token: "refresh-1" }, updates) as unknown as Parameters<typeof ensureValidToken>[0];
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(
      JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }),
      { status: 400 },
    ))) as typeof fetch;
  try {
    const erro = await assertRejects(
      () => ensureValidToken(supabase, { id: "conta-1", token_expires_at: new Date(Date.now() - 60_000).toISOString() }, new Logger("test")),
      Error,
    );
    assertEquals(erro.message.includes("invalid_grant"), true);
    assertEquals(isGmailReauthError(erro), true);
    assertEquals(updates.length, 0); // não persistiu token nenhum no caminho de recusa
  } finally {
    globalThis.fetch = fetchOriginal;
    Deno.env.delete("GOOGLE_CLIENT_ID");
    Deno.env.delete("GOOGLE_CLIENT_SECRET");
  }
});
