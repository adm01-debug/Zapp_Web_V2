// #2880: o corpo do 409 das transições só carrega CÓDIGO (allowlist ^[a-z0-9_]{1,80}$),
// nunca o texto cru do Postgres (coluna, função, timeout, permissão).
import { safeDbErrorCode } from "./index.ts";

function assertEquals(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}`);
}

Deno.test("talkx-send safeDbErrorCode: código de RAISE EXCEPTION passa intacto", () => {
  assertEquals(safeDbErrorCode({ message: "talkx_campaign_start_denied_from_running", code: "P0001" }), "talkx_campaign_start_denied_from_running", "código");
  assertEquals(safeDbErrorCode({ message: "multiplix_dispatch_not_found" }), "multiplix_dispatch_not_found", "código");
});

Deno.test("talkx-send safeDbErrorCode: texto do Postgres vira SQLSTATE (nunca o texto)", () => {
  assertEquals(safeDbErrorCode({ message: 'column "x" does not exist', code: "42703" }), "42703", "coluna");
  assertEquals(safeDbErrorCode({ message: "canceling statement due to statement timeout", code: "57014" }), "57014", "timeout");
  assertEquals(safeDbErrorCode({ message: "permission denied for function transition_talkx_campaign", code: "42501" }), "42501", "permissão");
});

Deno.test("talkx-send safeDbErrorCode: bypasses da regra antiga (!includes(' ')) não passam", () => {
  assertEquals(safeDbErrorCode({ message: "column\t\"secret_col\"\tdoes\tnot\texist", code: "42703" }), "42703", "tab");
  assertEquals(safeDbErrorCode({ message: "line1\nline2" }), "transition_failed", "quebra de linha sem code");
  assertEquals(safeDbErrorCode({ message: "a".repeat(81) }), "transition_failed", "acima de 80");
  assertEquals(safeDbErrorCode({ message: "Talkx_Campaign" }), "transition_failed", "maiúscula");
  assertEquals(safeDbErrorCode({ message: "público_çã" }), "transition_failed", "unicode");
  assertEquals(safeDbErrorCode({ message: "x", code: "with space" }), "x", "code inválido não importa quando a mensagem é código");
  assertEquals(safeDbErrorCode({ message: "has space", code: "bad code!" }), "transition_failed", "code inválido cai no fallback");
  assertEquals(safeDbErrorCode(null), "transition_failed", "null");
});
