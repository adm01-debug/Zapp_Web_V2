// IA-013 (lote B) — header de assinatura ambíguo.
//
// A verificação adversarial do lote B achou uma divergência de parser: com a
// chave repetida (`t=...,v0=<atacante>,v0=<válido>`) o "último vence" fazia a
// requisição passar; invertida (`v0=<válido>,v0=<atacante>`), era recusada. Não
// é forja — continua exigindo HMAC válido — mas é o parser ESCOLHENDO qual valor
// vale, o que nenhum verificador de assinatura deve fazer. Agora header com
// chave repetida é recusado inteiro.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseElevenLabsSignature,
  verifyElevenLabsSignature,
} from "../webhook-signature.ts";

const HEX_64 = "a".repeat(64);
const HEX_64_B = "b".repeat(64);

Deno.test("IA-013: chave repetida no header é recusada (nada de 'último vence')", () => {
  assertEquals(parseElevenLabsSignature(`t=1700000000,v0=${HEX_64},v0=${HEX_64_B}`), null);
  assertEquals(parseElevenLabsSignature(`t=1700000000,t=1700000001,v0=${HEX_64}`), null);
  assertEquals(parseElevenLabsSignature(`v0=${HEX_64},t=1700000000,t=1700000000`), null);
});

Deno.test("IA-013: header bem formado continua sendo aceito", () => {
  const parsed = parseElevenLabsSignature(`t=1700000000,v0=${HEX_64}`);
  assertEquals(parsed, { timestamp: "1700000000", signature: HEX_64 });
  // Ordem invertida e espaços continuam tolerados (formato do provedor).
  const invertido = parseElevenLabsSignature(`v0=${HEX_64}, t=1700000000`);
  assertEquals(invertido, { timestamp: "1700000000", signature: HEX_64 });
});

Deno.test("IA-013: veredito bloqueante trata o header ambíguo como malformado", async () => {
  const agora = Date.now();
  const header = `t=${Math.floor(agora / 1000)},v0=${HEX_64},v0=${HEX_64_B}`;
  const verdict = await verifyElevenLabsSignature(
    new Headers({ "elevenlabs-signature": header }),
    '{"type":"probe"}',
    "secret-de-teste",
    { nowMs: agora },
  );
  assertEquals(verdict, { ok: false, reason: "malformed_signature" });
});
