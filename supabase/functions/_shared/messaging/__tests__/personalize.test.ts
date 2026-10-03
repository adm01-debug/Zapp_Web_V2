// Testes do kernel compartilhado de personalização (F37).
//
// Os 10 casos abaixo são a cópia fiel dos testes de `personalize` em
// `supabase/functions/talkx-send/index.test.ts` (o plano citava "9", mas o
// conjunto real do TalkX tem 10 casos — reproduzidos na íntegra). O bloco
// final cobre o conjunto de chaves do Multiplix, para provar que o módulo
// aceita os DOIS dialetos de placeholder (ver cabeçalho de ../personalize.ts).
//
// Run with: deno test --config scripts/ci/deno.json supabase/functions/_shared/messaging/__tests__/personalize.test.ts

import { personalize, personalizeMultiplix } from "../personalize.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const contact = { name: "Joao Silva", nickname: "Joao", company: "Empresa Teste" };

Deno.test("personalize resolves the built-in placeholders (nome/apelido/empresa/saudacao)", () => {
  const result = personalize("Ola {{nome}}, aqui é da {{empresa}}", contact, {}).text;
  assert(result === "Ola Joao, aqui é da Empresa Teste", `unexpected result: ${result}`);
});

Deno.test("personalize falls back to a bracket placeholder for an unresolved variable instead of throwing", () => {
  // Regressão: campanha sem template salvo (template_id null) ou contato sem
  // aquele campo customizado preenchido não pode derrubar o envio inteiro com
  // unknown_placeholder — antes isso falhava 100% dos destinatários.
  const result = personalize("Seu cargo é {{cargo}}", contact, {}).text;
  assert(result === "Seu cargo é [cargo]", `unexpected result: ${result}`);
});

Deno.test("personalize substitutes the real value when the contact has that custom field", () => {
  // Regressão: o envio real de campanha (talkx-send, action=start) sempre
  // "resolvia" variável customizada como o próprio nome entre colchetes
  // (ex.: {{cargo}} -> "[cargo]"), nunca o dado real de contact_custom_fields.
  const result = personalize("Seu cargo é {{cargo}}", contact, { cargo: "Diretor de Vendas" }).text;
  assert(result === "Seu cargo é Diretor de Vendas", `unexpected result: ${result}`);
});

Deno.test("personalize resolves multiple custom values in the same message", () => {
  const result = personalize(
    "Ola {{nome}}, seu cargo e {{cargo}} no time {{time}}",
    contact,
    { cargo: "Diretor", time: "Vendas" },
  ).text;
  assert(result === "Ola Joao, seu cargo e Diretor no time Vendas", `unexpected result: ${result}`);
});

Deno.test("personalize replaces {{link}} with the per-recipient tracking URL when provided", () => {
  const result = personalize("Veja aqui: {{link}}", contact, {}, "America/Sao_Paulo", "https://zapp.example/l/abc").text;
  assert(result === "Veja aqui: https://zapp.example/l/abc", `unexpected result: ${result}`);
});

Deno.test("personalize falls back to a bracket placeholder for {{link}} when no tracking URL is available", () => {
  const result = personalize("Veja aqui: {{link}}", contact, {}).text;
  assert(result === "Veja aqui: [link]", `unexpected result: ${result}`);
});

Deno.test("personalize resolves {{link:rotulo}} to the URL of that label (X022)", () => {
  const links = { promo: "https://zapp.example/l/promo", oferta: "https://zapp.example/l/oferta" };
  const result = personalize(
    "Promo: {{link:promo}} | Oferta: {{link:oferta}}",
    contact,
    {},
    "America/Sao_Paulo",
    "https://zapp.example/l/abc",
    links,
  ).text;
  assert(result === "Promo: https://zapp.example/l/promo | Oferta: https://zapp.example/l/oferta", `unexpected result: ${result}`);
});

Deno.test("personalize marks {{link:rotulo}} with an unregistered label as unknown, never [link:rotulo] (X022)", () => {
  const result = personalize(
    "Veja: {{link:naoexiste}}",
    contact,
    {},
    "America/Sao_Paulo",
    "https://zapp.example/l/abc",
    { promo: "https://zapp.example/l/promo" },
  );
  assert(result.text === "Veja: [link:naoexiste]", `unexpected result: ${result.text}`);
  assert(result.unknown.includes("link:naoexiste"), `unknown deveria conter link:naoexiste: ${JSON.stringify(result.unknown)}`);
});

Deno.test("personalize matches a custom field key case-insensitively", () => {
  // Regressão: o CRM guarda o nome do campo como foi digitado (ex.: "CPF"),
  // mas o editor de template força minúsculo no placeholder ({{cpf}}) — o
  // match não pode depender de bater exatamente a mesma caixa.
  const result = personalize("CPF: {{cpf}}", contact, { CPF: "000.000.000-00" }).text;
  assert(result === "CPF: 000.000.000-00", `unexpected result: ${result}`);
});

Deno.test("personalize ignores a custom value using a reserved built-in name", () => {
  // Regressão: um campo customizado chamado "link" comia {{link}} antes do
  // passe de tracking, e um campo "nome"/"empresa" sequestrava o dado real do
  // contato.
  const result = personalize(
    "Nome: {{nome}} - Link: {{link}}",
    contact,
    { nome: "Valor Errado", link: "https://phishing.example" },
    "America/Sao_Paulo",
    "https://zapp.example/l/abc",
  ).text;
  assert(result === "Nome: Joao - Link: https://zapp.example/l/abc", `unexpected result: ${result}`);
});

Deno.test("personalize does not reinterpret placeholder-shaped text inside a custom value", () => {
  // Regressão: um campo customizado com valor literal "{{empresa}}" não pode
  // ser reescaneado e virar o nome da empresa do contato — é o dado de CRM
  // como está, ponto.
  const result = personalize("Cargo: {{cargo}}", contact, { cargo: "{{empresa}}" }).text;
  assert(result === "Cargo: {{empresa}}", `unexpected result: ${result}`);
});

Deno.test("personalize does not leak an inherited Object.prototype property for an unresolved placeholder", () => {
  // Regressão: "key in contactValues" também acha propriedades herdadas
  // (constructor, __proto__, etc.) antes de consultar o mapa de valores
  // customizados — um placeholder desses vazaria texto de função/objeto em
  // vez de cair no fallback "[variavel]".
  const result = personalize("X: {{constructor}}", contact, {}).text;
  assert(result === "X: [constructor]", `unexpected result: ${result}`);
});

// ---------------------------------------------------------------------------
// Compatibilidade com o dialeto de placeholders do Multiplix
// ---------------------------------------------------------------------------
// `personalize` do TalkX já resolve {{saudacao}} e {{empresa}}, que são
// exatamente as duas chaves fixas de `personalizeMultiplix`. Estes testes
// provam que o kernel compartilhado aceita o conjunto do Multiplix sem quebrar.
// O valor da empresa entra por `contact.company` (o Multiplix mapeia o nome da
// empresa para esse campo ao chamar o kernel — ver cabeçalho de ../personalize.ts).

const GREETINGS = ["Bom dia", "Boa tarde", "Boa noite"];

Deno.test("personalize (kernel) resolve o conjunto de chaves do Multiplix — {{saudacao}} e {{empresa}}", () => {
  const result = personalize("{{saudacao}}, aqui é da {{empresa}}!", { company: "Acme" }).text;
  const match = result.match(/^(Bom dia|Boa tarde|Boa noite), aqui é da Acme!$/);
  assert(!!match && GREETINGS.includes(match[1]), `unexpected result: ${result}`);
});

Deno.test("personalizeMultiplix (módulo) resolve {{empresa}} com o nome da empresa", () => {
  const result = personalizeMultiplix("Ola, aqui é da {{empresa}}", { name: "Empresa Teste" });
  assert(result === "Ola, aqui é da Empresa Teste", `unexpected result: ${result}`);
});

Deno.test("personalizeMultiplix (módulo) resolve {{saudacao}} para um período válido do dia", () => {
  const result = personalizeMultiplix("{{saudacao}}, {{empresa}}!", { name: "Acme" });
  const match = result.match(/^(Bom dia|Boa tarde|Boa noite), Acme!$/);
  assert(!!match && GREETINGS.includes(match[1]), `unexpected result: ${result}`);
});

Deno.test("personalizeMultiplix (módulo) usa string vazia quando company.name é ausente/null", () => {
  const result = personalizeMultiplix("Empresa: {{empresa}}", {});
  assert(result === "Empresa: ", `unexpected result: ${result}`);
});

Deno.test("personalizeMultiplix (módulo) lança unknown_placeholder para variável fora do conjunto fixo", () => {
  let threw = false;
  try {
    personalizeMultiplix("Seu cargo é {{cargo}}", { name: "Acme" });
  } catch (err) {
    threw = true;
    assert(
      err instanceof Error && err.message.includes("unknown_placeholder"),
      `expected unknown_placeholder, got: ${String(err)}`,
    );
  }
  assert(threw, "expected personalizeMultiplix to throw for an unregistered placeholder");
});

Deno.test("personalizeMultiplix (módulo) é case-insensitive nos placeholders conhecidos", () => {
  const result = personalizeMultiplix("{{SAUDACAO}}, {{Empresa}}!", { name: "Acme" });
  const match = result.match(/^(Bom dia|Boa tarde|Boa noite), Acme!$/);
  assert(!!match && GREETINGS.includes(match[1]), `unexpected result: ${result}`);
});
