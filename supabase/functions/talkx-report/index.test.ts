import { buildCsv, escCsv, escHtml } from './index.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// escCsv previne CSV formula injection (=, +, -, @, tab, CR, LF no início do
// campo — Excel/Sheets interpretariam como fórmula ao abrir o export).
Deno.test('escCsv prefixa apóstrofo em valor que começa com caractere de fórmula', () => {
  assert(escCsv('=SOMA(A1:A2)') === "'=SOMA(A1:A2)", `unexpected: ${escCsv('=SOMA(A1:A2)')}`);
  assert(escCsv('+1234') === "'+1234", `unexpected: ${escCsv('+1234')}`);
  assert(escCsv('@cmd') === "'@cmd", `unexpected: ${escCsv('@cmd')}`);
});

Deno.test('escCsv não altera valor comum sem caractere de fórmula ou vírgula/aspas', () => {
  assert(escCsv('João Silva') === 'João Silva', `unexpected: ${escCsv('João Silva')}`);
});

Deno.test('escCsv envolve em aspas e escapa aspas internas quando há vírgula/aspas/quebra de linha', () => {
  assert(escCsv('a,b') === '"a,b"', `unexpected: ${escCsv('a,b')}`);
  assert(escCsv('disse "oi"') === '"disse ""oi"""', `unexpected: ${escCsv('disse "oi"')}`);
});

Deno.test('escHtml escapa os 5 caracteres de injeção HTML', () => {
  const result = escHtml(`<script>alert('x')</script> & "test"`);
  assert(!result.includes('<script>'), `script tag nao escapado: ${result}`);
  assert(result.includes('&lt;script&gt;'), `unexpected: ${result}`);
  assert(result.includes('&amp;'), `unexpected: ${result}`);
  assert(result.includes('&#39;'), `unexpected: ${result}`);
  assert(result.includes('&quot;'), `unexpected: ${result}`);
});

Deno.test('buildCsv retorna string vazia para lista de linhas vazia', () => {
  assert(buildCsv([]) === '', `unexpected: ${buildCsv([])}`);
});

Deno.test('buildCsv gera BOM + cabeçalho + linhas com CRLF, escapando cada célula', () => {
  const csv = buildCsv([{ nome: 'A,B', valor: '=1+1' }]);
  assert(csv.startsWith('﻿'), 'missing UTF-8 BOM');
  assert(csv.includes('nome,valor'), `missing header: ${csv}`);
  // "A,B" recebe aspas (tem virgula); '=1+1 so recebe o apostrofo anti-formula
  // (sem virgula/aspas/CRLF, escCsv nao envolve em aspas).
  assert(csv.includes('"A,B",\'=1+1'), `unexpected escaping: ${csv}`);
  assert(csv.includes('\r\n'), 'missing CRLF line ending');
});

Deno.test('buildCsv usa string vazia para célula null', () => {
  const csv = buildCsv([{ nome: 'A', obs: null }]);
  assert(csv.split('\r\n')[1] === 'A,', `unexpected row: ${csv.split('\r\n')[1]}`);
});
