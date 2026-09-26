import { personalize } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const contact = { name: 'Joao Silva', nickname: 'Joao', company: 'Empresa Teste' };

Deno.test('personalize resolves the built-in placeholders (nome/apelido/empresa/saudacao)', () => {
  const result = personalize('Ola {{nome}}, aqui é da {{empresa}}', contact, {});
  assert(result === 'Ola Joao, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalize falls back to a bracket placeholder for an unresolved variable instead of throwing', () => {
  // Regressão: campanha sem template salvo (template_id null) ou contato sem
  // aquele campo customizado preenchido não pode derrubar o envio inteiro com
  // unknown_placeholder — antes isso falhava 100% dos destinatários.
  const result = personalize('Seu cargo é {{cargo}}', contact, {});
  assert(result === 'Seu cargo é [cargo]', `unexpected result: ${result}`);
});

Deno.test('personalize substitutes the real value when the contact has that custom field', () => {
  // Regressão: o envio real de campanha (talkx-send, action=start) sempre
  // "resolvia" variável customizada como o próprio nome entre colchetes
  // (ex.: {{cargo}} -> "[cargo]"), nunca o dado real de contact_custom_fields.
  const result = personalize('Seu cargo é {{cargo}}', contact, { cargo: 'Diretor de Vendas' });
  assert(result === 'Seu cargo é Diretor de Vendas', `unexpected result: ${result}`);
});

Deno.test('personalize resolves multiple custom values in the same message', () => {
  const result = personalize(
    'Ola {{nome}}, seu cargo e {{cargo}} no time {{time}}',
    contact,
    { cargo: 'Diretor', time: 'Vendas' },
  );
  assert(result === 'Ola Joao, seu cargo e Diretor no time Vendas', `unexpected result: ${result}`);
});

Deno.test('personalize replaces {{link}} with the per-recipient tracking URL when provided', () => {
  const result = personalize('Veja aqui: {{link}}', contact, {}, 'America/Sao_Paulo', 'https://zapp.example/l/abc');
  assert(result === 'Veja aqui: https://zapp.example/l/abc', `unexpected result: ${result}`);
});

Deno.test('personalize falls back to a bracket placeholder for {{link}} when no tracking URL is available', () => {
  const result = personalize('Veja aqui: {{link}}', contact, {});
  assert(result === 'Veja aqui: [link]', `unexpected result: ${result}`);
});

Deno.test('personalize matches a custom field key case-insensitively', () => {
  // Regressão: o CRM guarda o nome do campo como foi digitado (ex.: "CPF"),
  // mas o editor de template força minúsculo no placeholder ({{cpf}}) — o
  // match não pode depender de bater exatamente a mesma caixa.
  const result = personalize('CPF: {{cpf}}', contact, { CPF: '000.000.000-00' });
  assert(result === 'CPF: 000.000.000-00', `unexpected result: ${result}`);
});

Deno.test('personalize ignores a custom value using a reserved built-in name', () => {
  // Regressão: um campo customizado chamado "link" comia {{link}} antes do
  // passe de tracking, e um campo "nome"/"empresa" sequestrava o dado real do
  // contato.
  const result = personalize(
    'Nome: {{nome}} - Link: {{link}}',
    contact,
    { nome: 'Valor Errado', link: 'https://phishing.example' },
    'America/Sao_Paulo',
    'https://zapp.example/l/abc',
  );
  assert(result === 'Nome: Joao - Link: https://zapp.example/l/abc', `unexpected result: ${result}`);
});

Deno.test('personalize does not reinterpret placeholder-shaped text inside a custom value', () => {
  // Regressão: um campo customizado com valor literal "{{empresa}}" não pode
  // ser reescaneado e virar o nome da empresa do contato — é o dado de CRM
  // como está, ponto.
  const result = personalize('Cargo: {{cargo}}', contact, { cargo: '{{empresa}}' });
  assert(result === 'Cargo: {{empresa}}', `unexpected result: ${result}`);
});
