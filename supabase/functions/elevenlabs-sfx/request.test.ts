// #201 — contrato de duração da geração musical no `elevenlabs-sfx`.
//
// O que estes testes travam:
//   1. mode "music" monta o corpo do POST /v1/music com `music_length_ms` em
//      milissegundos (padrão 15 s → 15000 ms) — nunca `duration_seconds`.
//   2. mode "sfx" preserva o contrato de efeitos: `text`, `duration_seconds`
//      e `prompt_influence: 0.3` — nunca `music_length_ms`.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/elevenlabs-sfx/request.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildElevenLabsRequest } from "./request.ts";

Deno.test("music: corpo usa music_length_ms em ms (padrao 15 s -> 15000 ms), sem duration_seconds", () => {
  const spec = buildElevenLabsRequest({ prompt: "trilha calma", mode: "music" });
  assertEquals(spec.url, "https://api.elevenlabs.io/v1/music");
  assertEquals(spec.body, { prompt: "trilha calma", music_length_ms: 15000 });
  assert(!("duration_seconds" in spec.body), "music nao pode enviar duration_seconds");
});

Deno.test("music: duration em segundos vira milissegundos", () => {
  const spec = buildElevenLabsRequest({ prompt: "trilha", duration: 42, mode: "music" });
  assertEquals(spec.body, { prompt: "trilha", music_length_ms: 42000 });
});

Deno.test("sfx: contrato de efeitos preservado (text + duration_seconds + prompt_influence)", () => {
  const spec = buildElevenLabsRequest({ prompt: "estalo", duration: 3, mode: "sfx" });
  assertEquals(spec.url, "https://api.elevenlabs.io/v1/sound-generation");
  assertEquals(spec.body, { text: "estalo", duration_seconds: 3, prompt_influence: 0.3 });
  assert(!("music_length_ms" in spec.body), "sfx nao pode enviar music_length_ms");
});
