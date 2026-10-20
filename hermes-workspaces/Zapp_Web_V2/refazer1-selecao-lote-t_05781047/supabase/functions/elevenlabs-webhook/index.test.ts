// IA-WEBHOOK-001 (P1) — webhook assinado aceitava replay e respondia 200 com
// falha de insert.
//
// Aceite:
//   - evento válido grava audit_logs com `dedupe_key` estável (índice único
//     parcial ux_audit_logs_dedupe_key deduplica no banco);
//   - replay (UNIQUE 23505 no insert) -> 200 { duplicate: true }, sem reexecutar
//     o efeito;
//   - qualquer outra falha de insert -> 5xx, NUNCA 200 (antes o {error} era
//     ignorado e o provedor recebia sucesso);
//   - entity_id (uuid) só recebe o id do evento quando ele é um UUID válido —
//     id textual do provedor ia para a coluna uuid e quebrava TODO insert,
//     mascarado pelo erro não verificado;
//   - evento sem id deduplica pela impressão (sha256) do corpo assinado;
//   - assinatura inválida segue 401 e não toca no banco (IA-013 preservado).
import { handleElevenLabsWebhook } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function makeReq(body: unknown, opts: { version?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.version) headers["x-contract-version"] = opts.version;
  return new Request("https://edge.invalid/elevenlabs-webhook", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

interface InsertCall {
  table: string;
  row: Record<string, unknown>;
}

// Cliente service-role que responde o {error} programado de cada insert e
// registra todas as linhas enviadas.
function supabaseMock(opts: { insertErrors?: Array<{ code?: string; message?: string } | null> } = {}) {
  const inserts: InsertCall[] = [];
  let call = 0;
  const supabase = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        const err = opts.insertErrors?.[call] ?? null;
        call += 1;
        return Promise.resolve({ data: err ? null : [{ id: "audit-1" }], error: err });
      },
    }),
  };
  return { supabase, inserts };
}

function depsOk(supabase: unknown) {
  return {
    supabase,
    webhookSecret: "segredo-teste",
    verifySignature: () => Promise.resolve({ ok: true as const, reason: "valid" as const }),
  };
}

Deno.test("assinatura inválida -> 401 e zero insert (IA-013 preservado)", async () => {
  const mock = supabaseMock();
  const res = await handleElevenLabsWebhook(makeReq({ type: "tts.completed" }), {
    supabase: mock.supabase,
    webhookSecret: "segredo-teste",
    verifySignature: () => Promise.resolve({ ok: false as const, reason: "invalid_signature" as const }),
  });
  assert(res.status === 401, `esperado 401, recebido ${res.status}`);
  assert(mock.inserts.length === 0, "nenhum insert deveria ocorrer sem assinatura válida");
});

Deno.test("IA-WEBHOOK-001: falha de insert do audit_logs NÃO pode responder 200", async () => {
  const mock = supabaseMock({ insertErrors: [{ code: "42501", message: "rls violation" }] });
  const res = await handleElevenLabsWebhook(
    makeReq({ type: "tts.completed", request_id: "req-777" }),
    depsOk(mock.supabase),
  );
  assert(res.status >= 500, `falha de persistência tem de ser 5xx (provedor retenta), recebido ${res.status}`);
});

Deno.test("IA-WEBHOOK-001: replay (UNIQUE 23505) -> 200 duplicate, sem novo efeito", async () => {
  const mock = supabaseMock({ insertErrors: [{ code: "23505", message: "duplicate key ux_audit_logs_dedupe_key" }] });
  const res = await handleElevenLabsWebhook(
    makeReq({ type: "tts.completed", request_id: "req-777" }),
    depsOk(mock.supabase),
  );
  assert(res.status === 200, `replay deduplicado tem de responder 200, recebido ${res.status}`);
  const body = await res.json();
  assert(body.received === true && body.duplicate === true,
    `corpo de replay inesperado: ${JSON.stringify(body)}`);
});

Deno.test("evento válido -> 200, dedupe_key estável e entity_id null para id não-UUID", async () => {
  const mock = supabaseMock();
  const res = await handleElevenLabsWebhook(
    makeReq({ type: "tts.completed", request_id: "req-abc-123" }),
    depsOk(mock.supabase),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(mock.inserts.length === 1, `esperado 1 insert, recebido ${mock.inserts.length}`);
  const insert = mock.inserts[0];
  assert(insert.table === "audit_logs", `tabela inesperada: ${insert.table}`);
  assert(
    insert.row.dedupe_key === "elevenlabs:tts.completed:req-abc-123",
    `dedupe_key inesperada: ${insert.row.dedupe_key}`,
  );
  // 'req-abc-123' não é UUID: antes ia para a coluna uuid e todo insert
  // quebrava em silêncio. Tem de ficar fora de entity_id (guardado em details).
  assert(insert.row.entity_id === null, `entity_id tinha de ser null: ${insert.row.entity_id}`);
  const details = insert.row.details as Record<string, unknown>;
  assert(details.request_id === "req-abc-123", `details.request_id inesperado: ${JSON.stringify(details)}`);
});

Deno.test("entity_id recebe o id do evento SÓ quando é UUID válido", async () => {
  const mock = supabaseMock();
  const uuid = "123e4567-e89b-42d3-a456-426614174000";
  const res = await handleElevenLabsWebhook(
    makeReq({ type: "music.completed", id: uuid }),
    depsOk(mock.supabase),
  );
  assert(res.status === 200, `esperado 200, recebido ${res.status}`);
  assert(mock.inserts[0].row.entity_id === uuid, `entity_id inesperado: ${mock.inserts[0].row.entity_id}`);
});

Deno.test("replay real: segunda entrega do mesmo evento é deduplicada", async () => {
  // 1ª entrega insere; a 2ª bate na UNIQUE do dedupe_key (comportamento do banco).
  const mock = supabaseMock({
    insertErrors: [null, { code: "23505", message: "duplicate key ux_audit_logs_dedupe_key" }],
  });
  const deps = depsOk(mock.supabase);
  const primeiro = await handleElevenLabsWebhook(
    makeReq({ type: "sfx.completed", request_id: "req-9" }), deps,
  );
  const segundo = await handleElevenLabsWebhook(
    makeReq({ type: "sfx.completed", request_id: "req-9" }), deps,
  );
  assert(primeiro.status === 200, `1ª entrega falhou: ${primeiro.status}`);
  const corpo1 = await primeiro.json();
  assert(corpo1.duplicate !== true, "1ª entrega não pode ser marcada como duplicada");
  assert(segundo.status === 200, `2ª entrega (replay) tem de ser 200: ${segundo.status}`);
  const corpo2 = await segundo.json();
  assert(corpo2.duplicate === true, `replay não sinalizado: ${JSON.stringify(corpo2)}`);
});

Deno.test("evento sem id deduplica pela impressão do corpo", async () => {
  const mock = supabaseMock();
  const deps = depsOk(mock.supabase);
  const payload = { type: "quota.warning", usage_percent: 90 };
  const r1 = await handleElevenLabsWebhook(makeReq(payload), deps);
  const r2 = await handleElevenLabsWebhook(makeReq(payload), deps);
  assert(r1.status === 200 && r2.status === 200, "ambas as entregas deveriam responder 200");
  assert(mock.inserts.length === 2, "sem erro simulado os dois inserts acontecem");
  const key = mock.inserts[0].row.dedupe_key as string;
  assert(key.startsWith("elevenlabs:quota.warning:sha256:"),
    `dedupe por hash inesperada: ${key}`);
  assert(mock.inserts[1].row.dedupe_key === key,
    "mesmo corpo tem de produzir a mesma dedupe_key (é o que a UNIQUE deduplica)");
});
