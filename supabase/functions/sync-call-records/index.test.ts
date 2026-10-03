// T72 — reconciliacao com o Bitrix24 (voximplant.statistic.get).
//
// O que estes testes travam, que e o que a etapa exige:
//   1. **Nunca cria chamada.** Sem correspondente na janela, a resposta e `null` (ignorar);
//      nao existe caminho que produza uma insercao.
//   2. **A janela e ±90 s de verdade** - um deslocamento aqui casaria a chamada errada, que e
//      pior do que nao casar nada.
//   3. **O que a reconciliacao pode escrever** e um conjunto fechado de campos, e
//      `recording_status` segue a existencia do audio (nada de player que nao toca).
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env supabase/functions/sync-call-records/index.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { dadosDaReconciliacao, escolherCandidata, janelaDoCasamento } from "./index.ts";

const BASE = new Date("2026-10-03T14:00:00.000Z");

Deno.test("T72: a janela e ±90 s em torno do inicio registrado", () => {
  assertEquals(janelaDoCasamento(BASE), {
    de: "2026-10-03T13:58:30.000Z",
    ate: "2026-10-03T14:01:30.000Z",
  });
});

Deno.test("T72: casa pelos ultimos 9 digitos (com ou sem DDI)", () => {
  const candidatas = [{ id: "call-1", peer_number: "5511999999999" }];
  assertEquals(escolherCandidata(candidatas, "11999999999")?.id, "call-1");
  assertEquals(escolherCandidata(candidatas, "+55 11 99999-9999")?.id, "call-1");
});

Deno.test("T72: sem correspondente devolve null - ignorar, nunca criar", () => {
  const candidatas = [{ id: "call-1", peer_number: "5511888888888" }];
  assertEquals(escolherCandidata(candidatas, "11999999999"), null);
  assertEquals(escolherCandidata([], "11999999999"), null);
  assertEquals(escolherCandidata(null, "11999999999"), null);
});

Deno.test("T72: numero vazio nao casa com todo mundo", () => {
  const candidatas = [{ id: "call-1", peer_number: "5511999999999" }];
  assertEquals(escolherCandidata(candidatas, ""), null);
});

Deno.test("T72: sem audio, recording_status fica 'none' (nada de player vazio)", () => {
  const semAudio = dadosDaReconciliacao({ CALL_ID: "b24-1", CALL_FAILED_CODE: "200" });
  assertEquals(semAudio.recording_status, "none");
  assertEquals(semAudio.recording_url, null);

  const comAudio = dadosDaReconciliacao({ CALL_ID: "b24-2", CALL_RECORD_URL: "https://bitrix/x.mp3" });
  assertEquals(comAudio.recording_status, "available");
  assertEquals(comAudio.recording_url, "https://bitrix/x.mp3");
});

Deno.test("T72: talk_seconds so entra positivo (duracao ausente ou zero nao sobrescreve)", () => {
  assert(!("talk_seconds" in dadosDaReconciliacao({ CALL_DURATION: "" })));
  assert(!("talk_seconds" in dadosDaReconciliacao({ CALL_DURATION: "0" })));
  assert(!("talk_seconds" in dadosDaReconciliacao({ CALL_DURATION: "abc" })));
  assertEquals(dadosDaReconciliacao({ CALL_DURATION: "47" }).talk_seconds, 47);
});

Deno.test("T72: a atualizacao nunca carrega id nem colunas de criacao", () => {
  const campos = Object.keys(dadosDaReconciliacao({ CALL_ID: "b24-1", CALL_DURATION: "10" }));
  assertEquals(campos.sort(), ["end_reason", "provider_call_id", "recording_status", "recording_url", "talk_seconds"]);
  assert(!campos.includes("id"));
  assert(!campos.includes("started_at"));
  assert(!campos.includes("direction"));
});
