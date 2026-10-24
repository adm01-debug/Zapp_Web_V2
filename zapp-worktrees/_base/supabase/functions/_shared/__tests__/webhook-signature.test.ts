// IA-013 — verificação BLOQUEANTE de assinatura do webhook da ElevenLabs.
//
// Contraponto de `webhook-auth-shadow.test.ts`: aquele arquivo prova que o modo
// sombra NUNCA bloqueia; este prova o oposto para o caminho bloqueante — o
// veredito DECIDE a resposta e a ausência de secret recusa a requisição
// (falha fechada). Se alguém reintroduzir "segue processando sem verificar",
// estes testes quebram.
//
// Run with: deno test --config scripts/ci/deno.json supabase/functions/_shared/__tests__/webhook-signature.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  parseElevenLabsSignature,
  verifyElevenLabsSignature,
} from "../webhook-signature.ts";

const SECRET = "elevenlabs-shared-secret";
const NOW_MS = 1_712_950_800_000; // 2024-04-12T21:00:00Z
const TS = String(Math.floor(NOW_MS / 1000));
const PAYLOAD = '{"type":"tts.completed","request_id":"abc"}';

async function sign(payload: string, secret = SECRET, ts = TS): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buffer = await crypto.subtle.sign("HMAC", key, encoder.encode(`${ts}.${payload}`));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const headers = (value: string, name = "elevenlabs-signature") => new Headers({ [name]: value });

// ---------------------------------------------------------------------------
// parseElevenLabsSignature
// ---------------------------------------------------------------------------

Deno.test("parseElevenLabsSignature: lê t= e v0=", () => {
  const parsed = parseElevenLabsSignature("t=1712950800,v0=deadbeefdeadbeefdeadbeefdeadbeef");
  assertEquals(parsed, { timestamp: "1712950800", signature: "deadbeefdeadbeefdeadbeefdeadbeef" });
});

Deno.test("parseElevenLabsSignature: header ausente, vazio ou sem os campos obrigatórios devolve null", () => {
  assertEquals(parseElevenLabsSignature(null), null);
  assertEquals(parseElevenLabsSignature(""), null);
  assertEquals(parseElevenLabsSignature("garbage-value"), null);
  assertEquals(parseElevenLabsSignature("v0=deadbeef"), null);
  assertEquals(parseElevenLabsSignature("t=1712950800"), null);
});

Deno.test("parseElevenLabsSignature: timestamp não numérico ou assinatura não-hex devolve null", () => {
  assertEquals(parseElevenLabsSignature("t=abc,v0=deadbeefdeadbeef"), null);
  assertEquals(parseElevenLabsSignature("t=1712950800,v0=zzzzzzzzzzzzzzzzzz"), null);
  assertEquals(parseElevenLabsSignature("t=1712950800,v0=curto"), null);
});

// ---------------------------------------------------------------------------
// verifyElevenLabsSignature — o caminho que decide a resposta
// ---------------------------------------------------------------------------

Deno.test("verifyElevenLabsSignature: assinatura válida dentro da tolerância -> ok", async () => {
  const signature = await sign(PAYLOAD);
  const verdict = await verifyElevenLabsSignature(
    headers(`t=${TS},v0=${signature}`),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS },
  );
  assertEquals(verdict, { ok: true, reason: "valid" });
});

Deno.test("verifyElevenLabsSignature: header legado xi-signature também é aceito", async () => {
  const signature = await sign(PAYLOAD);
  const verdict = await verifyElevenLabsSignature(
    headers(`t=${TS},v0=${signature}`, "xi-signature"),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS },
  );
  assertEquals(verdict.ok, true);
});

Deno.test("verifyElevenLabsSignature: SEM secret configurado -> falha fechada (nunca ok)", async () => {
  const signature = await sign(PAYLOAD);
  const withUndefined = await verifyElevenLabsSignature(
    headers(`t=${TS},v0=${signature}`),
    PAYLOAD,
    undefined,
    { nowMs: NOW_MS },
  );
  assertEquals(withUndefined, { ok: false, reason: "missing_secret" });

  const withEmpty = await verifyElevenLabsSignature(
    headers(`t=${TS},v0=${signature}`),
    PAYLOAD,
    "",
    { nowMs: NOW_MS },
  );
  assertEquals(withEmpty, { ok: false, reason: "missing_secret" });
});

Deno.test("verifyElevenLabsSignature: sem assinatura / malformada -> recusa", async () => {
  const missing = await verifyElevenLabsSignature(new Headers(), PAYLOAD, SECRET, { nowMs: NOW_MS });
  assertEquals(missing, { ok: false, reason: "missing_signature" });

  const malformed = await verifyElevenLabsSignature(
    headers("garbage-value"),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS },
  );
  assertEquals(malformed, { ok: false, reason: "malformed_signature" });
});

Deno.test("verifyElevenLabsSignature: secret errado ou payload adulterado -> recusa", async () => {
  const wrongSecretSignature = await sign(PAYLOAD, "outro-secret");
  const wrongSecret = await verifyElevenLabsSignature(
    headers(`t=${TS},v0=${wrongSecretSignature}`),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS },
  );
  assertEquals(wrongSecret, { ok: false, reason: "invalid_signature" });

  // Assinatura válida de um payload DIFERENTE do corpo recebido (replay trocado).
  const otherSignature = await sign('{"type":"tts.failed"}');
  const tampered = await verifyElevenLabsSignature(
    headers(`t=${TS},v0=${otherSignature}`),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS },
  );
  assertEquals(tampered, { ok: false, reason: "invalid_signature" });
});

Deno.test("verifyElevenLabsSignature: evento expirado ou no futuro fora da tolerância -> recusa (anti-replay)", async () => {
  const oldTs = String(Math.floor(NOW_MS / 1000) - 3600);
  const oldSignature = await sign(PAYLOAD, SECRET, oldTs);
  const expired = await verifyElevenLabsSignature(
    headers(`t=${oldTs},v0=${oldSignature}`),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS },
  );
  assertEquals(expired, { ok: false, reason: "stale_timestamp" });

  const futureTs = String(Math.floor(NOW_MS / 1000) + 3600);
  const futureSignature = await sign(PAYLOAD, SECRET, futureTs);
  const future = await verifyElevenLabsSignature(
    headers(`t=${futureTs},v0=${futureSignature}`),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS },
  );
  assertEquals(future, { ok: false, reason: "stale_timestamp" });
});

Deno.test("verifyElevenLabsSignature: tolerância é configurável e vale nas duas bordas", async () => {
  const insideTs = String(Math.floor(NOW_MS / 1000) - 299);
  const insideSignature = await sign(PAYLOAD, SECRET, insideTs);
  const inside = await verifyElevenLabsSignature(
    headers(`t=${insideTs},v0=${insideSignature}`),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS },
  );
  assertEquals(inside.ok, true);

  const outsideTs = String(Math.floor(NOW_MS / 1000) - 301);
  const outsideSignature = await sign(PAYLOAD, SECRET, outsideTs);
  const outside = await verifyElevenLabsSignature(
    headers(`t=${outsideTs},v0=${outsideSignature}`),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS },
  );
  assertEquals(outside, { ok: false, reason: "stale_timestamp" });

  const tight = await verifyElevenLabsSignature(
    headers(`t=${TS},v0=${await sign(PAYLOAD)}`),
    PAYLOAD,
    SECRET,
    { nowMs: NOW_MS, toleranceSeconds: 0 },
  );
  assertEquals(tight.ok, true);
});

Deno.test("verifyElevenLabsSignature: nenhuma entrada adversária produz ok=true", async () => {
  const validSignature = await sign(PAYLOAD);
  const adversarial: Array<[Headers, string, string | undefined]> = [
    [new Headers(), PAYLOAD, SECRET],
    [new Headers(), PAYLOAD, undefined],
    [headers(""), PAYLOAD, SECRET],
    [headers("t=,v0="), PAYLOAD, SECRET],
    [headers("t=1712950800,v0=00"), PAYLOAD, SECRET],
    [headers(`t=${TS},v0=${validSignature}`), '{"type":"outro"}', SECRET],
    [headers(`t=${TS},v0=${validSignature}`), PAYLOAD, undefined],
    [headers(`t=${TS},v0=${await sign(PAYLOAD, "secret-errado")}`), PAYLOAD, SECRET],
  ];

  for (const [hdrs, payload, secret] of adversarial) {
    const verdict = await verifyElevenLabsSignature(hdrs, payload, secret, { nowMs: NOW_MS });
    assertEquals(verdict.ok, false, `aceitou indevidamente: ${JSON.stringify(verdict)}`);
    assert(typeof verdict.reason === "string" && verdict.reason !== "valid");
  }
});
