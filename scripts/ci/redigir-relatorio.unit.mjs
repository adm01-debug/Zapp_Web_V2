import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  arquivosDeTexto,
  contarRestantes,
  crc32,
  escreverZip,
  formasDoSegredo,
  lerZip,
  redigirBytes,
  redigirConteudo,
  redigirDiretorio,
  redigirPadroes,
  redigirZip,
  TAMANHO_MINIMO,
} from './redigir-relatorio.mjs';

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

test.skip('E82: o workflow mascara o log e redige o arquivo ANTES de subir o artifact', () => {
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

// ── W06: ZIP embutido no index.html e traces em data/*.zip ─────────────────────
const SENHA = 'E2e-Senha"Forte!123';

/** ZIP de verdade a partir de { nome: Buffer|string }. */
function zipDe(arquivos) {
  return escreverZip(
    Object.entries(arquivos).map(([nome, conteudo]) => ({
      nome: Buffer.from(nome),
      flags: 0,
      metodo: 0,
      hora: 0,
      data: 0x21,
      crc: 0,
      tamanho: 0,
      versaoFeita: 20,
      atributosInternos: 0,
      atributosExternos: 0,
      comprimido: Buffer.alloc(0),
      novoConteudo: Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo),
    })),
  );
}

function conteudoDe(zip, nome) {
  const e = lerZip(zip).find((x) => x.nome.toString() === nome);
  return e.conteudo();
}

test('W06: o segredo some do ZIP em base64 embutido no index.html (forma literal e escapada em JSON)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'embutido-'));
  const reportJson = JSON.stringify({ steps: [{ title: `Fill "${EMAIL}"` }, { title: `Fill "${SENHA}"` }] });
  const embutido = zipDe({ 'report.json': reportJson, 'outro.json': '{"ok":true}' }).toString('base64');
  writeFileSync(
    join(raiz, 'index.html'),
    `<script>window.playwrightReportBase64 = "data:application/zip;base64,${embutido}";</script>`,
  );
  assert.ok(reportJson.includes(JSON.stringify(SENHA).slice(1, -1)), 'a senha aparece escapada no JSON');

  const r = redigirDiretorio(raiz, [EMAIL, SENHA]);
  assert.equal(r.ocorrencias, 2);
  const html = readFileSync(join(raiz, 'index.html'), 'utf8');
  const b64 = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/.exec(html)[1];
  const zip = Buffer.from(b64, 'base64');
  const json = JSON.parse(conteudoDe(zip, 'report.json').toString('utf8'));
  assert.deepEqual(json.steps.map((s) => s.title), ['Fill "[redigido]"', 'Fill "[redigido]"']);
  assert.equal(conteudoDe(zip, 'outro.json').toString(), '{"ok":true}', 'entrada sem segredo sai intacta');
  assert.equal(contarRestantes(raiz, [EMAIL, SENHA]), 0);
});

test('W06: trace em data/*.zip (com ZIP aninhado) e redigido; binario ao redor nao corrompe', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'trace-'));
  mkdirSync(join(raiz, 'data'));
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const interno = zipDe({ '0-trace.trace': `{"type":"before","params":{"value":"${SENHA.replace('"', '\\"')}"}}\n` });
  writeFileSync(
    join(raiz, 'data', 'abc.zip'),
    zipDe({ 'resources/x.jpeg': jpeg, 'aninhado.zip': interno, 'net.json': `{"postData":"${EMAIL}"}` }),
  );

  const r = redigirDiretorio(raiz, [EMAIL, SENHA]);
  assert.equal(r.ocorrencias, 2);
  assert.equal(r.arquivosTocados, 1);
  const zip = readFileSync(join(raiz, 'data', 'abc.zip'));
  assert.deepEqual(conteudoDe(zip, 'resources/x.jpeg'), jpeg, 'imagem sai byte a byte igual');
  assert.equal(conteudoDe(zip, 'net.json').toString(), '{"postData":"[redigido]"}');
  const trace = conteudoDe(conteudoDe(zip, 'aninhado.zip'), '0-trace.trace').toString();
  assert.doesNotMatch(trace, /Senha/);
  assert.equal(contarRestantes(raiz, [EMAIL, SENHA]), 0);
});

test('W06: ZIP que nao da para regravar com seguranca derruba a redacao (o upload nao acontece)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ruim-'));
  mkdirSync(join(raiz, 'data'));
  const zip = zipDe({ 'a.txt': SENHA });
  zip.writeUInt16LE(1, 8); // flag de criptografia no local header... e no central:
  const cd = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  zip.writeUInt16LE(1, cd + 8);
  writeFileSync(join(raiz, 'data', 'cifrado.zip'), zip);
  assert.throws(() => redigirDiretorio(raiz, [SENHA]), /criptografado/);

  const script = fileURLToPath(new URL('./redigir-relatorio.mjs', import.meta.url));
  const p = spawnSync(process.execPath, [script, raiz, '--segredo-env=SEGREDO_TESTE'], {
    env: { ...process.env, SEGREDO_TESTE: SENHA },
    encoding: 'utf8',
  });
  assert.equal(p.status, 1, 'saida != 0: o step falha e o upload condicionado a ele nao roda');
  assert.doesNotMatch(p.stdout + p.stderr, /Senha/, 'o valor nunca e impresso');
});

test('W06: o CLI verifica o diretorio inteiro depois de redigir', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'cli-'));
  writeFileSync(join(raiz, 'index.html'), `data:application/zip;base64,${zipDe({ 'r.json': SENHA }).toString('base64')}`);
  const script = fileURLToPath(new URL('./redigir-relatorio.mjs', import.meta.url));
  const p = spawnSync(process.execPath, [script, raiz, '--segredo-env=SEGREDO_TESTE'], {
    env: { ...process.env, SEGREDO_TESTE: SENHA },
    encoding: 'utf8',
  });
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /verificado: nenhuma ocorrencia restante/);
  assert.doesNotMatch(p.stdout + p.stderr, /Senha/);
});

test('W06: formas escapadas do segredo (JSON e HTML) tambem sao redigidas', () => {
  assert.deepEqual(formasDoSegredo('a"b&c<d'), ['a"b&c<d', 'a\\"b&c<d', 'a&quot;b&amp;c&lt;d']);
  const r = redigirBytes(Buffer.from('x a&quot;b&amp;c&lt;d y'), ['a"b&c<d']);
  assert.equal(r.ocorrencias, 1);
  assert.equal(r.buffer.toString(), 'x [redigido] y');
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926, 'CRC-32 padrao (vetor de teste IEEE)');
});

test('E82: lista de segredos ignora curto, vazio e repetido', () => {
  const r = redigirConteudo('a SegredoForte123 b SegredoForte123', ['SegredoForte123', 'SegredoForte123', 'ab', '']);
  assert.equal(r.ocorrencias, 2, 'o repetido nao conta duas vezes');
  assert.equal(r.texto, 'a [redigido] b [redigido]');
});

test('GA38: JWT, Bearer e access/refresh_token sao redigidos sem conhecer o valor', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_';
  const entrada = `token ${jwt} e Authorization: Bearer ${jwt} e {"access_token":"abc123xyz","refresh_token":"rfrsh-456"} e url?a=1&access_token=abc123xyz`;
  const r = redigirPadroes(entrada);
  assert.equal(r.ocorrencias, 5, 'jwt x2 + bearer + access x2 (json e query) + refresh');
  assert.doesNotMatch(r.texto, /eyJ/);
  assert.doesNotMatch(r.texto, /abc123xyz/);
  assert.doesNotMatch(r.texto, /rfrsh-456/);
  assert.match(r.texto, /Bearer \[redigido\]/);
  // texto limpo nao muda nem conta
  const limpo = redigirPadroes('relatorio sem segredo nenhum');
  assert.equal(limpo.ocorrencias, 0);
  assert.equal(limpo.texto, 'relatorio sem segredo nenhum');
});

test('GA38: JWT dentro de ZIP solto e redigido e some da contagem de restantes', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_';
  const raiz = arvore();
  writeFileSync(join(raiz, 'data', 'trace.zip'), (function () {
    const nome = Buffer.from('trace.json');
    const dados = Buffer.from(JSON.stringify({ token: jwt }), 'utf8');
    const local = Buffer.alloc(30 + nome.length + dados.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt32LE(crc32(dados), 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    nome.copy(local, 30);
    dados.copy(local, 30 + nome.length);
    const central = Buffer.alloc(46 + nome.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc32(dados), 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(0, 42);
    nome.copy(central, 46);
    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0);
    fim.writeUInt16LE(1, 8);
    fim.writeUInt16LE(1, 10);
    fim.writeUInt32LE(central.length, 12);
    fim.writeUInt32LE(local.length, 16);
    return Buffer.concat([local, central, fim]);
  })());
  const r = redigirDiretorio(raiz, [`x-${EMAIL}-y`]);
  assert.ok(r.ocorrencias >= 1, 'o JWT do zip entra na contagem');
  assert.equal(contarRestantes(raiz, [`x-${EMAIL}-y`]), 0, 'nada legivel sobrevive');
});
