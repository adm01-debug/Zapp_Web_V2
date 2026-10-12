/**
 * Cartão t_b8b573c3 — o copiloto de voz precisa ACHAR ARQUIVO numa conversa.
 *
 * Defeito medido: `voice-copilot-action` tinha 7 ações e nenhuma devolvia um
 * arquivo de conversa; pedir "acha o contrato.pdf" não tinha para onde ir.
 *
 * O que este arquivo prova, chamando o HANDLER REAL com o client substituído
 * pelo seam `createAuthedClient`:
 *   1. a ação `search_files_in_conversation` devolve o arquivo certo, já com o
 *      `messageId` que o frontend usa para abrir a conversa rolada até ele;
 *   2. a visibilidade é decidida na RLS — o MESMO arquivo some para um chamador
 *      que não vê o contato (o client autenticado só enxerga o que a RLS de
 *      `messages` libera: contatos atribuídos ao profile do chamador);
 *   3. a leitura vai pelo authedClient (token do PRÓPRIO chamador); o
 *      service_role NUNCA é tocado (ele bypassa a RLS e vazaria a conversa);
 *   4. sem resultado quando não há arquivo, e sem varrer tudo quando não foi dito
 *      nem o termo nem a conversa.
 *
 * LIMITE DECLARADO: a RLS em si é comportamento do banco; aqui ela entra pelo
 * client falso (mesma fronteira que a ação usa), e a prova de que o service_role
 * não é usado é direta (ele explode se for chamado). Nada de rede, banco ou
 * credencial nesta prova.
 *
 * Run with: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
 *           supabase/functions/voice-copilot-action/index.test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/testing/asserts.ts";
import { handleVoiceCopilotAction, type VoiceCopilotActionDeps } from "./index.ts";

// O handler resolve as credenciais antes de criar os clients (injetados abaixo).
Deno.env.set("SUPABASE_URL", "https://local.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-de-teste");

const UID = "0f1e2d3c-4b5a-4978-8899-aabbccddeeff";
const CONVERSA_A = "11111111-1111-4111-8111-111111111111";
const CONVERSA_B = "22222222-2222-4222-8222-222222222222";
const MSG_CONTRATO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MSG_FOTO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Linha = Record<string, unknown>;

function arquivo(id: string, conversa: string, tipo: string, nome: string): Linha {
  return {
    id,
    contact_id: conversa,
    media_type: tipo,
    media_filename: nome,
    media_url: `https://storage.local/${nome}`,
    is_deleted: false,
    created_at: "2026-10-10T12:00:00.000Z",
  };
}

/** Uma consulta PostgREST registrada (para conferir os filtros emitidos). */
interface Consulta {
  table: string;
  calls: string[];
}

/**
 * Client autenticado falso: devolve só as linhas que "a RLS" dá ao chamador.
 * `visiveis` é o que o usuário enxerga — a mesma fronteira que a RLS de
 * `messages` aplica em produção (contatos atribuídos ao profile ou admin).
 */
function fakeAuthedClient(
  visiveis: Linha[],
  consultas: Consulta[],
): { from: (table: string) => unknown } {
  return {
    from(table: string) {
      const consulta: Consulta = { table, calls: [] };
      consultas.push(consulta);
      const b: Record<string, unknown> = {};
      const encadeia = (nome: string, ...args: unknown[]) => {
        consulta.calls.push(`${nome}:${args.map((a) => JSON.stringify(a)).join(",")}`);
        return b;
      };
      b.select = (...a: unknown[]) => encadeia("select", ...a);
      b.not = (...a: unknown[]) => encadeia("not", ...a);
      b.eq = (...a: unknown[]) => encadeia("eq", ...a);
      b.or = (...a: unknown[]) => encadeia("or", ...a);
      b.order = (...a: unknown[]) => encadeia("order", ...a);
      b.limit = (...a: unknown[]) => encadeia("limit", ...a);
      b.then = (resolve: (v: unknown) => void) => resolve({ data: visiveis, error: null });
      return b;
    },
  };
}

/** service_role falso: se for usado para ler qualquer coisa, explode. */
function fakeServiceClient(tocados: string[]): { from: (table: string) => unknown } {
  return {
    from(table: string) {
      tocados.push(table);
      throw new Error(`service_role não pode ser usado aqui (tabela ${table})`);
    },
  };
}

function pedido(action: string, params: Record<string, unknown>): Request {
  return new Request("https://local.test/voice-copilot-action", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer token-de-teste" },
    body: JSON.stringify({ action, params }),
  });
}

interface Cenario {
  deps: VoiceCopilotActionDeps;
  consultas: Consulta[];
  serviceTocado: string[];
}

function cenario(visiveis: Linha[]): Cenario {
  const consultas: Consulta[] = [];
  const serviceTocado: string[] = [];
  return {
    consultas,
    serviceTocado,
    deps: {
      authorize: () => Promise.resolve({ userId: UID }),
      createAuthedClient: () =>
        Promise.resolve(fakeAuthedClient(visiveis, consultas) as never),
      createServiceClient: () => fakeServiceClient(serviceTocado) as never,
    },
  };
}

async function chamar(
  c: Cenario,
  params: Record<string, unknown>,
): Promise<{ status: number; result: unknown }> {
  const res = await handleVoiceCopilotAction(
    pedido("search_files_in_conversation", params),
    c.deps,
  );
  const body = await res.json();
  return { status: res.status, result: body.result };
}

Deno.test("acha o arquivo pelo nome e devolve o messageId da conversa", async () => {
  const c = cenario([arquivo(MSG_CONTRATO, CONVERSA_A, "document", "contrato.pdf")]);
  const { status, result } = await chamar(c, { query: "contrato", contactId: CONVERSA_A });

  assertEquals(status, 200);
  const linhas = result as Array<Record<string, unknown>>;
  assertEquals(linhas.length, 1);
  // O id é o que o frontend usa para abrir a conversa rolada até o arquivo.
  assertEquals(linhas[0].messageId, MSG_CONTRATO);
  assertEquals(linhas[0].filename, "contrato.pdf");
  assertEquals(linhas[0].contactId, CONVERSA_A);

  // A leitura foi em `messages`, pelo authedClient, filtrando nome E tipo.
  const consulta = c.consultas.find((x) => x.table === "messages");
  assert(consulta, "a busca tem de consultar messages");
  const or = consulta!.calls.find((x) => x.startsWith("or:"));
  assert(or?.includes("media_filename.ilike"), "o nome do arquivo é filtrado no servidor");
  assert(or?.includes("media_type.ilike"), "o tipo do arquivo também é filtrado no servidor");
  assert(consulta!.calls.some((x) => x.startsWith("limit:")), "a busca é limitada");
  assert(
    consulta!.calls.some((x) => x.startsWith("eq:") && x.includes("contact_id")),
    "restrita à conversa dita",
  );

  // E o service_role (que bypassa a RLS) não foi tocado.
  assertEquals(c.serviceTocado, []);
});

Deno.test("usuário sem visibilidade NÃO recebe o arquivo (RLS decide)", async () => {
  // Mesmo arquivo existe, mas a RLS não o dá a este chamador (contato não é dele).
  const c = cenario([]);
  const { status, result } = await chamar(c, { query: "contrato", contactId: CONVERSA_A });

  assertEquals(status, 200);
  assertEquals(result, []);
  assertEquals(c.serviceTocado, []);
});

Deno.test("nenhum resultado quando não há arquivo na conversa", async () => {
  const c = cenario([]);
  const { status, result } = await chamar(c, { query: "proposta", contactId: CONVERSA_B });

  assertEquals(status, 200);
  assertEquals(result, []);
});

Deno.test("sem termo e sem conversa não varre tudo: devolve vazio e nem consulta", async () => {
  const c = cenario([arquivo(MSG_FOTO, CONVERSA_A, "image", "foto.png")]);
  const { status, result } = await chamar(c, {});

  assertEquals(status, 200);
  assertEquals(result, []);
  assertEquals(c.consultas, [], "sem intenção dita, nenhuma consulta é emitida");
});

Deno.test("busca pelo tipo leva o media_type ao filtro do servidor", async () => {
  const c = cenario([
    arquivo(MSG_CONTRATO, CONVERSA_A, "document", "contrato.pdf"),
    arquivo(MSG_FOTO, CONVERSA_A, "image", "foto.png"),
  ]);
  const { status, result } = await chamar(c, { query: "image", contactId: CONVERSA_A });

  assertEquals(status, 200);
  const consulta = c.consultas.find((x) => x.table === "messages");
  const or = consulta!.calls.find((x) => x.startsWith("or:"));
  assert(or?.includes("media_type.ilike"), "media_type entra no filtro do banco");
  assertEquals((result as unknown[]).length, 2);
});
