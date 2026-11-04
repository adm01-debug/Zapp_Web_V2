import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  conditionAllows, conditionOf, jobOf, jobsOf, nestedValue, onlyStep,
  shellCode, stepsOf, valueOf,
} from './workflow-test-support.mjs';
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

test('E82: o workflow só publica o diretório público após o redator do controller', () => {
  const y = readFileSync(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');
  const steps = stepsOf(jobOf(y, 'e2e-logado'));
  const controller = onlyStep(steps, (s) => /^\s*bash scripts\/e2e-isolated\/run\.sh suite\b/m.test(shellCode(s)), 'controller isolado');
  const controllerId = valueOf(controller, 'id');
  assert.ok(controllerId, 'o gate referencia o produtor real do resumo redigido');
  assert.doesNotMatch(y, /secrets\.(?:E2E_TEST_EMAIL|E2E_TEST_PASSWORD)/);
  const uploads = [...jobsOf(y)].flatMap(([id, job]) => stepsOf(job)
    .filter((s) => (valueOf(s, 'uses') ?? '').startsWith('actions/upload-artifact@')).map((step) => ({ id, step })));
  assert.ok(uploads.length > 0, 'o relatorio redigido continua sendo arquivado');
  for (const { id, step } of uploads) {
    assert.equal(id, 'e2e-logado', 'o upload precisa usar o relatorio redigido no mesmo job');
    assert.ok(steps.indexOf(step) > steps.indexOf(controller), 'todo upload vem depois do controller e sua redacao');
    assert.match(valueOf(step, 'uses'), /^actions\/upload-artifact@[0-9a-f]{40}$/);
    assert.equal(nestedValue(step, 'with', 'path'), '${{ runner.temp }}/e2e-isolated-suite-${{ matrix.name }}/public');
    assert.equal(nestedValue(step, 'with', 'retention-days'), '3');
    assert.equal(nestedValue(step, 'with', 'if-no-files-found'), 'error');
    for (const failed of [false, true]) for (const ready of ['true', 'false', '', undefined]) {
      const allowed = conditionAllows(conditionOf(step), {
        'failure()': failed, 'success()': !failed, 'always()': true, 'cancelled()': false,
        [`steps.${controllerId}.outputs.report_ready`]: ready,
      });
      assert.equal(allowed, ready === 'true', 'upload exige redacao bem-sucedida, inclusive ao diagnosticar falha');
    }
  }
});

test('E82: nomes de artifacts nao colidem entre grupos, runs ou retentativas', () => {
  const y = readFileSync(new URL('../../.github/workflows/e2e-logado.yml', import.meta.url), 'utf8');
  const job = jobOf(y, 'e2e-logado');
  const groups = [...job.matchAll(/^ {10}- name: (.+)$/gm)].map((match) => match[1]);
  const upload = onlyStep(stepsOf(job), (s) => (valueOf(s, 'uses') ?? '').startsWith('actions/upload-artifact@'), 'artifact E2E');
  const template = nestedValue(upload, 'with', 'name');
  const names = [];
  for (const group of groups) for (const run of [101, 102]) for (const attempt of [1, 2]) {
    const context = { 'matrix.name': group, 'github.run_id': run, 'github.run_attempt': attempt };
    names.push(template.replace(/\$\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      assert.ok(Object.hasOwn(context, key), `contexto nao simulado: ${key}`);
      return context[key];
    }));
  }
  assert.ok(groups.length > 1);
  assert.equal(new Set(names).size, names.length, 'upload-artifact exige nomes unicos; overwrite apagaria o diagnostico anterior');
  assert.notEqual(nestedValue(upload, 'with', 'overwrite'), 'true');
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
