// X020 — provas comportamentais da personalização e do sorteio A/B estável.
//
// Cobre o que o teste de paridade (texto) não fixa:
//   1. personalize() devolve missing/unknown separados (política de erro);
//   2. os built-ins novos (vendedor, telefone, data_atual/data) e o padrão
//      "{{chave|padrão}}";
//   3. pickVariant() é determinístico por hash estável do id do destinatário.
//
// Run with: deno test --config scripts/ci/deno.json --frozen --allow-env \
//   --allow-read --allow-net=127.0.0.1 supabase/functions/talkx-send/x020-variavel-precedencia.test.ts

import { personalize } from "../_shared/messaging/personalize.ts";
import { pickVariant } from "./process-recipient.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const contact = {
  name: "Joao Silva",
  nickname: "Joao",
  company: "Empresa Teste",
  phone: "+55 11 98888-7777",
  vendedor: "Maria Souza",
};

Deno.test("X020: {{chave|padrão}} usa o padrão quando a chave não tem valor", () => {
  // Com padrão: usa o padrão e NÃO entra em missing (o padrão é o valor).
  const comPadrao = personalize("Ola {{nome|cliente}}", { name: "" }, {});
  assert(comPadrao.text === "Ola cliente", `esperava "Ola cliente", veio ${comPadrao.text}`);
  assert(comPadrao.missing.length === 0, `com padrão não é missing: ${JSON.stringify(comPadrao.missing)}`);
  // Sem padrão: vira missing (conhecida, sem valor).
  const semPadrao = personalize("Ola {{nome}}", { name: "" }, {});
  assert(semPadrao.missing.includes("nome"), `nome deveria estar em missing: ${JSON.stringify(semPadrao.missing)}`);
});

Deno.test("X020: built-ins novos resolvem (vendedor/telefone) e data dd/mm/aaaa", () => {
  const r = personalize("Vendedor: {{vendedor}} | Tel: {{telefone}}", contact, {});
  assert(r.text === "Vendedor: Maria Souza | Tel: +55 11 98888-7777", `unexpected: ${r.text}`);
  const d = personalize("Hoje é {{data_atual}} e {{data}}", contact, {}, "America/Sao_Paulo");
  assert(/^Hoje é \d{2}\/\d{2}\/\d{4} e \d{2}\/\d{2}\/\d{4}$/.test(d.text), `data inesperada: ${d.text}`);
  assert(d.missing.length === 0 && d.unknown.length === 0, `não deveria ter missing/unknown: ${JSON.stringify(d)}`);
});

Deno.test("X020: variável conhecida sem valor → missing; nome desconhecido → unknown", () => {
  // empresa não tem valor no contato e não tem padrão → missing.
  const m = personalize("Empresa: {{empresa}}", { name: "X" }, {});
  assert(m.missing.includes("empresa"), `empresa em missing: ${JSON.stringify(m.missing)}`);
  // cargo não é nativa, nem customizada, nem link → unknown.
  const u = personalize("Cargo: {{cargo}}", { name: "X" }, {});
  assert(u.unknown.includes("cargo"), `cargo em unknown: ${JSON.stringify(u.unknown)}`);
  // uma customizada com valor não é missing nem unknown.
  const ok = personalize("Cargo: {{cargo}}", { name: "X" }, { cargo: "Diretor" });
  assert(ok.missing.length === 0 && ok.unknown.length === 0, `não deveria ter missing/unknown: ${JSON.stringify(ok)}`);
});

Deno.test("X020: pickVariant é determinístico por hash estável do destinatário", async () => {
  const variants = [
    { id: "v1", content: "Mensagem A", media_url: null, media_type: null, weight: 1 },
    { id: "v2", content: "Mensagem B", media_url: null, media_type: null, weight: 1 },
  ];
  // Mock mínimo da cadeia .from().select().eq() que pickVariant usa.
  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: variants, error: null }),
      }),
    }),
  };
  const a = await pickVariant(supabase as never, "tpl-1", "recipient-123");
  const b = await pickVariant(supabase as never, "tpl-1", "recipient-123");
  assert(a !== null && b !== null, "deveria sortear uma variante");
  assert(a!.id === b!.id, `mesmo destinatário deve cair na mesma variante: ${a!.id} != ${b!.id}`);
  // Ids diferentes distribuem (sem viés de ordem das variantes).
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const v = await pickVariant(supabase as never, "tpl-1", `recipient-${i}`);
    if (v) seen.add(v.id);
  }
  assert(seen.size > 1, `50 destinatários distintos devem distribuir entre as variantes: ${JSON.stringify([...seen])}`);
});
