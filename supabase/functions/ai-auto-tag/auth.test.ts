/**
 * Contrato executável do PORTÃO DE AUTENTICAÇÃO do ai-auto-tag.
 *
 * SL-194 (achado B13): este arquivo se chamava `auth_test.ts` — nome que o glob
 * do CI `supabase/functions/**\/*.test.ts` (passo "Run executable Edge handler
 * contracts", ci.yml) não coleta, e que a guarda E48
 * (`scripts/ci/check-test-inventory.mjs`) também não enxerga. Pior: as duas
 * provas que ele carregava só rodavam contra `SUPABASE_FUNCTIONS_URL`
 * (`ignore: !BASE`), ou seja, nunca eram executadas em lugar nenhum — nem no CI,
 * nem na máquina de quem não tem a URL. O passo do CI também só libera rede
 * para 127.0.0.1, então uma prova contra URL externa não teria como rodar lá.
 *
 * As mesmas três afirmações, agora provadas OFFLINE e de verdade, chamando o
 * handler REAL (`handleAiAutoTag`) sem rede, sem banco e sem env — os três
 * casos terminam dentro do `requireAuth`, antes de qualquer I/O:
 *  - pedido sem cabeçalho Authorization          -> 401 do portão;
 *  - pedido com cabeçalho que não é `Bearer ...` -> 401 do portão;
 *  - `Bearer` malformado                         -> 401 (falha fechada: nunca
 *    5xx e nunca segue para o handler).
 *
 * O quarto caso é o controle: o MESMO pedido sem cabeçalho, com o portão
 * satisfeito por injeção, passa adiante — é isso que garante que os 401 acima
 * vêm do portão, e não de uma falha genérica do handler.
 *
 * Comando do CI: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 <este arquivo>
 */
import { handleAiAutoTag, type AiAutoTagDeps } from "./index.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

function post(headers: Record<string, string>): Request {
  return new Request("https://edge.test/ai-auto-tag", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ contactId: CONTACT_ID, messages: [] }),
  });
}

async function mensagemDeErro(res: Response): Promise<string> {
  const body = (await res.json()) as { error?: string };
  return body.error ?? "";
}

Deno.test("auth: sem cabeçalho Authorization o handler para no portão com 401", async () => {
  const res = await handleAiAutoTag(post({}));

  assert(res.status === 401, `esperava 401, veio ${res.status}`);
  assert(
    (await mensagemDeErro(res)) === "Missing Authorization bearer token",
    "o 401 não veio do portão de autenticação (mensagem do requireAuth ausente)",
  );
});

Deno.test("auth: cabeçalho que não é `Bearer ...` também para no portão com 401", async () => {
  const res = await handleAiAutoTag(post({ Authorization: "Basic dXNlcjpzZW5oYQ==" }));

  assert(res.status === 401, `esperava 401, veio ${res.status}`);
  assert(
    (await mensagemDeErro(res)) === "Missing Authorization bearer token",
    "o 401 não veio do portão de autenticação (mensagem do requireAuth ausente)",
  );
});

Deno.test("auth: `Bearer` malformado falha fechado — 401, nunca 5xx e nunca segue adiante", async () => {
  // Sem SUPABASE_URL no ambiente a checagem do token nem sai do processo; com a
  // variável, o `fetch` para outro host é bloqueado pelas permissões do passo.
  // Em qualquer um dos caminhos o portão tem de fechar em 401.
  const res = await handleAiAutoTag(post({ Authorization: "Bearer invalid.token.here" }));

  assert(res.status === 401, `esperava 401 (falha fechada), veio ${res.status}`);
  assert((await mensagemDeErro(res)).length > 0, "resposta 401 sem mensagem de erro no corpo");
});

Deno.test("auth: controle — com o portão satisfeito o MESMO pedido passa adiante (o 401 é do portão)", async () => {
  const deps: AiAutoTagDeps = {
    authorize: () => Promise.resolve({ userId: "user-1" }),
    enforceGuards: () => Promise.resolve(new Response(null, { status: 402 })),
  };
  const res = await handleAiAutoTag(post({}), deps);

  assert(
    res.status !== 401,
    "sem cabeçalho Authorization o handler seguiu adiante: o 401 dos casos acima é do portão",
  );
  assert(res.status === 402, `esperava 402 da guarda injetada, veio ${res.status}`);
});
