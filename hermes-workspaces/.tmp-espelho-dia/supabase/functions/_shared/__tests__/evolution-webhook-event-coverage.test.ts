/**
 * SL-149 — cobertura de webhook da Evolution ENUMERADA por evento.
 *
 * Lacuna do inventário (docs/EVOLUTION_API_GAPS_ANALYSIS.md, Sprint 4 · Testes e
 * Documentação): "Cobertura por evento nao enumerada". Existiam testes pontuais
 * (chamada, edição de mensagem, assinatura), mas nenhum lugar declarava QUAIS
 * eventos o roteador reconhece, para onde cada um vai e o que já está provado —
 * então um evento novo entrava no roteador sem que ninguém notasse que nasceu
 * sem prova, e o runbook não tinha como dizer o que já é coberto.
 *
 * Este arquivo É a enumeração, e ela é conferida em três frentes:
 *
 *   1) CONTRA O CÓDIGO — o conjunto de ramos do roteador real
 *      (supabase/functions/evolution-webhook/index.ts) tem de ser exatamente o
 *      conjunto enumerado em CASOS, e todo evento que a Evolution está
 *      configurada a enviar (WEBHOOK_EVENTS de _shared/evolution-sync-actions.ts)
 *      tem de normalizar para um evento enumerado. Ramo novo sem linha aqui =
 *      vermelho.
 *
 *   2) CONTRA O COMPORTAMENTO — cada evento enumerado atravessa o handler REAL
 *      (handleEvolutionWebhook) com um envelope mínimo e uma instância própria, e
 *      a prova declarada tem de bater: evento com handler toca o banco (um
 *      Supabase FALSO, em 127.0.0.1, registra cada requisição) e evento que só
 *      registra log não toca. Nenhum banco real, nenhuma rede fora de 127.0.0.1.
 *      Os nomes de evento enviados são os canônicos do roteador (dotted), que é o
 *      que `normalizeEventName` produz a partir do que a Evolution manda
 *      (maiúsculas do v2 e nomes da GO, como `message`/`calloffer`).
 *
 *   3) CONTRA O RUNBOOK — a tabela "Webhooks da Evolution — cobertura por evento"
 *      em docs/TROUBLESHOOTING.md lista exatamente os mesmos eventos.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/evolution-webhook-event-coverage.test.ts
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { handleEvolutionWebhook } from "../../evolution-webhook/index.ts";
import { invalidateConnectionCache, normalizeEventName } from "../evolution-helpers.ts";
import { WEBHOOK_EVENTS } from "../evolution-sync-actions.ts";

/** O que a passagem pelo handler real tem de provar para este evento. */
type Prova = "toca-banco" | "sem-acesso-banco";

interface CasoEvento {
  /** Nome canônico: é o que o roteador compara depois de `normalizeEventName`. */
  evento: string;
  /** Ramo do roteador: handler chamado (`log` = só registra em log). */
  rota: string;
  /** Prova comportamental esperada. */
  prova: Prova;
  /** `data` mínimo para o ramo real chegar ao primeiro acesso ao banco. */
  data: Record<string, unknown>;
}

/** JID sintético: número de exemplo, nunca de cliente. */
const JID = "5511988887777@s.whatsapp.net";
const GRUPO_JID = "120363000000000000@g.us";

/**
 * A ENUMERAÇÃO. Uma linha por ramo `event === '...'` do roteador — inclusive os
 * apelidos (`contacts.update` cai no mesmo handler de `contacts.upsert`;
 * `messages.edit` no de `messages.edited`; `group-participants.update` no de
 * `group.participants.update`).
 */
const CASOS: CasoEvento[] = [
  { evento: "connection.update", rota: "evolution-webhook-handlers.ts:handleConnectionUpdate", prova: "toca-banco", data: { status: "open" } },
  { evento: "qrcode.updated", rota: "evolution-webhook/index.ts (inline: grava qr_code/status na conexão)", prova: "toca-banco", data: {} },
  {
    evento: "messages.upsert",
    rota: "evolution-webhook-messages.ts:handleIncomingMessage (fromMe=false) ou handleOutgoingWhatsAppMessage (fromMe=true)",
    prova: "toca-banco",
    data: { messages: [{ key: { id: "MSG-SL149-1", remoteJid: JID, fromMe: false }, message: { conversation: "teste" } }] },
  },
  { evento: "send.message", rota: "evolution-webhook-msg-handlers.ts:handleSendMessage", prova: "toca-banco", data: {} },
  { evento: "messages.update", rota: "evolution-webhook-msg-handlers.ts:handleMessagesUpdate", prova: "toca-banco", data: {} },
  { evento: "messages.delete", rota: "evolution-webhook-msg-handlers.ts:handleMessagesDelete", prova: "toca-banco", data: {} },
  { evento: "contacts.upsert", rota: "evolution-webhook-handlers.ts:handleContactsUpsert", prova: "toca-banco", data: { id: JID, pushName: "Contato Sintético" } },
  { evento: "contacts.update", rota: "evolution-webhook-handlers.ts:handleContactsUpsert (mesmo ramo de contacts.upsert)", prova: "toca-banco", data: { id: JID, pushName: "Contato Sintético" } },
  { evento: "presence.update", rota: "evolution-webhook-handlers.ts:handlePresenceUpdate", prova: "toca-banco", data: { id: JID, presences: { "1": { lastKnownPresence: "composing" } } } },
  { evento: "chats.upsert", rota: "evolution-webhook-handlers.ts:handleChatsUpdate", prova: "toca-banco", data: { id: JID, unreadCount: 3 } },
  { evento: "chats.update", rota: "evolution-webhook-handlers.ts:handleChatsUpdate", prova: "toca-banco", data: { id: JID, unreadCount: 0 } },
  { evento: "groups.upsert", rota: "log (index.ts: id + subject)", prova: "sem-acesso-banco", data: { id: GRUPO_JID, subject: "Grupo Sintético" } },
  { evento: "group.update", rota: "log (index.ts: id + subject)", prova: "sem-acesso-banco", data: { id: GRUPO_JID, subject: "Grupo Sintético" } },
  { evento: "group.participants.update", rota: "log (index.ts: id + action + quantidade)", prova: "sem-acesso-banco", data: { id: GRUPO_JID, action: "add", participants: [] } },
  { evento: "group-participants.update", rota: "log (index.ts: mesmo ramo de group.participants.update)", prova: "sem-acesso-banco", data: { id: GRUPO_JID, action: "add", participants: [] } },
  { evento: "labels.edit", rota: "evolution-webhook-handlers.ts:handleLabelsEdit (RPC)", prova: "toca-banco", data: { id: "1", name: "Cliente VIP", deleted: false } },
  { evento: "labels.association", rota: "evolution-webhook-handlers.ts:handleLabelsAssociation (RPC por contato)", prova: "toca-banco", data: { labelId: "1", chatId: JID, type: "add" } },
  { evento: "call", rota: "evolution-webhook-handlers.ts:handleCallEvent", prova: "toca-banco", data: { from: JID, status: "offer", id: "CALL-SL149-1" } },
  { evento: "typebot.start", rota: "evolution-webhook-handlers.ts:handleTypebotEvent (sessão do bot: sem status vale como opened)", prova: "toca-banco", data: { remoteJid: JID, typebotId: "bot-sl149" } },
  { evento: "typebot.change.status", rota: "evolution-webhook-handlers.ts:handleTypebotEvent (mesmo ramo de typebot.start)", prova: "toca-banco", data: { remoteJid: JID, status: "opened" } },
  { evento: "chats.delete", rota: "evolution-webhook-handlers.ts:handleChatsDelete", prova: "toca-banco", data: { id: JID } },
  { evento: "application.startup", rota: "evolution-webhook-handlers.ts:handleApplicationStartup", prova: "toca-banco", data: {} },
  {
    evento: "messages.set",
    rota: "evolution-webhook-msg-handlers.ts:handleMessagesSet",
    prova: "toca-banco",
    data: { messages: [{ key: { id: "MSG-SL149-2", remoteJid: JID }, message: { conversation: "historico" } }] },
  },
  { evento: "contacts.set", rota: "evolution-webhook-handlers.ts:handleContactsSet", prova: "toca-banco", data: { contacts: [{ id: JID, name: "Contato Sintético" }] } },
  { evento: "chats.set", rota: "evolution-webhook-handlers.ts:handleChatsSet", prova: "toca-banco", data: { chats: [{ id: JID, unreadCount: 0 }] } },
  {
    evento: "messages.edited",
    rota: "evolution-webhook-msg-handlers.ts:handleMessagesEdited",
    prova: "toca-banco",
    data: { messages: [{ key: { id: "MSG-SL149-3" }, message: { conversation: "editada" } }] },
  },
  {
    evento: "messages.edit",
    rota: "evolution-webhook-msg-handlers.ts:handleMessagesEdited (mesmo ramo de messages.edited)",
    prova: "toca-banco",
    data: { messages: [{ key: { id: "MSG-SL149-4" }, message: { conversation: "editada" } }] },
  },
];

const EVENTOS_ENUMERADOS = CASOS.map((caso) => caso.evento);

const URL_ROTEADOR = new URL("../../evolution-webhook/index.ts", import.meta.url);
const URL_RUNBOOK = new URL("../../../../docs/TROUBLESHOOTING.md", import.meta.url);
const TESTE_DE_COBERTURA = "evolution-webhook-event-coverage.test.ts";
const TITULO_SECAO_RUNBOOK = "## 🔌 Webhooks da Evolution — cobertura por evento";

// ---------------------------------------------------------------------------
// 1) A enumeração bate com o código?
// ---------------------------------------------------------------------------

Deno.test("SL-149 enumeração: todo ramo do roteador real está enumerado (e nada além)", async () => {
  const fonte = await Deno.readTextFile(URL_ROTEADOR);
  const doRoteador = [...new Set([...fonte.matchAll(/event === '([^']+)'/g)].map((m) => m[1]))].sort();

  // Guarda contra um vermelho falso: regex quebrada devolveria [] e o teste
  // passaria "provando" que o roteador não tem evento nenhum.
  assert(doRoteador.length >= 20, `leitura do roteador suspeita: ${doRoteador.length} eventos encontrados`);
  assertEquals(new Set(EVENTOS_ENUMERADOS).size, EVENTOS_ENUMERADOS.length, "há evento repetido na enumeração");
  assertEquals(
    doRoteador,
    [...EVENTOS_ENUMERADOS].sort(),
    "ramo do roteador sem linha na enumeração (ou linha sem ramo): enumere o evento novo com a prova dele",
  );

  // O rótulo "rota" é documentação dentro do teste: aqui ele deixa de ser texto
  // solto — handler citado na enumeração tem de ser handler CHAMADO pelo roteador.
  // O nome tem de ser camelCase (`handle` + maiúscula): sem isso o sufixo do
  // arquivo `evolution-webhook-handlers.ts` casaria como um handler "handlers".
  const handlersCitados = new Set(
    CASOS.flatMap((caso) => [...caso.rota.matchAll(/handle[A-Z][A-Za-z]*/g)].map((m) => m[0])),
  );
  assert(handlersCitados.size >= 15, `os rótulos citam só ${handlersCitados.size} handlers — enumeração suspeita`);
  for (const nome of handlersCitados) {
    assert(fonte.includes(`${nome}(`), `a enumeração cita ${nome}, mas o roteador não chama esse handler`);
  }
});

Deno.test("SL-149 enumeração: todo evento que a Evolution está configurada a enviar está enumerado", () => {
  assert(WEBHOOK_EVENTS.length >= 18, `WEBHOOK_EVENTS lido com ${WEBHOOK_EVENTS.length} itens — lista vazia não prova nada`);
  const enumerados = new Set(EVENTOS_ENUMERADOS);
  for (const registrado of WEBHOOK_EVENTS) {
    const canonico = normalizeEventName(registrado);
    assert(
      enumerados.has(canonico),
      `'${registrado}' (registrado no provedor) normaliza para '${canonico}', que não está enumerado`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2) O runbook lista a mesma enumeração?
// ---------------------------------------------------------------------------

function eventosNoRunbook(markdown: string): string[] {
  const inicio = markdown.indexOf(TITULO_SECAO_RUNBOOK);
  assert(inicio >= 0, `seção "${TITULO_SECAO_RUNBOOK}" ausente de docs/TROUBLESHOOTING.md`);
  const linhas = markdown.slice(inicio).split("\n").slice(1);
  const eventos: string[] = [];
  for (const linha of linhas) {
    if (linha.startsWith("## ") || linha.trim() === "---") break;
    const celulas = linha.match(/^\|\s*`([a-z0-9.-]+)`\s*\|(.+)\|\s*$/);
    if (!celulas) continue;
    // A prova tem de apontar para ESTE teste: é o que liga a linha do runbook à
    // verificação, em vez de ser uma tabela de texto decorativo.
    assert(
      celulas[2].includes(TESTE_DE_COBERTURA),
      `a linha de '${celulas[1]}' no runbook não aponta a prova (${TESTE_DE_COBERTURA})`,
    );
    eventos.push(celulas[1]);
  }
  return eventos;
}

Deno.test("SL-149 runbook: a tabela de cobertura por evento é a mesma enumeração", async () => {
  const markdown = await Deno.readTextFile(URL_RUNBOOK);
  const noRunbook = eventosNoRunbook(markdown);
  assert(noRunbook.length >= 20, `tabela do runbook lida com ${noRunbook.length} linhas — leitura suspeita`);
  assertEquals(
    [...new Set(noRunbook)].sort(),
    [...EVENTOS_ENUMERADOS].sort(),
    "a tabela do runbook divergiu da enumeração (evento novo sem linha, ou linha de evento que não existe)",
  );
});

// ---------------------------------------------------------------------------
// 3) O roteador REAL despacha cada evento? (Supabase falso, sem banco real)
// ---------------------------------------------------------------------------

interface RequisicaoRegistrada {
  metodo: string;
  caminho: string;
}

function iniciarSupabaseFalso() {
  const requisicoes: RequisicaoRegistrada[] = [];
  const servidor = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen() {} }, async (req) => {
    const url = new URL(req.url);
    requisicoes.push({ metodo: req.method, caminho: `${url.pathname}${url.search}` });
    await req.body?.cancel();
    // PostgREST falso: leitura devolve `null` (nenhuma linha), escrita devolve
    // `[]`. Nenhuma linha é devolvida de propósito: os handlers resolvem a
    // conexão da instância como ausente e retornam cedo, sem caminho de mídia.
    const corpo = req.method === "GET" ? "null" : "[]";
    return new Response(corpo, { status: 200, headers: { "content-type": "application/json" } });
  });
  const porta = (servidor.addr as Deno.NetAddr).port;
  return {
    url: `http://127.0.0.1:${porta}`,
    requisicoes,
    parar: () => servidor.shutdown(),
  };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const anteriores = new Map<string, string | undefined>();
  for (const [chave, valor] of Object.entries(vars)) {
    anteriores.set(chave, Deno.env.get(chave));
    if (valor === undefined) Deno.env.delete(chave);
    else Deno.env.set(chave, valor);
  }
  return fn().finally(() => {
    for (const [chave, valor] of anteriores) {
      if (valor === undefined) Deno.env.delete(chave);
      else Deno.env.set(chave, valor);
    }
  });
}

Deno.test("SL-149 comportamento: cada evento enumerado é despachado pelo roteador real (e só os de log não tocam o banco)", async () => {
  const falso = iniciarSupabaseFalso();
  const token = "tok-sl149-do-teste";
  try {
    await withEnv(
      {
        SUPABASE_URL: falso.url,
        SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-local",
        EVOLUTION_INSTANCE_TOKEN: token,
        EVOLUTION_WEBHOOK_SECRET: undefined,
        WEBHOOK_SECRET: undefined,
        EVOLUTION_WEBHOOK_ENFORCE: undefined,
      },
      async () => {
        for (const [indice, caso] of CASOS.entries()) {
          invalidateConnectionCache();
          const antes = falso.requisicoes.length;
          const res = await handleEvolutionWebhook(
            new Request("http://localhost/functions/v1/evolution-webhook", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                event: caso.evento,
                // Instância própria por evento: o cache de conexão (5 min) não
                // pode fazer um evento herdar o resultado do anterior.
                instance: `INST-SL149-${indice}`,
                instanceToken: token,
                data: caso.data,
              }),
            }),
          );
          const depois = falso.requisicoes.length;

          assertEquals(res.status, 200, `${caso.evento}: roteador respondeu ${res.status}`);
          if (caso.prova === "toca-banco") {
            assert(
              depois > antes,
              `${caso.evento} não chegou ao handler (${caso.rota}): nenhuma requisição ao banco`,
            );
          } else {
            assertEquals(
              depois,
              antes,
              `${caso.evento} deveria só registrar log, mas tocou o banco (${caso.rota})`,
            );
          }
        }
      },
    );
  } finally {
    await falso.parar();
  }
});
