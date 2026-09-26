import { personalizeMultiplix } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('personalizeMultiplix resolves {{empresa}} com o nome da empresa', () => {
  const result = personalizeMultiplix('Ola, aqui é da {{empresa}}', { name: 'Empresa Teste' });
  assert(result === 'Ola, aqui é da Empresa Teste', `unexpected result: ${result}`);
});

Deno.test('personalizeMultiplix resolve {{saudacao}} para um período válido do dia', () => {
  // getGreeting() usa a hora real — só valida que retorna uma das 3 saudações
  // esperadas, sem travar o teste a um horário fixo de execução do CI.
  const result = personalizeMultiplix('{{saudacao}}, {{empresa}}!', { name: 'Acme' });
  const validGreetings = ['Bom dia, Acme!', 'Boa tarde, Acme!', 'Boa noite, Acme!'];
  assert(validGreetings.includes(result), `unexpected greeting result: ${result}`);
});

Deno.test('personalizeMultiplix usa string vazia quando company.name é ausente/null', () => {
  const result = personalizeMultiplix('Empresa: {{empresa}}', {});
  assert(result === 'Empresa: ', `unexpected result: ${result}`);
});

Deno.test('personalizeMultiplix lança unknown_placeholder para variável fora do conjunto fixo', () => {
  // Multiplix nao tem custom_variables (diferente do talkx-send) — todo
  // placeholder que nao seja {{empresa}}/{{saudacao}} deve falhar explicito
  // em vez de vazar {{...}} intacto pra mensagem real do WhatsApp.
  let threw = false;
  try {
    personalizeMultiplix('Seu cargo é {{cargo}}', { name: 'Acme' });
  } catch (e) {
    threw = true;
    assert(e instanceof Error && e.message.includes('unknown_placeholder: {{cargo}}'), `unexpected error: ${e}`);
  }
  assert(threw, 'expected personalizeMultiplix to throw for an unregistered placeholder');
});

Deno.test('personalizeMultiplix é case-insensitive nos placeholders conhecidos', () => {
  const result = personalizeMultiplix('{{SAUDACAO}}, {{Empresa}}!', { name: 'Acme' });
  const validGreetings = ['Bom dia, Acme!', 'Boa tarde, Acme!', 'Boa noite, Acme!'];
  assert(validGreetings.includes(result), `unexpected result: ${result}`);
});
