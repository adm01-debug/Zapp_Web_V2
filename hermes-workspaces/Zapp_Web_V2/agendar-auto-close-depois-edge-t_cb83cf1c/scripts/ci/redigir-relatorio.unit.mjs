import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { arquivosDeTexto, redigirConteudo, redigirDiretorio, TAMANHO_MINIMO } from './redigir-relatorio.mjs';

const EMAIL = 'usuario.de.teste@example.com';

function arvore() {
  const raiz = mkdtempSync(join(tmpdir(), 'relatorio-'));
  mkdirSync(join(raiz, 'data'), { recursive: true });
  writeFileSync(join(raiz, 'index.html'), `<title>login de ${EMAIL}</title>`);
  writeFileSync(join(raiz, 'data', 'trace.html'), `passo 1: fill("${EMAIL}")`);
  writeFileSync(join(raiz, 'sem-segredo.html'), '<p>apenas um relatorio comum</p>');
  writeFileSync(join(raiz, 'screenshot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return raiz;
}

test('E82: redigirConteudo troca o valor e conta as ocorrencias', () => {
  const r = redigirConteudo(`a ${EMAIL} b ${EMAIL} c`, EMAIL);
  assert.equal(r.ocorrencias, 2);
  assert.doesNotMatch(r.texto, /usuario\.de\.teste/);
  assert.match(r.texto, /a \[redigido\] b \[redigido\] c/);
});

test('E82: valor curto demais nao vira redacao em massa', () => {
  assert.equal(TAMANHO_MINIMO, 5);
  const r = redigirConteudo('abcdef', 'ab');
  assert.equal(r.ocorrencias, 0);
  assert.equal(r.texto, 'abcdef', 'segredo de 2 caracteres destruiria o relatorio sem proteger nada');
  assert.equal(redigirConteudo('x', '').ocorrencias, 0);
  assert.equal(redigirConteudo('x', undefined).ocorrencias, 0);
});

test('E82: o diretorio inteiro fica limpo e o que nao tinha o segredo nao muda', () => {
  const raiz = arvore();
  const r = redigirDiretorio(raiz, EMAIL);
  assert.equal(r.ocorrencias, 2, 'uma no index e uma no trace');
  assert.equal(r.arquivosTocados, 2);
  assert.doesNotMatch(readFileSync(join(raiz, 'index.html'), 'utf8'), /usuario\.de\.teste/);
  assert.doesNotMatch(readFileSync(join(raiz, 'data', 'trace.html'), 'utf8'), /example\.com/);
  assert.match(
    readFileSync(join(raiz, 'sem-segredo.html'), 'utf8'),
    /apenas um relatorio comum/,
    'arquivo sem o segredo sai intacto',
  );
});

test('E82: binario nao e lido nem reescrito', () => {
  const raiz = arvore();
  const textos = arquivosDeTexto(raiz);
  assert.ok(!textos.some((c) => c.endsWith('.png')), 'png nao entra na lista de texto');
  assert.equal(textos.length, 3);
  const r = redigirDiretorio(raiz, EMAIL);
  assert.equal(r.arquivos, 3, 'so os 3 de texto foram considerados');
});

test('E82: diretorio ausente nao derruba o CI', () => {
  const r = redigirDiretorio(join(tmpdir(), 'nao-existe-mesmo-12345'), EMAIL);
  assert.deepEqual(r, { arquivos: 0, arquivosTocados: 0, ocorrencias: 0, segredos: 1 });
});

test('E82: o workflow mascara o log e redige o arquivo ANTES de subir o artifact', () => {
  const y = readFileSync(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');
  const mascara = y.indexOf('::add-mask::$E2E_TEST_EMAIL');
  const playwright = y.indexOf('Run Playwright E2E');
  const redige = y.indexOf('scripts/ci/redigir-relatorio.mjs');
  const upload = y.indexOf('actions/upload-artifact');

  assert.ok(mascara > -1, 'o e-mail tem de ser mascarado no log');
  assert.ok(mascara < playwright, 'mascarar DEPOIS do Playwright nao protege nada');
  assert.ok(redige > playwright, 'a redacao vem depois do relatorio existir');
  assert.ok(upload > redige, 'redigir DEPOIS do upload publicaria o arquivo com o e-mail -- o CI nao pega isso');
  assert.match(y, /--segredo-env=E2E_TEST_EMAIL/, 'o valor chega pelo nome da variavel, nunca na linha de comando');
  assert.match(
    y,
    /--segredo-env=E2E_TEST_PASSWORD/,
    'redige TAMBEM a senha: e ela que aparece em texto claro no error-context.md',
  );
  assert.match(y, /retention-days: 3/, 'o plano pede 3 dias de retencao');
  assert.match(y, /if-no-files-found: ignore/, 'sem relatorio nao e erro');
  assert.match(
    y,
    /steps\.redigir\.outcome == 'success'/,
    'se a redacao falhar, o relatorio NAO pode subir -- seria publicar as credenciais de qualquer jeito',
  );
  assert.match(y, /uses: actions\/upload-artifact@[0-9a-f]{40}/, 'o zizmor exige `uses` pinado por SHA');
});

test('E82: dois segredos na mesma passada -- email e senha saem os dois', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'dois-'));
  writeFileSync(join(raiz, 'error-context.md'), `login com ${EMAIL} e senha SegredoForte123`);
  const r = redigirDiretorio(raiz, [EMAIL, 'SegredoForte123']);
  assert.equal(r.ocorrencias, 2);
  assert.equal(r.segredos, 2);
  const texto = readFileSync(join(raiz, 'error-context.md'), 'utf8');
  assert.doesNotMatch(texto, /usuario\.de\.teste/);
  assert.doesNotMatch(texto, /SegredoForte123/, 'a senha digitada nao pode sobreviver a redacao');
  assert.match(texto, /login com \[redigido\] e senha \[redigido\]/);
});

test('E82: lista de segredos ignora curto, vazio e repetido', () => {
  const r = redigirConteudo('a SegredoForte123 b SegredoForte123', ['SegredoForte123', 'SegredoForte123', 'ab', '']);
  assert.equal(r.ocorrencias, 2, 'o repetido nao conta duas vezes');
  assert.equal(r.texto, 'a [redigido] b [redigido]');
});
