import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  lerContrato,
  caminhoDoContrato,
  resolverInvocacao,
  extrairInvocacoes,
} from '../db-audit/run-runtime-contract.mjs';

const raiz = new URL('../../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');
const sha256 = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const CONTRATOS = new URL('../../scripts/db-audit/contracts/', import.meta.url);

test('E62: os 12 contratos sao ARQUIVOS, e o workflow nao tem mais nenhum braco embutido', () => {
  const y = ler('.github/workflows/db-migrate.yml');
  assert.equal(
    /^ {12}\d{14}\)\s*$/m.test(y),
    false,
    'nao pode sobrar braco de versao do case dentro do workflow',
  );
  assert.match(y, /run-runtime-contract\.mjs/, 'o passo tem de chamar o executor generico');
  // o guard continua: a comparacao com o sha confirmado (composicao da E64) sobreviveu
  assert.match(y, /confirmacao !== process\.env\.CONFIRM_RUNTIME_SHA256/, 'a comparacao do sha tem de continuar');
  assert.match(y, /if \(process\.env\.APPLY === 'true'/, 'e continuar condicionada ao apply');
  const arquivos = readdirSync(CONTRATOS).filter((f) => f.endsWith('.sql'));
  assert.equal(arquivos.length, 12, `esperava 12 contratos, achei ${arquivos.length}`);
});

test('E62: cada contrato e o texto do braco de origem (equivalencia pelo sha do documento)', () => {
  const doc = ler('docs/audits/evidence/db-migrate-contratos-historicos.md');
  const arquivos = readdirSync(CONTRATOS).filter((f) => f.endsWith('.sql'));
  let comFingerprint = 0;
  for (const f of arquivos) {
    const versao = f.replace('.sql', '');
    const texto = readFileSync(new URL(f, CONTRATOS), 'utf8').replace(/\n$/, '');
    const hash = sha256(texto).slice(0, 16);
    assert.ok(texto.trim().length > 0, `contrato ${versao} nao pode estar vazio`);
    assert.ok(doc.includes(versao), `o documento tem de citar a versao ${versao}`);
    assert.ok(doc.includes(hash), `o documento tem de registrar o sha256 de ${versao} (${hash}...)`);
    if (texto.includes('runtime_sha256')) comFingerprint += 1;
  }
  // Nao todos os alvos extraem o MESMO campo: 7 dos 12 trazem runtime_sha256 e os
  // outros 5 extraem outro fingerprint do mesmo guard. Exigir o campo em todos seria
  // inventar uma simetria que o contrato de origem nao tem.
  assert.ok(comFingerprint >= 7, `esperava ao menos 7 contratos com runtime_sha256, achei ${comFingerprint}`);
});

test('E62: o executor e FAIL-CLOSED — versao sem contrato nao vira "nada a verificar"', () => {
  // versao valida em formato, sem arquivo de contrato
  assert.throws(() => lerContrato('20990101000000'), /contrato de runtime ausente/);
  // versao em formato invalido
  assert.throws(() => lerContrato('abc'), /versao alvo invalida/);
  assert.throws(() => lerContrato(''), /versao alvo invalida/);
  assert.throws(() => caminhoDoContrato('20260830170000x'), /versao alvo invalida/);
});

const EXECUTOR = new URL('../db-audit/run-runtime-contract.mjs', import.meta.url);
const RAIZ = new URL('../../', import.meta.url).pathname;

// O CLI de verdade, como o workflow chama.
const rodaCli = (versao) =>
  spawnSync(process.execPath, ['scripts/db-audit/run-runtime-contract.mjs', versao], {
    cwd: RAIZ,
    encoding: 'utf8',
  });

// principal() num processo filho apontando para um diretorio de contratos
// sintetico: o exit code do processo e o do executor, sem precisar de psql.
const rodaExecutor = (versao, dir) =>
  spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { principal } from ${JSON.stringify(EXECUTOR.href)};` +
        ` principal(['node','x',${JSON.stringify(versao)}], { dir: ${JSON.stringify(dir)} });`,
    ],
    { cwd: RAIZ, encoding: 'utf8' },
  );

// So o executor emite "::error::" (o psql-safe emite "ERRO: DESTINO_URL ..."):
// e o prefixo que discrimina quem recusou — sem ele o teste fica verde por acaso.
test('E62: versao invalida sai com 2 e stdout vazio pelo PROPRIO executor', () => {
  for (const versao of ['abc', '']) {
    const r = rodaCli(versao);
    assert.equal(r.status, 2, `versao "${versao}": exit`);
    assert.equal(r.stdout, '', 'nao pode imprimir resultado para o workflow');
    assert.match(r.stderr, /::error::versao alvo invalida/, 'o erro tem de ser do executor');
  }
});

test('E62: contrato malformado sai com 2 e stdout vazio pelo PROPRIO executor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'contratos-'));
  try {
    // Um ramo generico valido ao lado: se um contrato malformado passasse pelo
    // parser, o executor seguiria ate o psql-safe e o stderr NAO teria
    // "::error::" — e isso que torna os casos "barra invertida" e "$A"/"$$"
    // vermelhos contra o parser que tratava o corpo do -c como SQL literal.
    writeFileSync(
      join(dir, '20990202000000.sql'),
      '            *)\n' +
        '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At \\\n' +
        '                -f scripts/db-audit/generic-migration-runtime.sql)\n',
    );
    const casos = {
      'forma nao declarada':
        '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At --file=algo.sql)\n',
      'flag desconhecida':
        '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At --evil -c "\n' +
        '                SELECT 1\n' +
        '              ")\n',
      'shell no -c':
        '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n' +
        '                RUNTIME=$(node y.mjs -c "select 1")\n' +
        '              ")\n',
      'barra invertida': // \n literal dentro do SQL: o bash entrega "\n", nao quebra de linha
        '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n' +
        "                SELECT 'a\\nb'\n" +
        '              ")\n',
      'expansao $A':
        '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n' +
        "                SELECT '$A'\n" +
        '              ")\n',
      'expansao $$':
        '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n' +
        '                SELECT 1 $$\n' +
        '              ")\n',
    };
    for (const [nome, texto] of Object.entries(casos)) {
      writeFileSync(join(dir, '20990101000000.sql'), texto);
      const r = rodaExecutor('20990101000000', dir);
      assert.equal(r.status, 2, `${nome}: exit`);
      assert.equal(r.stdout, '', `${nome}: stdout tem de ficar vazio`);
      assert.match(r.stderr, /::error::/, `${nome}: o erro tem de ser do executor, nao do psql-safe`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E62: versao sem contrato dedicado usa o generico e avisa SO no stderr', () => {
  const inv = resolverInvocacao('20990101000000');
  assert.equal(inv.generico, true, 'tem de resolver pelo contrato generico');
  assert.ok(inv.arquivo.endsWith('generic-migration-runtime.sql'), `arquivo do generico: ${inv.arquivo}`);
  const r = rodaCli('20990101000000');
  // O aviso nao pode ir para o stdout: e' la que o workflow faz JSON.parse.
  assert.equal(r.stdout, '', 'stdout tem de ficar vazio (e o canal do JSON da prova)');
  assert.match(r.stderr, /Sem contrato dedicado para 20990101000000/, 'o fallback e anunciado no stderr');
});

test('E62: o corpo do -c e string bash — escapes desfeitos e expansao recusada', () => {
  const contrato = (corpo) =>
    '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n' +
    `${corpo}\n` +
    '              ")';
  // Oraculo do bash: dentro de aspas duplas \" \\ \$ voltam a ser " \ $.
  const [inv] = extrairInvocacoes(
    contrato(String.raw`SELECT 'a\"b', 'c\\d', '\$e'`),
    '20260101000000',
    'sintetico',
  );
  assert.equal(inv.sql, `SELECT 'a"b', 'c\\d', '$e'`, 'escapes de aspas duplas tem de ser desfeitos');
  // e tudo que o bash expandiria (ou escape que ele nao define) e' recusado
  for (const corpo of [
    'SELECT $A',
    'SELECT $1',
    'SELECT $_',
    'SELECT 1 $$',
    'SELECT $(id)',
    'SELECT ${x}',
    'SELECT `id`',
    String.raw`SELECT 'a\nb'`,
  ]) {
    assert.throws(
      () => extrairInvocacoes(contrato(corpo), '20260101000000', 'sintetico'),
      /substituicao de shell|barra invertida/,
      `expansao/escape proibido foi aceito: ${corpo}`,
    );
  }
});

test('E62: os 7 contratos inline dedicados entregam ao psql o SQL que o BASH entrega', () => {
  const INLINE = [
    '20260830170000',
    '20260831120000',
    '20260831150000',
    '20260908180000',
    '20260908220000',
    '20260909120000',
    '20260909180000',
  ];
  const dir = mkdtempSync(join(tmpdir(), 'oraculo-bash-'));
  try {
    for (const versao of INLINE) {
      const texto = readFileSync(
        new URL(`../../scripts/db-audit/contracts/${versao}.sql`, import.meta.url),
        'utf8',
      );
      const [inv] = extrairInvocacoes(texto, versao, `${versao}.sql`);
      assert.ok(inv.sql, `${versao}: contrato inline`);
      // corpo bruto entre `-c "` e o ultimo `")`: o texto que o bash recebe
      const corpoBruto = texto.slice(texto.indexOf('-c "') + 4, texto.lastIndexOf('")'));
      const script = join(dir, `${versao}.sh`);
      writeFileSync(script, `printf '%s' "${corpoBruto}"\n`);
      const bash = spawnSync('bash', [script], { encoding: 'utf8' });
      assert.equal(bash.status, 0, `${versao}: bash ${bash.stderr}`);
      // O bash entrega um \n a mais no inicio (a quebra depois de `-c "`):
      // compara com trim dos dois lados.
      assert.equal(inv.sql, bash.stdout.trim(), `versao ${versao}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('E62: o contrato da versao 20260830170000 existe e nao esta vazio', () => {
  const sql = lerContrato('20260830170000');
  assert.ok(sql.trim().length > 100, 'contrato tem de ter conteudo real');
  assert.ok(existsSync(new URL('20260830170000.sql', CONTRATOS)));
});
