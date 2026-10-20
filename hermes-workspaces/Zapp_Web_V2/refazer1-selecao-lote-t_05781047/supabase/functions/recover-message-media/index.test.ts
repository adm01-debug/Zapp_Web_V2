/**
 * recover-message-media — o contrato { status } e a checagem de acesso.
 *
 * O QUE ESTE ARQUIVO PROVA, chamando o HANDLER REAL (`handleRecoverMessageMedia`)
 * com as portas substituídas por dublês (nada de rede, banco ou credencial):
 *   1. os QUATRO status do cartão, um teste cada:
 *        ok            — baixou e gravou a URL permanente;
 *        ja_permanente — já estava no Storage, NÃO chama a Evolução;
 *        indisponivel  — a Evolução não devolveu bytes, NÃO grava media_url;
 *        negado        — sem acesso à mensagem, tipo não recuperável, apagada
 *                        ou sem autenticação; NENHUMA chamada externa;
 *   2. a CHECAGEM DE ACESSO decide antes de qualquer leitura privilegiada
 *      (sem acesso → a linha nem é carregada, a Evolução nem é chamada);
 *   3. o LIMITE de 10 min por mensagem: com carimbo recente a Evolução NÃO é
 *      chamada; na borda EXATA de 10 min a tentativa é permitida.
 *
 * LIMITE DECLARADO: as portas (acesso, leitura, Evolução, upload, gravação) são
 * dublês. O caminho de produção — RLS de `messages`, `getBase64FromMediaMessage`
 * na Evolução, `persistBase64Media` no bucket — não é exercido aqui; só o
 * encadeamento de decisão do handler.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
 *           supabase/functions/recover-message-media/index.test.ts
 */
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  classifyRecovery,
  handleRecoverMessageMedia,
  isPermanentStorageUrl,
  RECOVERY_COOLDOWN_MS,
  type RecoverDeps,
  type RecoveryRow,
  type RecoverPorts,
} from "./index.ts";

const MSG_ID = "3f9c1e2a-4b5d-4f60-8a71-9c2d3e4f5a6b";
const CONTACT_ID = "0a1b2c3d-4e5f-4071-8293-a4b5c6d7e8f9";
const CONN_ID = "11223344-5566-4778-8990-aabbccddeeff";
const URL_PERMANENTE = "https://proj.supabase.co/storage/v1/object/public/whatsapp-media/image/3f9c1e2a.jpg";

let pedidos = 0;
function pedido(messageId: unknown): Request {
  pedidos += 1;
  return new Request("https://local.test/recover-message-media", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer token-de-teste",
      "x-forwarded-for": `10.7.0.${pedidos}`,
    },
    body: JSON.stringify({ message_id: messageId }),
  });
}

function linha(extra: Partial<RecoveryRow> = {}): RecoveryRow {
  return {
    id: MSG_ID,
    contact_id: CONTACT_ID,
    message_type: "image",
    external_id: "3EB0F0A1B2C3",
    whatsapp_connection_id: CONN_ID,
    media_url: null,
    is_deleted: false,
    media_meta: null,
    ...extra,
  };
}

interface PortasOpts {
  acesso?: boolean;
  row?: RecoveryRow | null;
  instance?: string | null;
  media?: { base64: string; mimetype: string } | null;
  url?: string | null;
  loadThrows?: boolean;
  fetchThrows?: boolean;
  markFails?: boolean;
  saveFails?: boolean;
}

function dublês(opts: PortasOpts = {}) {
  const chamadas = { acesso: 0, leitura: 0, instance: 0, fetch: 0, persist: 0, mark: 0, save: 0 };
  const salvos: string[] = [];
  const carimbos: Array<Record<string, unknown>> = [];
  const ports: RecoverPorts = {
    checkAccess: () => { chamadas.acesso++; return Promise.resolve(opts.acesso ?? true); },
    loadMessage: () => {
      chamadas.leitura++;
      if (opts.loadThrows) return Promise.reject(new Error("db indisponivel"));
      return Promise.resolve(opts.row === undefined ? linha() : opts.row);
    },
    resolveInstance: () => { chamadas.instance++; return Promise.resolve(opts.instance === undefined ? "inst-1" : opts.instance); },
    fetchMedia: () => {
      chamadas.fetch++;
      if (opts.fetchThrows) return Promise.reject(new Error("rede indisponivel"));
      return Promise.resolve(opts.media === undefined ? { base64: "QUJDRA==", mimetype: "image/jpeg" } : opts.media);
    },
    persistMedia: () => { chamadas.persist++; return Promise.resolve(opts.url === undefined ? URL_PERMANENTE : opts.url); },
    markAttempt: (_id, meta) => {
      chamadas.mark++;
      carimbos.push(meta);
      return Promise.resolve(!opts.markFails);
    },
    saveMediaUrl: (_id, url) => {
      chamadas.save++;
      salvos.push(url);
      return Promise.resolve(!opts.saveFails);
    },
  };
  return { ports, chamadas, salvos, carimbos };
}

const AUTORIZADO: RecoverDeps["authorize"] = () => Promise.resolve({ userId: CONTACT_ID });

// ── status: ok ────────────────────────────────────────────────────────────────

Deno.test("ok — baixa da Evolução, grava a URL permanente e atualiza a mensagem", async () => {
  const { ports, chamadas, salvos } = dublês();
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date("2026-10-11T12:00:00Z") });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ok");
  assertEquals(body.media_url, URL_PERMANENTE);
  assertEquals(chamadas.acesso, 1);
  assertEquals(chamadas.fetch, 1);
  assertEquals(chamadas.mark, 1, "a tentativa tem de ser carimbada");
  assertEquals(chamadas.save, 1);
  assertEquals(salvos, [URL_PERMANENTE]);
});

// ── status: ja_permanente ─────────────────────────────────────────────────────

Deno.test("ja_permanente — já no Storage: devolve a URL e NÃO chama a Evolução", async () => {
  const { ports, chamadas } = dublês({ row: linha({ media_url: URL_PERMANENTE }) });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.status, "ja_permanente");
  assertEquals(body.media_url, URL_PERMANENTE);
  assertEquals(chamadas.fetch, 0, "idempotente: nada é baixado");
  assertEquals(chamadas.persist, 0);
  assertEquals(chamadas.save, 0);
});

// ── status: indisponivel ──────────────────────────────────────────────────────

Deno.test("indisponivel — a Evolução não devolve bytes: não grava media_url", async () => {
  const { ports, chamadas } = dublês({ media: null });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "indisponivel");
  assertEquals(chamadas.fetch, 1, "tentou");
  assertEquals(chamadas.mark, 1, "a tentativa falha também conta para o limite");
  assertEquals(chamadas.save, 0, "não grava URL quando não recuperou");
});

Deno.test("indisponivel — sem conexão de origem: nem resolve instância nem chama a Evolução", async () => {
  const { ports, chamadas } = dublês({ row: linha({ whatsapp_connection_id: null }) });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals((await res.json()).status, "indisponivel");
  assertEquals(chamadas.instance, 0);
  assertEquals(chamadas.fetch, 0);
});

Deno.test("indisponivel — erro ao carregar a mensagem não vira 404 negado", async () => {
  const { ports, chamadas } = dublês({ loadThrows: true });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "indisponivel");
  assertEquals(chamadas.leitura, 1);
  assertEquals(chamadas.fetch, 0);
});

Deno.test("indisponivel — sem instance_id: não chama a Evolução", async () => {
  const { ports, chamadas } = dublês({ instance: null });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "indisponivel");
  assertEquals(chamadas.instance, 1);
  assertEquals(chamadas.fetch, 0);
});

Deno.test("indisponivel — erro de rede ao buscar mídia não estoura 500", async () => {
  const { ports, chamadas } = dublês({ fetchThrows: true });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "indisponivel");
  assertEquals(chamadas.fetch, 1);
  assertEquals(chamadas.save, 0);
});

Deno.test("limite — falha ao carimbar a tentativa impede chamada externa", async () => {
  const { ports, chamadas } = dublês({ markFails: true });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "indisponivel");
  assertEquals(chamadas.mark, 1);
  assertEquals(chamadas.fetch, 0, "sem carimbo confirmado, não chama a Evolution");
});

Deno.test("indisponivel — upload salvo mas update da mensagem falha: não responde ok", async () => {
  const { ports, chamadas } = dublês({ saveFails: true });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "indisponivel");
  assertEquals(chamadas.persist, 1);
  assertEquals(chamadas.save, 1);
});

// ── status: negado (acesso e tipo) ────────────────────────────────────────────

Deno.test("negado — sem acesso à mensagem: não carrega a linha nem chama a Evolução", async () => {
  const { ports, chamadas } = dublês({ acesso: false });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).status, "negado");
  assertEquals(chamadas.leitura, 0, "acesso decide ANTES da leitura privilegiada");
  assertEquals(chamadas.fetch, 0, "nada de chamada externa sem acesso");
  assertEquals(chamadas.mark, 0);
});

Deno.test("negado — sticker (tipo não recuperável): nenhuma chamada externa", async () => {
  const { ports, chamadas } = dublês({ row: linha({ message_type: "sticker" }) });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 403);
  assertEquals((await res.json()).status, "negado");
  assertEquals(chamadas.fetch, 0);
});

Deno.test("negado — mensagem apagada: recusada mesmo com tipo de mídia", async () => {
  const { ports, chamadas } = dublês({ row: linha({ is_deleted: true }) });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals((await res.json()).status, "negado");
  assertEquals(chamadas.fetch, 0);
});

Deno.test("negado — message_id inválido: 400, nenhuma leitura", async () => {
  const { ports, chamadas } = dublês();
  const res = await handleRecoverMessageMedia(pedido("não-é-uuid"), { authorize: AUTORIZADO, ports, now: new Date() });

  assertEquals(res.status, 400);
  assertEquals((await res.json()).status, "negado");
  assertEquals(chamadas.acesso, 0);
});

Deno.test("negado — sem autenticação (401 do authorize) vira o status do contrato", async () => {
  const { ports, chamadas } = dublês();
  const authorize: RecoverDeps["authorize"] = () => Promise.resolve(new Response("{}", { status: 401 }));
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize, ports, now: new Date() });

  assertEquals(res.status, 401);
  assertEquals((await res.json()).status, "negado");
  assertEquals(chamadas.acesso, 0);
});

// ── limite de 10 min por mensagem ─────────────────────────────────────────────

Deno.test("limite — carimbo de 1 min atrás bloqueia: indisponivel e a Evolução NÃO é chamada", async () => {
  const now = new Date("2026-10-11T12:00:00Z");
  const recente = new Date(now.getTime() - 60_000).toISOString();
  const { ports, chamadas } = dublês({ row: linha({ media_meta: { media_recovery_attempted_at: recente } }) });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now });

  assertEquals((await res.json()).status, "indisponivel");
  assertEquals(chamadas.fetch, 0, "não repete dentro do limite");
  assertEquals(chamadas.mark, 0);
});

Deno.test("limite — borda EXATA de 10 min permite a nova tentativa", async () => {
  const now = new Date("2026-10-11T12:00:00Z");
  const naBorda = new Date(now.getTime() - RECOVERY_COOLDOWN_MS).toISOString();
  const { ports, chamadas } = dublês({ row: linha({ media_meta: { media_recovery_attempted_at: naBorda } }) });
  const res = await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now });

  assertEquals((await res.json()).status, "ok");
  assertEquals(chamadas.fetch, 1);
});

Deno.test("limite — o carimbo mescla o media_meta existente sem apagar outras chaves", async () => {
  const { ports, carimbos } = dublês({
    row: linha({ media_meta: { outro_dado: "preservado", media_recovery_attempted_at: new Date(0).toISOString() } }),
  });
  await handleRecoverMessageMedia(pedido(MSG_ID), { authorize: AUTORIZADO, ports, now: new Date("2026-10-11T12:00:00Z") });

  assertEquals(carimbos[0].outro_dado, "preservado");
  assertEquals(carimbos[0].media_recovery_attempted_at, "2026-10-11T12:00:00.000Z");
});

// ── regras puras ──────────────────────────────────────────────────────────────

Deno.test("isPermanentStorageUrl distingue Storage de CDN do WhatsApp", () => {
  assert(isPermanentStorageUrl(URL_PERMANENTE));
  assertFalse(isPermanentStorageUrl("https://mmg.whatsapp.net/d/f/AbC.enc"));
  assertFalse(isPermanentStorageUrl(null));
});

Deno.test("classifyRecovery — ordem: apagada vence já-permanente; tipo vence tudo", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  assertEquals(classifyRecovery(linha({ is_deleted: true, media_url: URL_PERMANENTE }), now).status, "negado");
  assertEquals(classifyRecovery(linha({ message_type: "text" }), now).status, "negado");
  assertEquals(classifyRecovery(linha({ media_url: URL_PERMANENTE }), now).status, "ja_permanente");
  assertEquals(classifyRecovery(linha(), now).status, "ok");
});
