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
// TEL-RECONCILIATION-001 (item 61 do BACKLOG_VERIFICADO) acrescenta, como aceite:
//   4. **Identidade com DDD.** Casar so pelos ultimos digitos vinculava a chamada um numero de
//      outro DDD; a associacao arbitraria e proibida.
//   5. **Ambiguidade e ignorada.** Duas linhas casando o mesmo numero nao recebem vinculo -
//      melhor nao reconciliar do que reconciliar a chamada errada.
//   6. **Motivo de encerramento canonico.** `CALL_FAILED_CODE` cru viola o CHECK de
//      `calls.end_reason`; ele e traduzido para o vocabulario canonico.
//   7. **Reexecucao nao apaga dado bom.** Campo sem valor novo na origem nao sobrescreve com null.
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

Deno.test("TEL-RECONCILIATION-001: numero de outro DDD nao recebe vinculo arbitrario", () => {
  // Mesmo numero final (999999999) num DDD diferente: o sufixo casaria, a identidade nao.
  const candidatas = [{ id: "call-1", peer_number: "5531999999999" }];
  assertEquals(escolherCandidata(candidatas, "11999999999"), null);
});

Deno.test("TEL-RECONCILIATION-001: ambiguidade real (duas linhas p/ o mesmo numero) e ignorada", () => {
  const candidatas = [
    { id: "call-1", peer_number: "5511999999999" },
    { id: "call-2", peer_number: "11999999999" },
  ];
  assertEquals(escolherCandidata(candidatas, "11999999999"), null);
});

Deno.test("T72: sem audio, recording_status fica 'none' (nada de player vazio)", () => {
  const semAudio = dadosDaReconciliacao({ CALL_ID: "b24-1", CALL_FAILED_CODE: "200" });
  assertEquals(semAudio.recording_status, "none");
  // Sem URL na origem: nao grava `recording_url` (nem com null, que apagaria um audio bom).
  assert(!("recording_url" in semAudio));

  const comAudio = dadosDaReconciliacao({ CALL_ID: "b24-2", CALL_RECORD_URL: "https://bitrix/x.mp3" });
  assertEquals(comAudio.recording_status, "available");
  assertEquals(comAudio.recording_url, "https://bitrix/x.mp3");
});

Deno.test("TEL-RECONCILIATION-001: CALL_FAILED_CODE cru vira end_reason canonico", () => {
  assertEquals(dadosDaReconciliacao({ CALL_FAILED_CODE: "200" }).end_reason, "completed");
  assertEquals(dadosDaReconciliacao({ CALL_FAILED_CODE: "408" }).end_reason, "no_answer");
  assertEquals(dadosDaReconciliacao({ CALL_FAILED_CODE: "480" }).end_reason, "no_answer");
  assertEquals(dadosDaReconciliacao({ CALL_FAILED_CODE: "486" }).end_reason, "busy");
  assertEquals(dadosDaReconciliacao({ CALL_FAILED_CODE: "603" }).end_reason, "declined");
  assertEquals(dadosDaReconciliacao({ CALL_FAILED_CODE: "503" }).end_reason, "failed");
  // Codigo ausente/vazio nao tem valor novo: preserva o desfecho ja gravado.
  assert(!("end_reason" in dadosDaReconciliacao({})));
  assert(!("end_reason" in dadosDaReconciliacao({ CALL_FAILED_CODE: "" })));
});

Deno.test("TEL-RECONCILIATION-001: registro sem campo nao apaga o existente com null", () => {
  const soDuracao = dadosDaReconciliacao({ CALL_DURATION: "30" });
  assert(!("provider_call_id" in soDuracao));
  assert(!("recording_url" in soDuracao));
  assert(!("end_reason" in soDuracao));
});

Deno.test("T72: talk_seconds so entra positivo (duracao ausente ou zero nao sobrescreve)", () => {
  assert(!("talk_seconds" in dadosDaReconciliacao({ CALL_DURATION: "" })));
  assert(!("talk_seconds" in dadosDaReconciliacao({ CALL_DURATION: "0" })));
  assert(!("talk_seconds" in dadosDaReconciliacao({ CALL_DURATION: "abc" })));
  assertEquals(dadosDaReconciliacao({ CALL_DURATION: "47" }).talk_seconds, 47);
});

Deno.test("T72: a atualizacao nunca carrega id nem colunas de criacao", () => {
  const campos = Object.keys(
    dadosDaReconciliacao({
      CALL_ID: "b24-1",
      CALL_DURATION: "10",
      CALL_RECORD_URL: "https://bitrix/x.mp3",
      CALL_FAILED_CODE: "200",
    }),
  );
  assertEquals(campos.sort(), ["end_reason", "provider_call_id", "recording_status", "recording_url", "talk_seconds"]);
  assert(!campos.includes("id"));
  assert(!campos.includes("started_at"));
  assert(!campos.includes("direction"));
});
