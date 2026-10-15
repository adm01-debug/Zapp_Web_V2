// Cartão t_a3d49435 — contrato da Edge `csat-dispatch` (o executor do convite).
//
// O defeito: a `csat-auto-send` GRAVAVA o convite agendado (`csat_surveys` com
// `status='scheduled'` e `send_at`) e ninguém o entregava — a pesquisa ficava
// presa para sempre. Esta Edge é o executor: o pg_cron a chama com
// `x-cron-secret`, ela reivindica o que já venceu (`claim_due_csat_surveys`, do
// PK-03) e entrega pelo pipeline OFICIAL de saída (INSERT idempotente em
// `messages` → `claim_outbound_message` → provedor → `complete_outbound_message`).
//
// Estes testes chamam o HANDLER REAL com um `Request` e provam, sem rede:
//  - a guarda de cron (sem header/segredo errado/segredo ausente no ambiente = 401,
//    ANTES de qualquer leitura; a service-role key também entra, para rodada manual);
//  - que um convite que ainda NÃO venceu nunca é reivindicado (quem filtra é a RPC);
//  - o caminho feliz: enfileira com `client_message_id` DERIVADO do convite,
//    claim com o worker e o lease certos, POST e `complete_outbound_message`;
//  - a idempotência: reprocessar o mesmo convite reaproveita a linha existente
//    (23505) e NÃO gera um segundo envio;
//  - falha do provedor/recibo ausente: `status='failed'` no convite, com motivo
//    no corpo e reconciliação enfileirada;
//  - falha de um item não derruba o lote (nem vira falha silenciosa);
//  - fail-closed: sem conexão conectada e sem perfil ativo o convite não sai;
//  - o convite já RESPONDIDO nunca é marcado como failed.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/csat-dispatch/index.test.ts

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  CRON_SECRET_HEADER,
  CSAT_CLAIM_RPC,
  CSAT_DISPATCH_LEASE_SECONDS,
  CSAT_DISPATCH_WORKER,
  csatClientMessageId,
  handleCsatDispatch,
  limiteDoLote,
  type CsatDispatchDeps,
} from "./index.ts";

const URL_FUNCAO = "https://example.supabase.co/functions/v1/csat-dispatch";
const SEGREDO = "segredo-do-cron";
const CHAVE_DE_SERVICO = "service-role-key";

const CONVITE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CONVITE_ID_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONTATO_ID = "11111111-1111-4111-8111-111111111111";
const ATENDENTE_ID = "55555555-5555-4555-8555-555555555555";
const CONEXAO_ID = "44444444-4444-4444-8444-444444444444";
const TELEFONE = "5531999999999";

type Linha = Record<string, unknown>;

interface Opcoes {
  lote?: Linha[];
  erroNoClaimDoLote?: { message: string; code: string } | null;
  contactConsultado?: Linha | null;
  conexoes?: Linha[];
  perfis?: Linha[];
  mensagemExistente?: Linha | null;
  erroDeInsert?: { message: string; code: string } | null;
  claimDeMensagem?: Linha | null;
  erroNoClaimDaMensagem?: { message: string; code: string } | null;
  completoDeMensagem?: Linha[] | null;
  erroNoComplete?: { message: string; code: string } | null;
  erroDeUpdate?: { message: string; code: string } | null;
  configCsat?: Linha | null;
  respostaDoProvedor?: Response;
  limite?: string;
  conviteJaRespondido?: boolean;
}

interface Registro {
  rpcs: Array<{ nome: string; args: Linha }>;
  insercoes: Array<{ tabela: string; valores: Linha }>;
  updates: Array<{ tabela: string; valores: Linha; filtros: Array<[string, unknown]> }>;
  posts: Array<{ instancia: string; telefone: string; texto: string; token: string | null }>;
  reconciliacoes: Array<{ messageId: string; externalId: string | null }>;
}

function novoRegistro(): Registro {
  return { rpcs: [], insercoes: [], updates: [], posts: [], reconciliacoes: [] };
}

const CONVITE = {
  id: CONVITE_ID,
  contact_id: CONTATO_ID,
  agent_id: ATENDENTE_ID,
  phone: TELEFONE,
  message_text: "Avalie seu atendimento de 1 a 5.",
  send_at: "2026-10-15T12:00:00.000Z",
  conversation_id: "22222222-2222-4222-8222-222222222222",
};

const CONEXAO = { id: CONEXAO_ID, created_by: ATENDENTE_ID, instance_id: "inst-1", status: "connected" };
const PERFIL_ATIVO = { id: ATENDENTE_ID, is_active: true };

function consultaFalsa(tabela: string, o: Opcoes, r: Registro, tabelas: Record<string, Linha[]>) {
  const filtros: Array<(linha: Linha) => boolean> = [];
  let inserindo: Linha | null = null;
  let alterando: Linha | null = null;
  let registroDoUpdate: { tabela: string; valores: Linha; filtros: Array<[string, unknown]> } | null = null;

  const resultado = () => {
    if (inserindo) {
      if (o.erroDeInsert && tabela === "messages") return { data: null, error: o.erroDeInsert };
      const id = `msg-${r.insercoes.length}`;
      tabelas.messages.push({ ...inserindo, id });
      return { data: [{ id }], error: null };
    }
    if (alterando) {
      if (o.erroDeUpdate && tabela === "csat_surveys") return { data: null, error: o.erroDeUpdate };
      for (const linha of tabelas[tabela] ?? []) {
        if (filtros.every((f) => f(linha))) Object.assign(linha, alterando);
      }
      return { data: null, error: null };
    }
    return { data: (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l))), error: null };
  };

  const q = {
    select() {
      return q;
    },
    insert(valores: Linha) {
      r.insercoes.push({ tabela, valores });
      inserindo = valores;
      return q;
    },
    update(valores: Linha) {
      alterando = valores;
      registroDoUpdate = { tabela, valores, filtros: [] };
      r.updates.push(registroDoUpdate);
      return q;
    },
    eq(coluna: string, valor: unknown) {
      registroDoUpdate?.filtros.push([coluna, valor]);
      filtros.push((l) => String(l[coluna]) === String(valor));
      return q;
    },
    in(coluna: string, valores: unknown[]) {
      filtros.push((l) => valores.map(String).includes(String(l[coluna])));
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

function clienteFalso(o: Opcoes, r: Registro) {
  const tabelas: Record<string, Linha[]> = {
    contacts: o.contactConsultado === undefined
      ? [{ id: CONTATO_ID, whatsapp_connection_id: CONEXAO_ID }]
      : (o.contactConsultado === null ? [] : [o.contactConsultado]),
    whatsapp_connections: o.conexoes ?? [CONEXAO],
    profiles: o.perfis ?? [PERFIL_ATIVO],
    messages: o.mensagemExistente ? [o.mensagemExistente] : [],
    csat_auto_config: o.configCsat ? [o.configCsat] : [],
    csat_surveys: [{
      id: CONVITE_ID,
      status: o.conviteJaRespondido ? "responded" : "sent",
      context: "teste",
    }],
  };

  return {
    from: (tabela: string) => consultaFalsa(tabela, o, r, tabelas),
    rpc: (nome: string, args: Linha) => {
      r.rpcs.push({ nome, args });
      if (nome === CSAT_CLAIM_RPC) return Promise.resolve({ data: o.lote ?? [], error: o.erroNoClaimDoLote ?? null });
      if (nome === "claim_outbound_message") {
        return Promise.resolve({
          data: o.claimDeMensagem === undefined
            ? [{ claim_token: "tok-1", whatsapp_instance_name: "inst-1", contact_phone: TELEFONE, content: "x" }]
            : o.claimDeMensagem,
          error: o.erroNoClaimDaMensagem ?? null,
        });
      }
      if (nome === "complete_outbound_message") {
        return Promise.resolve({
          data: o.completoDeMensagem === undefined ? [{ id: args.p_message_id }] : o.completoDeMensagem,
          error: o.erroNoComplete ?? null,
        });
      }
      if (nome === "fail_outbound_message") return Promise.resolve({ data: null, error: null });
      throw new Error(`RPC inesperada no teste: ${nome}`);
    },
  };
}

function deps(o: Opcoes, r: Registro): CsatDispatchDeps {
  const ambiente: Record<string, string> = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: CHAVE_DE_SERVICO,
    CRON_SECRET: SEGREDO,
    EVOLUTION_API_URL: "https://evo.example/",
    EVOLUTION_API_KEY: "evo-key",
  };
  if (o.limite !== undefined) ambiente.CSAT_DISPATCH_LIMIT = o.limite;
  if (o.limite === "sem-evolution") delete ambiente.EVOLUTION_API_URL;

  return {
    supabase: clienteFalso(o, r),
    env: (chave: string) => ambiente[chave],
    agora: () => Date.parse("2026-10-15T12:00:00.000Z"),
    enviarTexto: (p) => {
      r.posts.push({ instancia: p.instancia, telefone: p.telefone, texto: p.texto, token: p.instanceToken });
      return Promise.resolve(o.respostaDoProvedor ?? new Response(JSON.stringify({ key: { id: "wamid.ok" } }), { status: 200 }));
    },
    resolverToken: () => Promise.resolve("token-da-instancia"),
    enfileirarReconciliacao: ({ messageId, externalId }) => {
      r.reconciliacoes.push({ messageId, externalId });
      return Promise.resolve();
    },
  };
}

function pedido(opts: { metodo?: string; segredo?: string | null; bearer?: string | null } = {}): Request {
  const segredo = opts.segredo === undefined ? SEGREDO : opts.segredo;
  return new Request(URL_FUNCAO, {
    method: opts.metodo ?? "POST",
    headers: {
      ...(segredo !== null ? { [CRON_SECRET_HEADER]: segredo } : {}),
      ...(opts.bearer ? { Authorization: `Bearer ${opts.bearer}` } : {}),
    },
  });
}

Deno.test("client_message_id: derivado do convite, UUID e nunca igual entre convites", () => {
  const a = csatClientMessageId(CONVITE_ID);
  const b = csatClientMessageId(CONVITE_ID);
  const c = csatClientMessageId(CONVITE_ID_2);

  assertEquals(a, b, "o id tem de ser deterministico: a dedupe e do banco, nao do sorteio");
  assert(a !== c, "convites diferentes nao podem compartilhar o mesmo id");
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/.test(a), `nao parece UUID v4: ${a}`);
});

Deno.test("limite do lote: default, valor do env e teto da RPC", () => {
  assertEquals(limiteDoLote(undefined), 50);
  assertEquals(limiteDoLote("7"), 7);
  assertEquals(limiteDoLote("200"), 200);
  assertEquals(limiteDoLote("500"), 200, "a RPC apara em 200; pedir mais so gastaria um round-trip");
  assertEquals(limiteDoLote("0"), 50);
  assertEquals(limiteDoLote("abc"), 50);
});

Deno.test("metodo fora de POST responde 405", async () => {
  const registro = novoRegistro();
  const res = await handleCsatDispatch(pedido({ metodo: "GET" }), deps({}, registro));

  assertEquals(res.status, 405);
  assertEquals(registro.rpcs, []);
});

Deno.test("sem x-cron-secret responde 401 e nao reivindica nada", async () => {
  const registro = novoRegistro();
  const res = await handleCsatDispatch(pedido({ segredo: null }), deps({}, registro));

  assertEquals(res.status, 401);
  assertEquals(registro.rpcs, [], "nada pode ser reivindicado antes da autorizacao");
  assertEquals(registro.insercoes, []);
});

Deno.test("segredo errado responde 401", async () => {
  const registro = novoRegistro();
  const res = await handleCsatDispatch(pedido({ segredo: "chute" }), deps({}, registro));

  assertEquals(res.status, 401);
  assertEquals(registro.rpcs, []);
});

Deno.test("CRON_SECRET ausente no ambiente nao habilita o cron (fail-closed)", async () => {
  const registro = novoRegistro();
  const d = deps({}, registro);
  d.env = () => undefined; // ambiente sem CRON_SECRET

  const res = await handleCsatDispatch(pedido({ segredo: SEGREDO }), d);

  assertEquals(res.status, 401);
  assertEquals(registro.rpcs, []);
});

Deno.test("service-role key no Bearer autoriza a rodada manual", async () => {
  const registro = novoRegistro();
  const res = await handleCsatDispatch(pedido({ segredo: null, bearer: CHAVE_DE_SERVICO }), deps({}, registro));

  assertEquals(res.status, 200);
  assertEquals(registro.rpcs[0]?.nome, CSAT_CLAIM_RPC);
});

Deno.test("sem EVOLUTION_API_URL responde 503 e nao reivindica convite", async () => {
  const registro = novoRegistro();
  const d = deps({ lote: [CONVITE], limite: "sem-evolution" }, registro);

  const res = await handleCsatDispatch(pedido(), d);

  assertEquals(res.status, 503);
  assertEquals(registro.rpcs, [], "convite reivindicado sem provedor ficaria preso em 'sent'");
});

Deno.test("lote vazio responde 200 com zeros e nao escreve nada", async () => {
  const registro = novoRegistro();
  const res = await handleCsatDispatch(pedido(), deps({ lote: [] }, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo, { ok: true, claimed: 0, sent: 0, failed: 0, pending: 0, failures: [] });
  assertEquals(registro.insercoes, []);
});

Deno.test("limite do env chega na RPC (o pg_cron escolhe o tamanho da passada)", async () => {
  const registro = novoRegistro();
  await handleCsatDispatch(pedido(), deps({ lote: [], limite: "7" }, registro));

  assertEquals(registro.rpcs[0].nome, CSAT_CLAIM_RPC);
  assertEquals(registro.rpcs[0].args, { p_limit: 7 });
});

Deno.test("caminho feliz: enfileira com id derivado, claim oficial e complete com o recibo", async () => {
  const registro = novoRegistro();
  const res = await handleCsatDispatch(pedido(), deps({ lote: [CONVITE] }, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo.claimed, 1);
  assertEquals(corpo.sent, 1);
  assertEquals(corpo.failed, 0);
  assertEquals(corpo.failures, []);
  assertEquals(corpo.pending, 0);

  const enfileirada = registro.insercoes.find((i) => i.tabela === "messages");
  assertEquals(enfileirada?.valores.client_message_id, csatClientMessageId(CONVITE_ID));
  assertEquals(enfileirada?.valores.contact_id, CONTATO_ID);
  assertEquals(enfileirada?.valores.whatsapp_connection_id, CONEXAO_ID);
  assertEquals(enfileirada?.valores.agent_id, ATENDENTE_ID);
  assertEquals(enfileirada?.valores.sender, "agent");
  assertEquals(enfileirada?.valores.status, "sending");
  assertEquals(enfileirada?.valores.content, CONVITE.message_text);

  const claim = registro.rpcs.find((x) => x.nome === "claim_outbound_message");
  assertEquals(claim?.args.p_worker, CSAT_DISPATCH_WORKER, "o claim precisa identificar este produtor");
  assertEquals(claim?.args.p_lease_seconds, CSAT_DISPATCH_LEASE_SECONDS);
  assertEquals(claim?.args.p_agent_id, ATENDENTE_ID);

  assertEquals(registro.posts.length, 1);
  assertEquals(registro.posts[0].instancia, "inst-1");
  assertEquals(registro.posts[0].telefone, TELEFONE);
  assertEquals(registro.posts[0].texto, CONVITE.message_text);
  assertEquals(registro.posts[0].token, "token-da-instancia");

  const complete = registro.rpcs.find((x) => x.nome === "complete_outbound_message");
  assertEquals(complete?.args.p_external_id, "wamid.ok");
  assertEquals(complete?.args.p_delivery_status, "sent");
  assertEquals(complete?.args.p_claim_token, "tok-1");
  assertEquals(registro.reconciliacoes, []);
  assertEquals(
    registro.updates.filter((u) => u.tabela === "csat_surveys"),
    [],
    "convite entregue nao muda de status",
  );
});

Deno.test("idempotencia: linha ja enfileirada (23505) e reaproveitada e nao sai 2o envio", async () => {
  const registro = novoRegistro();
  const o: Opcoes = {
    lote: [CONVITE],
    erroDeInsert: { code: "23505", message: "duplicate key value violates unique constraint" },
    mensagemExistente: { id: "msg-existente", client_message_id: csatClientMessageId(CONVITE_ID) },
    // O pipeline ja entregou a mensagem: nao ha linha claimavel.
    claimDeMensagem: null,
  };

  const res = await handleCsatDispatch(pedido(), deps(o, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo.sent, 0);
  assertEquals(corpo.failed, 0);
  assertEquals(corpo.pending, 1, "mensagem em andamento nao e falha definitiva do convite");
  assertEquals(registro.posts, [], "o mesmo convite NUNCA sai duas vezes");
  assertEquals(
    registro.rpcs.find((x) => x.nome === "claim_outbound_message")?.args.p_message_id,
    "msg-existente",
    "a recuperacao usa a linha existente, nao cria outra",
  );
});

Deno.test("provedor 500: convite vira failed com motivo, claim falha e reconciliacao entra", async () => {
  const registro = novoRegistro();
  const o: Opcoes = {
    lote: [CONVITE],
    respostaDoProvedor: new Response("upstream indisponivel", { status: 500 }),
  };

  const res = await handleCsatDispatch(pedido(), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.sent, 0);
  assertEquals(corpo.failed, 1);
  assertEquals(corpo.failures[0].survey_id, CONVITE_ID);
  assertEquals(corpo.failures[0].motivo, "provedor_500");
  assert(registro.rpcs.some((x) => x.nome === "fail_outbound_message"), "a linha claimada tem de ser fechada");
  assertEquals(registro.reconciliacoes.length, 1, "5xx e efeito incerto: entra a reconciliacao somente-leitura");

  const update = registro.updates.find((u) => u.tabela === "csat_surveys");
  assertEquals(update?.valores, { status: "failed" });
  assertEquals(update?.filtros, [["id", CONVITE_ID], ["status", "sent"]], "so sai de 'sent' para 'failed'");
});

Deno.test("recibo ausente (200 sem id): efeito indeterminado vira failed e reconciliacao", async () => {
  const registro = novoRegistro();
  const o: Opcoes = {
    lote: [CONVITE],
    respostaDoProvedor: new Response(JSON.stringify({ status: "PENDING" }), { status: 200 }),
  };

  const res = await handleCsatDispatch(pedido(), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.failures[0].motivo, "recibo_ausente");
  assertEquals(registro.posts.length, 1, "nunca reenvia para 'descobrir' se saiu");
  assertEquals(registro.reconciliacoes.length, 1);
  assertEquals(registro.updates.find((u) => u.tabela === "csat_surveys")?.valores, { status: "failed" });
});

Deno.test("complete sem persistir o recibo: failed, sem reenvio, com reconciliacao", async () => {
  const registro = novoRegistro();
  const o: Opcoes = { lote: [CONVITE], completoDeMensagem: null };

  const res = await handleCsatDispatch(pedido(), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.failures[0].motivo, "recibo_nao_persistido");
  assertEquals(registro.posts.length, 1);
  assertEquals(registro.reconciliacoes.length, 1);
  assert(registro.rpcs.some((x) => x.nome === "fail_outbound_message"));
});

Deno.test("sem conexao conectada: convite failed e nada vai ao provedor", async () => {
  const registro = novoRegistro();
  const o: Opcoes = { lote: [CONVITE], conexoes: [] };

  const res = await handleCsatDispatch(pedido(), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.failures[0].motivo, "sem_conexao_conectada");
  assertEquals(registro.posts, []);
  assertEquals(registro.insercoes, [], "sem conexao nao se enfileira uma mensagem orfa");
  assertEquals(registro.updates.find((u) => u.tabela === "csat_surveys")?.valores, { status: "failed" });
});

Deno.test("sem atendente com perfil ativo: convite failed (fail-closed, nao se empresta perfil)", async () => {
  const registro = novoRegistro();
  const o: Opcoes = { lote: [CONVITE], perfis: [] };

  const res = await handleCsatDispatch(pedido(), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.failures[0].motivo, "sem_atendente_ativo");
  assertEquals(registro.posts, []);
  assertEquals(registro.insercoes, []);
});

Deno.test("convite ja RESPONDIDO nunca e marcado como failed", async () => {
  const registro = novoRegistro();
  const o: Opcoes = {
    lote: [{ ...CONVITE, phone: null }], // sem telefone: caminho que marca falha
    conviteJaRespondido: true,
  };

  const res = await handleCsatDispatch(pedido(), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.failures[0].motivo, "sem_telefone");
  // O UPDATE e escopado a status='sent': a linha 'responded' do banco falso nao muda.
  const marcados = registro.updates.filter((u) => u.tabela === "csat_surveys");
  assertEquals(marcados.length, 1, "tenta marcar, mas o filtro de status protege o respondido");
  assertEquals(marcados[0].filtros, [["id", CONVITE_ID], ["status", "sent"]]);
});

Deno.test("falha de um convite nao derruba o lote: o seguinte sai normalmente", async () => {
  const registro = novoRegistro();
  const o: Opcoes = {
    lote: [{ ...CONVITE, phone: "   " }, { ...CONVITE, id: CONVITE_ID_2 }],
  };

  const res = await handleCsatDispatch(pedido(), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.claimed, 2);
  assertEquals(corpo.failed, 1);
  assertEquals(corpo.sent, 1);
  assertEquals(corpo.failures[0].motivo, "sem_telefone");
  assertEquals(registro.posts.length, 1, "o convite bom nao pode ser punido pelo vizinho");
  assertEquals(registro.insercoes[0].valores.client_message_id, csatClientMessageId(CONVITE_ID_2));
});

const CONEXAO_ID_2 = "66666666-6666-4666-8666-666666666666";
const CONEXAO_2 = { id: CONEXAO_ID_2, created_by: ATENDENTE_ID, instance_id: "inst-2", status: "connected" };

Deno.test("conexao escolhida na config de CSAT manda; a do contato e reserva", async () => {
  const registro = novoRegistro();
  const o: Opcoes = {
    lote: [CONVITE],
    conexoes: [CONEXAO, CONEXAO_2],
    configCsat: { whatsapp_connection_id: CONEXAO_ID_2 },
  };

  await handleCsatDispatch(pedido(), deps(o, registro));

  // A instância do POST vem do claim (semântica do pipeline de mensagens); a
  // escolha da conexão se prova pela LINHA enfileirada.
  assertEquals(registro.insercoes[0].valores.whatsapp_connection_id, CONEXAO_ID_2);
  assertEquals(registro.posts.length, 1);
});

Deno.test("conexao da config fora do ar cai para a do contato (nao perde o convite)", async () => {
  const registro = novoRegistro();
  const o: Opcoes = {
    lote: [CONVITE],
    conexoes: [CONEXAO, { ...CONEXAO_2, status: "disconnected" }],
    configCsat: { whatsapp_connection_id: CONEXAO_ID_2 },
  };

  await handleCsatDispatch(pedido(), deps(o, registro));

  assertEquals(registro.insercoes[0].valores.whatsapp_connection_id, CONEXAO_ID);
  assertEquals(registro.posts.length, 1);
});

Deno.test("corpo da resposta nao carrega telefone nem texto do convite", async () => {
  const registro = novoRegistro();
  const o: Opcoes = { lote: [{ ...CONVITE, phone: null }] };

  const res = await handleCsatDispatch(pedido(), deps(o, registro));
  const texto = await res.text();

  assertFalse(texto.includes(TELEFONE), "telefone do contato nao sai no corpo");
  assertFalse(texto.includes("Avalie seu atendimento"), "o texto do convite nao sai no corpo");
});
