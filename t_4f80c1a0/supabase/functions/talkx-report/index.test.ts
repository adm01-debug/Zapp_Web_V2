import { escHtml } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('escHtml escapa os 5 caracteres de injeção HTML', () => {
  const result = escHtml(`<script>alert('x')</script> & "test"`);
  assert(!result.includes('<script>'), `script tag nao escapado: ${result}`);
  assert(result.includes('&lt;script&gt;'), `unexpected: ${result}`);
  assert(result.includes('&amp;'), `unexpected: ${result}`);
  assert(result.includes('&#39;'), `unexpected: ${result}`);
  assert(result.includes('&quot;'), `unexpected: ${result}`);
});
