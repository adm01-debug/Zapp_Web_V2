import { personalize } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const contact = { name: 'Joao Silva', nickname: 'Joao', company: 'Empresa Teste' };

Deno.test('personalize resolves the built-in placeholders (nome/apelido/empresa/saudacao)', () => {
  const result = personalize('Ola {{nome}}, aqui é da {{empresa}}', contact, []);
  assert(result === 'Ola Joao, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalize throws unknown_placeholder for a placeholder outside the fixed set and customVars', () => {
  let threw = false;
  try {
    personalize('Seu cargo é {{cargo}}', contact, []);
  } catch (e) {
    threw = true;
    assert(e instanceof Error && e.message.includes('unknown_placeholder: {{cargo}}'), `unexpected error: ${e}`);
  }
  assert(threw, 'expected personalize to throw for an unregistered placeholder');
});

Deno.test('personalize does NOT throw when the placeholder name is passed via customVars (template.custom_variables)', () => {
  // Regressão: o envio real de campanha (talkx-send, action=start) chamava
  // personalize(...) com customVars fixado como [] mesmo quando a campanha usa
  // um template com custom_variables cadastradas (ex.: {{cargo}}), enquanto o
  // preview do editor de template (action=test) sempre repassava
  // customVariables corretamente. Resultado: campanhas com variável
  // customizada falhavam para 100% dos destinatários com unknown_placeholder.
  const result = personalize('Seu cargo é {{cargo}}', contact, ['cargo']);
  assert(result === 'Seu cargo é [cargo]', `unexpected result: ${result}`);
});

Deno.test('personalize replaces {{link}} with the per-recipient tracking URL when provided', () => {
  const result = personalize('Veja aqui: {{link}}', contact, [], 'America/Sao_Paulo', 'https://zapp.example/l/abc');
  assert(result === 'Veja aqui: https://zapp.example/l/abc', `unexpected result: ${result}`);
});
