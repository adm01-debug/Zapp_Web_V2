// Cartão "CSAT automático sem executor" — contrato da Edge `csat-auto-send`.
//
// O defeito original: a config `csat_auto_config` existia na tela, mas nenhum
// processo enviava a pesquisa no encerramento ("CSAT automático sem executor").
// Estes testes chamam o HANDLER REAL com um `Request` e provam cada trava do
// cartão: config desligada, consentimento revogado, cooldown, idempotência por
// conversa e encerramento por atendente — sempre em modo fechado (nada é
// enfileirado quando a trava barra).
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/csat-auto-send/index.test.ts

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { requireAuth } from "../_shared/validation.ts";
import {
  CSAT_ENQUEUE_RPC,
  CSAT_TEMPLATE_TOKENS,
  handleCsatAutoSend,
  renderCsatTemplate,
  statusDoErroDeEnqueue,
  type ClienteDoChamador,
  type CsatAutoSendDeps,
  type ErroDb,
} from "./index.ts";

const URL_FUNCAO = "https://example.supabase.co/functions/v1/csat-auto-send";
const TOKEN = "Bearer token-do-atendente";
const CONTATO_ID = "11111111-1111-4111-8111-111111111111";
const ENCERRAMENTO_ID = "22222222-2222-4222-8222-222222222222";
const ENCERRAMENTO_ANTIGO_ID = "33333333-3333-4333-8333-333333333333";

type Linha = Record<string, unknown> | null;

interface OpcoesDoBanco {
  tabelas?: Record<string, Linha | Linha[]>;
  erroEm?: string | null;
  enqueueErro?: ErroDb | null;
  enqueueResultado?: unknown;
}

interface Registro {
  leituras: Array<{ tabela: string; op: string; coluna?: string; valor?: string }>;
  enqueues: Array<Record<string, unknown>>;
}

function novoRegistro(): Registro {
  return { leituras: [], enqueues: [] };
}

function linhasDe(tabela: string, o: OpcoesDoBanco): Linha[] {
  const valor = (o.tabelas ?? {})[tabela];
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function consultaFalsa(tabela: string, o: OpcoesDoBanco, r: Registro) {
  const filtros: Array<(linha: Record<string, unknown>) => boolean> = [];
  const resultado = () => {
    if (o.erroEm === tabela) {
      return { data: null, error: { message: "boom interno", code: "XX000" } };
    }
    const linhas = linhasDe(tabela, o)
      .filter((l): l is Record<string, unknown> => l !== null)
      .filter((l) => filtros.every((f) => f(l)));
    return { data: linhas, error: null };
  };
  const q = {
    select(colunas: string) {
      r.leituras.push({ tabela, op: "select", coluna: colunas });
      return q;
    },
    eq(coluna: string, valor: string) {
      r.leituras.push({ tabela, op: "eq", coluna, valor });
      filtros.push((l) => String(l[coluna]) === valor);
      return q;
    },
    neq(coluna: string, valor: string) {
      r.leituras.push({ tabela, op: "neq", coluna, valor });
      filtros.push((l) => String(l[coluna]) !== valor);
      return q;
    },
    gte(coluna: string, valor: string) {
      r.leituras.push({ tabela, op: "gte", coluna, valor });
      filtros.push((l) => String(l[coluna]) >= valor);
      return q;
    },
    order() {
      return q;
    },
    limit() {
      return q;
    },
    maybeSingle() {
      const { data, error } = resultado();
      return Promise.resolve({ data: error ? null : (data?.[0] ?? null), error });
    },
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resultado()).then(onFulfilled, onRejected);
    },
  };
  return q;
}

function clienteFalso(o: OpcoesDoBanco, r: Registro): ClienteDoChamador {
  const fake = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }) },
    from: (tabela: string) => consultaFalsa(tabela, o, r),
    rpc: (fn: string, args: Record<string, unknown>) => {
      assertEquals(fn, CSAT_ENQUEUE_RPC, "a unica porta de envio e a RPC canonica");
      r.enqueues.push(args);
      return Promise.resolve({
        data: o.enqueueResultado === undefined ? { id: "msg-1" } : o.enqueueResultado,
        error: o.enqueueErro ?? null,
      });
    },
  };
  return fake as unknown as ClienteDoChamador;
}

let seq = 0;
function deps(o: OpcoesDoBanco, r: Registro): CsatAutoSendDeps {
  const userId = `user-csat-${++seq}`;
  return {
    autorizar: (req) =>
      requireAuth(req, {
        getUser: (authHeader) =>
          Promise.resolve(
            authHeader === TOKEN
              ? { data: { user: { id: userId } }, error: null }
              : { data: { user: null }, error: { message: "token invalido" } },
          ),
        policyRpc: { rpc: () => Promise.resolve({ data: [{ allowed: true }], error: null }) },
      }),
    clienteDoChamador: () => clienteFalso(o, r),
  };
}

function pedido(
  opts: { metodo?: string; token?: string | null; corpo?: unknown; ip?: string } = {},
): Request {
  const token = opts.token === undefined ? TOKEN : opts.token;
  return new Request(URL_FUNCAO, {
    method: opts.metodo ?? "POST",
    headers: {
      "x-forwarded-for": opts.ip ?? `203.0.113.${seq + 1}`,
      ...(token ? { Authorization: token } : {}),
      ...(opts.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(opts.corpo !== undefined ? { body: JSON.stringify(opts.corpo) } : {}),
  });
}

const CONFIG_LIGADA = {
  id: "cfg-1",
  is_enabled: true,
  message_template: "Olá {name}! Avalie seu atendimento de 1 a 5.",
  whatsapp_connection_id: "44444444-4444-4444-8444-444444444444",
};

const CONTATO_RESOLVIDO = {
  id: CONTATO_ID,
  name: "João Silva",
  phone: "5531999999999",
  consent_status: "granted",
  conversation_status: "resolved",
  whatsapp_connection_id: null,
  queue_id: null,
};

const ENCERRAMENTO_DE_ATENDENTE = {
  id: ENCERRAMENTO_ID,
  contact_id: CONTATO_ID,
  closed_by: "55555555-5555-4555-8555-555555555555",
  created_at: new Date().toISOString(),
};

const ATENDENTE_ID = ENCERRAMENTO_DE_ATENDENTE.closed_by;
const FILA_ID = "66666666-6666-4666-8666-666666666666";

function casoFeliz(extra: OpcoesDoBanco = {}): OpcoesDoBanco {
  return {
    ...extra,
    tabelas: {
      csat_auto_config: CONFIG_LIGADA,
      contacts: CONTATO_RESOLVIDO,
      conversation_closures: [ENCERRAMENTO_DE_ATENDENTE],
      ...(extra.tabelas ?? {}),
    },
  };
}

Deno.test("render: troca apenas as variaveis documentadas", () => {
  assertEquals(CSAT_TEMPLATE_TOKENS.length, 3);
  assertEquals(
    renderCsatTemplate("Oi {name}, foi {agent} na fila {queue}. {desconhecida}", {
      name: "Ana",
      agent: "Rui",
      queue: "Vendas",
    }),
    "Oi Ana, foi Rui na fila Vendas. {desconhecida}",
  );
  assertEquals(renderCsatTemplate("Oi {name}", {}), "Oi ");
});

Deno.test("status do erro de enqueue: 403 so para 42501, 409 para conflito/payload", () => {
  assertEquals(statusDoErroDeEnqueue({ code: "42501" }), 403);
  assertEquals(statusDoErroDeEnqueue({ code: "23505" }), 409);
  assertEquals(statusDoErroDeEnqueue({ code: "22023" }), 409);
  assertEquals(statusDoErroDeEnqueue({ code: "XX000" }), 500);
  assertEquals(statusDoErroDeEnqueue(null), 500);
});

Deno.test("sem Authorization responde 401 e nao toca o banco", async () => {
  const registro = novoRegistro();

  const res = await handleCsatAutoSend(pedido({ token: null, corpo: { contact_id: CONTATO_ID } }), deps({}, registro));

  assertEquals(res.status, 401);
  assertEquals(registro.leituras, []);
  assertEquals(registro.enqueues, []);
});

Deno.test("metodo fora de POST responde 405", async () => {
  const registro = novoRegistro();

  const res = await handleCsatAutoSend(pedido({ metodo: "GET" }), deps({}, registro));

  assertEquals(res.status, 405);
  assertEquals(registro.enqueues, []);
});

Deno.test("contact_id ausente ou fora do formato uuid responde 400", async () => {
  const semContato = await handleCsatAutoSend(pedido({ corpo: {} }), deps({}, novoRegistro()));
  const contatoInvalido = await handleCsatAutoSend(
    pedido({ corpo: { contact_id: "nao-e-uuid" } }),
    deps({}, novoRegistro()),
  );

  assertEquals(semContato.status, 400);
  assertEquals(contatoInvalido.status, 400);
});

Deno.test("config desligada nao envia nada nem le o contato", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: { csat_auto_config: { ...CONFIG_LIGADA, is_enabled: false } },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "disabled");
  assertEquals(registro.enqueues, []);
  assertFalse(registro.leituras.some((l) => l.tabela === "contacts"), "config off nao deve ler contato");
});

Deno.test("consentimento revogado (LGPD) nao recebe pesquisa", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { contacts: { ...CONTATO_RESOLVIDO, consent_status: "revoked" } } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "consent_revoked");
  assertEquals(registro.enqueues, []);
});

Deno.test("contato que a RLS nao devolve responde 403 sem enfileirar", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { contacts: null } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));

  assertEquals(res.status, 403);
  assertEquals(registro.enqueues, []);
});

Deno.test("conversa nao encerrada (status != resolved) nao recebe pesquisa", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { contacts: { ...CONTATO_RESOLVIDO, conversation_status: "open" } } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "not_closed");
  assertEquals(registro.enqueues, []);
});

Deno.test("encerramento sem atendente (closed_by nulo) nao recebe pesquisa", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: { conversation_closures: [{ ...ENCERRAMENTO_DE_ATENDENTE, closed_by: null }] },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "not_closed_by_agent");
  assertEquals(registro.enqueues, []);
});

Deno.test("sem nenhum encerramento na janela nao recebe pesquisa", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { conversation_closures: [] } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "not_closed");
  assertEquals(registro.enqueues, []);
});

Deno.test("cooldown: outra conversa encerrada nos 30 dias barra o envio", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: {
      conversation_closures: [ENCERRAMENTO_DE_ATENDENTE, { ...ENCERRAMENTO_DE_ATENDENTE, id: ENCERRAMENTO_ANTIGO_ID }],
    },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "cooldown");
  assertEquals(registro.enqueues, []);
  const gte = registro.leituras.find((l) => l.tabela === "conversation_closures" && l.op === "gte");
  assertEquals(gte?.coluna, "created_at", "o cooldown tem de ser medido na janela de 30 dias");
  const neq = registro.leituras.find((l) => l.tabela === "conversation_closures" && l.op === "neq");
  assertEquals(neq?.coluna, "id", "o cooldown exclui a propria conversa por igualdade no banco, sem listar/cortar");
});

Deno.test("cooldown: resposta de CSAT recente barra novo convite", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: {
      csat_surveys: { id: "sur-1", contact_id: CONTATO_ID, created_at: new Date().toISOString() },
    },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "cooldown");
  assertEquals(registro.enqueues, []);
});

Deno.test("idempotencia: conversa ja convidada nao enfileira de novo", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: {
      messages: { id: "msg-existente", contact_id: CONTATO_ID, client_message_id: ENCERRAMENTO_ID },
    },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "already_sent");
  assertEquals(corpo.message_id, "msg-existente");
  assertEquals(registro.enqueues, [], "a segunda chamada da mesma conversa nao pode enfileirar");
  const dup = registro.leituras.find((l) => l.tabela === "messages" && l.op === "eq" && l.coluna === "client_message_id");
  assertEquals(dup?.valor, ENCERRAMENTO_ID, "a dedupe usa o id do encerramento como client_message_id");
});

Deno.test("sucesso: 1 pesquisa na fila canonica, com o id do encerramento como client_message_id", async () => {
  const registro = novoRegistro();
  const o = casoFeliz();

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo.sent, true);
  assertEquals(corpo.message_id, "msg-1");
  assertEquals(corpo.closure_id, ENCERRAMENTO_ID);
  assertEquals(registro.enqueues.length, 1, "exatamente UMA mensagem por conversa");
  const args = registro.enqueues[0];
  assertEquals(args.p_contact_id, CONTATO_ID);
  assertEquals(args.p_client_message_id, ENCERRAMENTO_ID);
  assertEquals(args.p_message_type, "text");
  assertEquals(args.p_content, "Olá João Silva! Avalie seu atendimento de 1 a 5.");
  assertEquals(args.p_whatsapp_connection_id, CONFIG_LIGADA.whatsapp_connection_id);
  assertEquals(args.p_media_url, null);
  assertEquals(args.p_caption, null);
});

Deno.test("modelo com {agent}/{queue} resolve os nomes e cai para vazio quando ilegivel", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: {
      csat_auto_config: { ...CONFIG_LIGADA, message_template: "Oi {name}, {agent} ({queue})" },
      contacts: { ...CONTATO_RESOLVIDO, queue_id: FILA_ID },
      profiles: { id: ATENDENTE_ID, name: "Rui" },
      queues: { id: FILA_ID, name: "Vendas" },
    },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));

  assertEquals(res.status, 200);
  assertEquals(registro.enqueues[0].p_content, "Oi João Silva, Rui (Vendas)");
});

Deno.test("modelo com {agent} sem nome legivel nao vaza token para o cliente", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: {
      csat_auto_config: { ...CONFIG_LIGADA, message_template: "Oi {name}, atendido por {agent}." },
      profiles: null,
    },
  });

  await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));

  assertEquals(registro.enqueues[0].p_content, "Oi João Silva, atendido por .");
});

Deno.test("contato sem telefone nao gera mensagem", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { contacts: { ...CONTATO_RESOLVIDO, phone: "  " } } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "no_phone");
  assertEquals(registro.enqueues, []);
});

Deno.test("closure_id pedido de outra conversa na janela tambem cai no cooldown", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: {
      conversation_closures: [
        { ...ENCERRAMENTO_DE_ATENDENTE, id: ENCERRAMENTO_ANTIGO_ID, created_at: new Date(Date.now() - 1000).toISOString() },
        ENCERRAMENTO_DE_ATENDENTE,
      ],
    },
  });

  const res = await handleCsatAutoSend(
    pedido({ corpo: { contact_id: CONTATO_ID, closure_id: ENCERRAMENTO_ID } }),
    deps(o, registro),
  );
  const corpo = await res.json();

  // O encerramento pedido e o atual; o outro e da MESMA janela -> cooldown barra.
  assertEquals(corpo.sent, false);
  assertEquals(corpo.reason, "cooldown");
  assertEquals(registro.enqueues, []);
});

Deno.test("closure_id fora do formato uuid responde 400", async () => {
  const res = await handleCsatAutoSend(
    pedido({ corpo: { contact_id: CONTATO_ID, closure_id: "abc" } }),
    deps(casoFeliz(), novoRegistro()),
  );

  assertEquals(res.status, 400);
});

Deno.test("RPC nega permissao/escopo (42501) com 403 generico, sem vazar regra", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ enqueueErro: { code: "42501", message: "send_messages_permission_required" } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const texto = await res.text();

  assertEquals(res.status, 403);
  assertFalse(texto.includes("send_messages"), "o corpo nao pode revelar a regra que negou");
  assertEquals(registro.enqueues.length, 1);
});

Deno.test("RPC com client_message_id ja usado e payload diferente (23505) responde 409", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    enqueueErro: { code: "23505", message: "client_message_id_reused_with_different_payload" },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));

  assertEquals(res.status, 409);
});

Deno.test("erro de leitura responde 500 sem vazar o detalhe do banco", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ erroEm: "contacts" });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const texto = await res.text();

  assertEquals(res.status, 500);
  assertFalse(texto.includes("boom interno"));
  assertEquals(registro.enqueues, []);
});

Deno.test("rate limit: acima do teto por usuario responde 429 sem enfileirar", async () => {
  const registro = novoRegistro();
  const d = deps(casoFeliz(), registro);

  for (let i = 0; i < 30; i++) {
    const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), d);
    assertEquals(res.status, 200);
  }
  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), d);

  assertEquals(res.status, 429);
  assertEquals(registro.enqueues.length, 30);
});

Deno.test("OPTIONS devolve preflight e nao toca o banco", async () => {
  const registro = novoRegistro();

  const res = await handleCsatAutoSend(pedido({ metodo: "OPTIONS", token: null }), deps({}, registro));

  assertEquals(res.status, 200);
  assertEquals(registro.enqueues, []);
});
