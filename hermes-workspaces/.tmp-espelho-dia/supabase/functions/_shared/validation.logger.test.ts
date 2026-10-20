/**
 * Logger (validation.ts) — precedência entre o contexto FIXO do filho e o
 * contexto por chamada.
 *
 * Defeito (item 475 do BACKLOG_VERIFICADO / R3-DELTA-012, prova na auditoria:
 * validation.ts:45, 58-59): o `child()` do X033 existe para amarrar
 * `campaign_id`/`recipient_id`/`attempt` a TODA entrada do destinatário
 * ("contexto FIXO"), mas `log()` montava a entrada espalhando `...this.bound`
 * ANTES de `...ctx` — então o contexto passado na chamada sobrescrevia o do
 * filho, em silêncio. No motor TalkX o aviso de quarentena
 * (process-recipient.ts) repete `attempt` com o valor do banco (a tentativa
 * ANTERIOR), e a linha de quarentena saía com `attempt` diferente de todas as
 * outras linhas do MESMO destinatário.
 *
 * Este teste chama o Logger real e lê a linha impressa: sem a correção, a
 * primeira asserção falha (`attempt` 2 em vez de 3).
 */
import { Logger } from "./validation.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("Logger.child: o contexto FIXO do filho vence o contexto por chamada (quarentena não apaga o attempt)", () => {
  const captured: string[] = [];
  const originalWarn = console.warn;
  console.warn = ((msg?: unknown) => { captured.push(String(msg)); }) as typeof console.warn;
  try {
    const log = new Logger("talkx-send").child({
      campaign_id: "camp-1",
      recipient_id: "rec-1",
      attempt: 3,
    });
    // Reproduz a chamada do aviso de quarentena do motor TalkX: contexto da
    // passada + `attempt` com o valor do banco (a tentativa anterior).
    log.warn("Destinatário em quarentena (outcome_unknown)", {
      correlationId: "corr-1",
      campaignId: "camp-1",
      recipient_id: "rec-1",
      attempt: 2,
      error: "talkx_provider_outcome_unknown: HTTP 502",
    });
  } finally {
    console.warn = originalWarn;
  }

  assert(captured.length === 1, `esperado 1 entrada de log, recebido ${captured.length}`);
  const entry = JSON.parse(captured[0]) as Record<string, unknown>;
  assert(entry.fn === "talkx-send", `fn ausente: ${captured[0]}`);
  assert(
    entry.attempt === 3,
    `contexto por chamada sobrescreveu o attempt do logger filho: esperado 3, recebido ${entry.attempt}`,
  );
  assert(entry.recipient_id === "rec-1", `recipient_id do filho perdido: ${captured[0]}`);
  assert(entry.campaign_id === "camp-1", `campaign_id do filho perdido: ${captured[0]}`);
  // O contexto por chamada continua entrando na linha — o que ele não pode é
  // sobrescrever a identidade fixa do filho.
  assert(entry.correlationId === "corr-1", `correlationId do chamador ausente: ${captured[0]}`);
  assert(entry.campaignId === "camp-1", `campaignId do chamador ausente: ${captured[0]}`);
  assert(
    entry.error === "talkx_provider_outcome_unknown: HTTP 502",
    `error do chamador ausente: ${captured[0]}`,
  );
});

Deno.test("Logger sem contexto fixo: o contexto por chamada segue inteiro", () => {
  const captured: string[] = [];
  const originalLog = console.log;
  console.log = ((msg?: unknown) => { captured.push(String(msg)); }) as typeof console.log;
  try {
    new Logger("talkx-send").info("sem logger filho", { attempt: 7, correlationId: "corr-2" });
  } finally {
    console.log = originalLog;
  }

  assert(captured.length === 1, `esperado 1 entrada de log, recebido ${captured.length}`);
  const entry = JSON.parse(captured[0]) as Record<string, unknown>;
  assert(entry.attempt === 7, `contexto por chamada perdido: ${captured[0]}`);
  assert(entry.correlationId === "corr-2", `contexto por chamada perdido: ${captured[0]}`);
  assert(entry.msg === "sem logger filho", `msg ausente: ${captured[0]}`);
  assert(entry.level === "info", `level ausente: ${captured[0]}`);
});
