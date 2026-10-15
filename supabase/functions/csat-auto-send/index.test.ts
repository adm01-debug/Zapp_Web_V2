// Cartão "CSAT automático sem executor" + continuação (t_a3d49435) — contrato da
// Edge `csat-auto-send` no modo AGENDADO.
//
// O defeito original: a config `csat_auto_config` existia na tela, mas nenhum
// processo enviava a pesquisa no encerramento ("CSAT automático sem executor").
// Depois, o defeito desta continuação: a Edge enfileirava o convite NA HORA,
// ignorando o `delay_minutes` da config — o operador pedia "avaliar em 30 min" e
// a mensagem saía junto com o encerramento.
//
// Agora o encerramento só GRAVA o convite agendado (`csat_surveys` com
// `status='scheduled'` e `send_at = agora + delay_minutes`); quem entrega é a
// Edge `csat-dispatch`. Estes testes chamam o HANDLER REAL com um `Request` e
// provam cada trava: config desligada, consentimento revogado, cooldown por
// contato, atraso respeitado, idempotência por CONVERSA feita pelo índice único
// (23505, nunca por SELECT prévio) e encerramento por atendente — sempre em modo
// fechado (nada é gravado quando a trava barra).
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/csat-auto-send/index.test.ts

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { requireAuth } from "../_shared/validation.ts";
import {
  CSAT_COOLDOWN_STATUSES,
  CSAT_MAX_DELAY_MINUTES,
  CSAT_SURVEY_TABLE,
  CSAT_TEMPLATE_TOKENS,
  calcularEnvioEm,
  handleCsatAutoSend,
  renderCsatTemplate,
  statusDoErroDeAgendamento,
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
  erroDeInsert?: ErroDb | null;
  erroDeUpdate?: ErroDb | null;
  idDoConvite?: string;
}

interface Registro {
  leituras: Array<{ tabela: string; op: string; coluna?: string; valor?: unknown }>;
  insercoes: Array<{ tabela: string; valores: Record<string, unknown> }>;
  updates: Array<{ tabela: string; valores: Record<string, unknown> }>;
  rpcs: Array<{ nome: string; args: Record<string, unknown> }>;
}

function novoRegistro(): Registro {
  return { leituras: [], insercoes: [], updates: [], rpcs: [] };
}

function linhasDe(tabela: string, o: OpcoesDoBanco): Linha[] {
  const valor = (o.tabelas ?? {})[tabela];
  if (valor === undefined || valor === null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

function consultaFalsa(tabela: string, o: OpcoesDoBanco, r: Registro) {
  const filtros: Array<(linha: Record<string, unknown>) => boolean> = [];
  let inserindo: Record<string, unknown> | null = null;
  let alterando: Record<string, unknown> | null = null;

  const resultado = () => {
    if (o.erroEm === tabela) {
      return { data: null, error: { message: "boom interno", code: "XX000" } };
    }
    if (inserindo) {
      if (o.erroDeInsert) return { data: null, error: o.erroDeInsert };
      return { data: [{ id: o.idDoConvite ?? "sur-1" }], error: null };
    }
    if (alterando) {
      if (o.erroDeUpdate) return { data: null, error: o.erroDeUpdate };
      // Aplica de verdade nas linhas do banco falso: é assim que o teste vê
      // `csat_surveys.status` mudar (ou não) depois da chamada.
      for (const linha of linhasDe(tabela, o)) {
        if (linha && filtros.every((f) => f(linha))) Object.assign(linha, alterando);
      }
      return { data: null, error: null };
    }
    return {
      data: linhasDe(tabela, o).filter((l): l is Record<string, unknown> => l !== null).filter((l) => filtros.every((f) => f(l))),
      error: null,
    };
  };

  const q = {
    select(colunas: string) {
      r.leituras.push({ tabela, op: "select", coluna: colunas });
      return q;
    },
    insert(valores: Record<string, unknown>) {
      r.insercoes.push({ tabela, valores });
      inserindo = valores;
      return q;
    },
    update(valores: Record<string, unknown>) {
      r.updates.push({ tabela, valores });
      alterando = valores;
      return q;
    },
    eq(coluna: string, valor: unknown) {
      r.leituras.push({ tabela, op: "eq", coluna, valor });
      filtros.push((l) => String(l[coluna]) === String(valor));
      return q;
    },
    neq(coluna: string, valor: string) {
      r.leituras.push({ tabela, op: "neq", coluna, valor });
      filtros.push((l) => String(l[coluna]) !== valor);
      return q;
    },
    in(coluna: string, valores: unknown[]) {
      r.leituras.push({ tabela, op: "in", coluna, valor: valores });
      filtros.push((l) => valores.map(String).includes(String(l[coluna])));
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
    // Nenhuma RPC de fila: o agendamento NÃO enfileira. Se algum caminho voltar
    // a chamar a fila, aparece aqui e o teste acusa.
    rpc: (nome: string, args: Record<string, unknown>) => {
      r.rpcs.push({ nome, args });
      return Promise.resolve({ data: null, error: null });
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
  delay_minutes: 0,
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

Deno.test("status do erro do agendamento: 403 so para 42501, 500 para o resto", () => {
  assertEquals(statusDoErroDeAgendamento({ code: "42501" }), 403);
  assertEquals(statusDoErroDeAgendamento({ code: "23505" }), 500);
  assertEquals(statusDoErroDeAgendamento({ code: "XX000" }), 500);
  assertEquals(statusDoErroDeAgendamento(null), 500);
});

Deno.test("atraso: 0 minuto sai agora; negativo/invalido cai para agora; teto de 30 dias", () => {
  const agora = Date.parse("2026-10-15T12:00:00.000Z");
  assertEquals(calcularEnvioEm(0, agora), "2026-10-15T12:00:00.000Z");
  assertEquals(calcularEnvioEm(45, agora), "2026-10-15T12:45:00.000Z");
  assertEquals(calcularEnvioEm(-30, agora), "2026-10-15T12:00:00.000Z");
  assertEquals(calcularEnvioEm(undefined, agora), "2026-10-15T12:00:00.000Z");
  assertEquals(calcularEnvioEm(Number.NaN, agora), "2026-10-15T12:00:00.000Z");
  assertEquals(
    calcularEnvioEm(999999, agora),
    new Date(agora + CSAT_MAX_DELAY_MINUTES * 60_000).toISOString(),
    "atraso absurdo nao pode empurrar o convite para o infinito",
  );
});

Deno.test("sem Authorization responde 401 e nao toca o banco", async () => {
  const registro = novoRegistro();

  const res = await handleCsatAutoSend(pedido({ token: null, corpo: { contact_id: CONTATO_ID } }), deps({}, registro));

  assertEquals(res.status, 401);
  assertEquals(registro.leituras, []);
  assertEquals(registro.insercoes, []);
});

Deno.test("metodo fora de POST responde 405", async () => {
  const registro = novoRegistro();

  const res = await handleCsatAutoSend(pedido({ metodo: "GET" }), deps({}, registro));

  assertEquals(res.status, 405);
  assertEquals(registro.insercoes, []);
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

Deno.test("config desligada nao agenda nada nem le o contato", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: { csat_auto_config: { ...CONFIG_LIGADA, is_enabled: false } },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "disabled");
  assertEquals(registro.insercoes, []);
  assertFalse(registro.leituras.some((l) => l.tabela === "contacts"), "config off nao deve ler contato");
});

Deno.test("consentimento revogado (LGPD) nao recebe pesquisa", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { contacts: { ...CONTATO_RESOLVIDO, consent_status: "revoked" } } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "consent_revoked");
  assertEquals(registro.insercoes, []);
});

Deno.test("contato que a RLS nao devolve responde 403 sem agendar", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { contacts: null } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));

  assertEquals(res.status, 403);
  assertEquals(registro.insercoes, []);
});

Deno.test("conversa nao encerrada (status != resolved) nao recebe pesquisa", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { contacts: { ...CONTATO_RESOLVIDO, conversation_status: "open" } } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "not_closed");
  assertEquals(registro.insercoes, []);
});

Deno.test("encerramento sem atendente (closed_by nulo) nao recebe pesquisa", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: { conversation_closures: [{ ...ENCERRAMENTO_DE_ATENDENTE, closed_by: null }] },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "not_closed_by_agent");
  assertEquals(registro.insercoes, []);
});

Deno.test("sem nenhum encerramento na janela nao recebe pesquisa", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { conversation_closures: [] } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "not_closed");
  assertEquals(registro.insercoes, []);
});

Deno.test("cooldown: convite PENDENTE de outra conversa barra (o indice unico e por conversa)", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: {
      csat_surveys: {
        id: "sur-antigo",
        contact_id: CONTATO_ID,
        conversation_id: "99999999-9999-4999-8999-999999999999",
        status: "scheduled",
        created_at: new Date().toISOString(),
      },
    },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "cooldown");
  assertEquals(registro.insercoes, []);
  const noStatus = registro.leituras.find((l) => l.tabela === CSAT_SURVEY_TABLE && l.op === "in");
  assertEquals(noStatus?.coluna, "status", "o cooldown tem de olhar o status do convite");
  assertEquals(noStatus?.valor, [...CSAT_COOLDOWN_STATUSES], "e o pendente TEM de contar");
  const janela = registro.leituras.find((l) => l.tabela === CSAT_SURVEY_TABLE && l.op === "gte");
  assertEquals(janela?.coluna, "created_at", "o cooldown tem de ser medido na janela de 30 dias");
});

Deno.test("cooldown: convite RESPONDIDO nos 30 dias barra novo convite", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: {
      csat_surveys: {
        id: "sur-respondido",
        contact_id: CONTATO_ID,
        status: "responded",
        rating: 5,
        created_at: new Date().toISOString(),
      },
    },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "cooldown");
  assertEquals(registro.insercoes, []);
});

Deno.test("contato sem telefone nao agenda convite", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { contacts: { ...CONTATO_RESOLVIDO, phone: "  " } } });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "no_phone");
  assertEquals(registro.insercoes, []);
});

Deno.test("atraso respeitado: 45 min viram send_at = agora + 45 min e status scheduled", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ tabelas: { csat_auto_config: { ...CONFIG_LIGADA, delay_minutes: 45 } } });
  const antes = Date.now();

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();
  const depois = Date.now();

  assertEquals(res.status, 200);
  assertEquals(corpo.scheduled, true);
  assertEquals(corpo.closure_id, ENCERRAMENTO_ID);
  assertEquals(registro.insercoes.length, 1, "exatamente UM convite por encerramento");

  const convite = registro.insercoes[0].valores;
  assertEquals(registro.insercoes[0].tabela, CSAT_SURVEY_TABLE);
  assertEquals(convite.status, "scheduled");
  assertEquals(convite.contact_id, CONTATO_ID);
  assertEquals(convite.agent_id, ATENDENTE_ID, "o agente do convite e o atendente do encerramento");
  assertEquals(convite.conversation_id, ENCERRAMENTO_ID);
  assertEquals(convite.message_text, "Olá João Silva! Avalie seu atendimento de 1 a 5.");
  assertEquals(convite.rating, undefined, "convite nao tem nota: quem responde e o contato");

  const enviarEm = Date.parse(String(convite.send_at));
  assert(
    enviarEm >= antes + 45 * 60_000 && enviarEm <= depois + 45 * 60_000,
    `send_at fora da janela de 45 min: ${convite.send_at}`,
  );
  assertEquals(enviarEm, Date.parse(String(corpo.send_at)), "o send_at da resposta e o gravado");
  assertEquals(registro.rpcs, [], "agendar nao pode enfileirar nada na fila canonica");
});

Deno.test("sem atraso configurado (0) o send_at e agora — o vencimento e do dispatch", async () => {
  const registro = novoRegistro();
  const antes = Date.now();

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(casoFeliz(), registro));
  const corpo = await res.json();

  assertEquals(corpo.scheduled, true);
  const enviarEm = Date.parse(String(registro.insercoes[0].valores.send_at));
  assert(enviarEm >= antes && enviarEm <= Date.now(), "delay 0 deve agendar para agora");
});

Deno.test("idempotencia por CONVERSA: o 23505 do indice unico decide, nao um SELECT previo", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    erroDeInsert: { code: "23505", message: "duplicate key value violates unique constraint" },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const corpo = await res.json();

  assertEquals(res.status, 200);
  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "already_scheduled");
  assertEquals(corpo.closure_id, ENCERRAMENTO_ID);
  assertEquals(registro.insercoes.length, 1, "a decisao e do INSERT (o banco recusou), nao de uma consulta antes");
  assertFalse(
    registro.leituras.some((l) => l.tabela === "messages"),
    "nao existe mais leitura de messages: o estado vive em csat_surveys",
  );
});

Deno.test("RLS nega o INSERT (42501) responde 403 generico, sem vazar a regra", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    erroDeInsert: { code: "42501", message: "new row violates row-level security policy for table csat_surveys" },
  });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const texto = await res.text();

  assertEquals(res.status, 403);
  assertFalse(texto.includes("row-level security"), "o corpo nao pode revelar a regra que negou");
  assertEquals(registro.insercoes.length, 1);
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
  assertEquals(registro.insercoes[0].valores.message_text, "Oi João Silva, Rui (Vendas)");
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

  assertEquals(registro.insercoes[0].valores.message_text, "Oi João Silva, atendido por .");
});

Deno.test("closure_id pedido de outra conversa na janela tambem cai no cooldown", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({
    tabelas: {
      conversation_closures: [
        { ...ENCERRAMENTO_DE_ATENDENTE, id: ENCERRAMENTO_ANTIGO_ID, created_at: new Date(Date.now() - 1000).toISOString() },
        ENCERRAMENTO_DE_ATENDENTE,
      ],
      csat_surveys: {
        id: "sur-antigo",
        contact_id: CONTATO_ID,
        conversation_id: ENCERRAMENTO_ANTIGO_ID,
        status: "sent",
        created_at: new Date().toISOString(),
      },
    },
  });

  const res = await handleCsatAutoSend(
    pedido({ corpo: { contact_id: CONTATO_ID, closure_id: ENCERRAMENTO_ID } }),
    deps(o, registro),
  );
  const corpo = await res.json();

  assertEquals(corpo.scheduled, false);
  assertEquals(corpo.reason, "cooldown");
  assertEquals(registro.insercoes, []);
});

Deno.test("closure_id fora do formato uuid responde 400", async () => {
  const res = await handleCsatAutoSend(
    pedido({ corpo: { contact_id: CONTATO_ID, closure_id: "abc" } }),
    deps(casoFeliz(), novoRegistro()),
  );

  assertEquals(res.status, 400);
});

Deno.test("erro de leitura responde 500 sem vazar o detalhe do banco", async () => {
  const registro = novoRegistro();
  const o = casoFeliz({ erroEm: "contacts" });

  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), deps(o, registro));
  const texto = await res.text();

  assertEquals(res.status, 500);
  assertFalse(texto.includes("boom interno"));
  assertEquals(registro.insercoes, []);
});

Deno.test("rate limit: acima do teto por usuario responde 429 sem agendar", async () => {
  const registro = novoRegistro();
  const d = deps(casoFeliz(), registro);

  for (let i = 0; i < 30; i++) {
    const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), d);
    assertEquals(res.status, 200);
  }
  const res = await handleCsatAutoSend(pedido({ corpo: { contact_id: CONTATO_ID } }), d);

  assertEquals(res.status, 429);
  assertEquals(registro.insercoes.length, 30);
});

Deno.test("OPTIONS devolve preflight e nao toca o banco", async () => {
  const registro = novoRegistro();

  const res = await handleCsatAutoSend(pedido({ metodo: "OPTIONS", token: null }), deps({}, registro));

  assertEquals(res.status, 200);
  assertEquals(registro.insercoes, []);
});
