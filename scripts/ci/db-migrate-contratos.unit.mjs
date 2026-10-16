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
  invocacoesDosContratos,
  desfazerAspasDuplasBash,
} from '../db-audit/run-runtime-contract.mjs';

const raiz = new URL('../../', import.meta.url);
const ler = (p) => readFileSync(new URL(p, raiz), 'utf8');
const sha256 = (t) => createHash('sha256').update(t, 'utf8').digest('hex');
const CONTRATOS = new URL('../../scripts/db-audit/contracts/', import.meta.url);

test('E62: os contratos sao arquivos e o workflow valida o hash antes de aplicar', () => {
  const y = ler('.github/workflows/db-migrate.yml');
  assert.equal(
    /^ {12}\d{14}\)\s*$/m.test(y),
    false,
    'nao pode sobrar braco de versao do case dentro do workflow',
  );
  assert.match(y, /run-runtime-contract\.mjs/, 'o passo tem de chamar o executor generico');
  // o guard continua: a comparacao com o sha confirmado (composicao da E64) sobreviveu
  assert.match(y, /validate-runtime-proof\.mjs/, 'a prova deve ser validada pelo executor externo');
  assert.match(y, /if \[ "\$APPLY" = "true" \] && \[ "\$CONFIRMATION_HASH" != "\$CONFIRM_RUNTIME_SHA256" \]/, 'apply deve recusar hash composto divergente');
  const arquivos = readdirSync(CONTRATOS).filter((f) => f.endsWith('.sql'));
  assert.equal(arquivos.length, 13, `esperava 12 contratos históricos e o lote de 05/10, achei ${arquivos.length}`);
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

const envSemDestinoUrl = () => {
  // Teste unitario nunca deve alcancar banco: mesmo que o runner/CI tenha
  // DESTINO_URL valido, o filho roda sem ele e para no psql-safe local.
  const env = { ...process.env };
  delete env.DESTINO_URL;
  return env;
};

// O CLI de verdade, como o workflow chama.
const rodaCli = (versao) =>
  spawnSync(process.execPath, ['scripts/db-audit/run-runtime-contract.mjs', versao], {
    cwd: RAIZ,
    encoding: 'utf8',
    env: envSemDestinoUrl(),
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
    { cwd: RAIZ, encoding: 'utf8', env: envSemDestinoUrl() },
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
  // Nao exigimos stdout vazio aqui, porque esse canal pertence ao resultado do psql;
  // o que este teste prova e que o AVISO do fallback fica so no stderr.
  assert.doesNotMatch(r.stdout, /Sem contrato dedicado/, 'o aviso do fallback nao pode ir para stdout');
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

// ---------------------------------------------------------------------------
// Prova SEM banco do mesmo defeito (o que precisa de PostgreSQL 17 descartavel
// -- o texto de shell recusado pelo psql e o JSON das 3 classes -- roda no
// harness, e a saida dele esta no relato do cartao). Fica aqui, e nao num
// arquivo novo, porque `scripts/ci/*.unit.mjs` e glob que o CI executa em
// `node --test`: um `.test.sh` novo em scripts/db-audit sem passo nominal no
// db-guard.yml vira orfao para o check-test-inventory.
// ---------------------------------------------------------------------------

// As versoes suportadas e o contrato de cada uma, conforme os rotulos do `case`
// que originou os arquivos (E62). O agrupamento com `|` vale para todas as suas
// versoes.
const SUPORTADAS = {
  20260830170000: { sql: /get_team_profiles/ },
  20260831120000: { sql: /webhook_failures/ },
  20260831150000: { sql: /messages/ },
  20260908180000: { sql: /crm_contact_links/ },
  20260908220000: { sql: /crm_sync_outbox/ },
  20260909120000: { sql: /crm/ },
  20260909180000: { sql: /global_settings/ },
  20260909200000: { arquivo: 'scripts/db-audit/inbox-contact-authorization-runtime.sql' },
  20260909210000: { arquivo: 'scripts/db-audit/talkx-template-history-runtime.sql' },
  20260909220000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260909230000: { arquivo: 'scripts/db-audit/talkx-template-history-runtime.sql' },
  20260909240000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260909250000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260909260000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260909270000: { arquivo: 'scripts/db-audit/message-delivery-phase1-runtime.sql' },
  20260910100000: { arquivo: 'scripts/db-audit/talkx-blacklist-policy-runtime.sql' },
  20260912130000: { arquivo: 'scripts/db-audit/talkx-recovery-runtime.sql' },
  20260912140000: { arquivo: 'scripts/db-audit/talkx-recovery-runtime.sql' },
  20260922220000: { arquivo: 'scripts/db-audit/notification-delivery-atomicity-runtime.sql' },
  20261004195051: { arquivo: 'scripts/db-audit/generic-migration-runtime.sql' },
};

test('E62: as versoes suportadas resolvem para o contrato do case de origem', () => {
  for (const [versao, esperado] of Object.entries(SUPORTADAS)) {
    const invocacao = resolverInvocacao(versao);
    assert.equal(invocacao.generico, false, `${versao} tem de ter contrato dedicado`);
    if (esperado.arquivo) assert.equal(invocacao.arquivo, esperado.arquivo, `contrato de ${versao}`);
    if (esperado.sql) assert.match(invocacao.sql ?? '', esperado.sql, `SQL de ${versao}`);
    for (const arquivo of [invocacao.arquivo].filter(Boolean)) {
      assert.ok(
        readFileSync(new URL(`../../${arquivo}`, import.meta.url), 'utf8').length > 0,
        `o arquivo declarado por ${versao} tem de existir no repo: ${arquivo}`,
      );
    }
  }
  // O generico e unico: sem ele o inventario nao teria fallback.
  const { generico } = invocacoesDosContratos();
  assert.equal(generico.arquivo, 'scripts/db-audit/generic-migration-runtime.sql');
});

test('E62: todo o inventario de supabase/migrations resolve (dedicado ou generico)', () => {
  // O defeito R2-INF-004 derrubava o passo justamente aqui: versao sem contrato
  // dedicado ("767 versoes" na auditoria) nao podia abortar o preflight.
  const versoes = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
    .filter((f) => /^\d{14}_.*\.sql$/.test(f))
    .map((f) => f.slice(0, 14));
  assert.ok(versoes.length > 700, `inventario pequeno demais: ${versoes.length}`);
  let dedicadas = 0;
  for (const versao of versoes) {
    const invocacao = resolverInvocacao(versao);
    if (invocacao.generico) {
      assert.equal(
        invocacao.arquivo,
        'scripts/db-audit/generic-migration-runtime.sql',
        `fallback de ${versao}`,
      );
    } else {
      dedicadas += 1;
    }
  }
  assert.equal(dedicadas, Object.keys(SUPORTADAS).length, 'dedicadas = versoes suportadas do case');
});

test('E62: o parser recusa SQL sem ON_ERROR_STOP, shell sem SQL e continuacao de linha', () => {
  const inline = (corpo) =>
    '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n' + `${corpo}\n` + '              ")';
  const recusa = (texto, esperado, rotulo) =>
    assert.throws(() => extrairInvocacoes(texto, '20260101000000', 'sintetico'), esperado, rotulo);
  recusa(
    '              RUNTIME=$(node x.mjs -X -At -c "\n                SELECT 1\n              ")',
    /ON_ERROR_STOP/,
    'SQL sem -v ON_ERROR_STOP=1',
  );
  recusa(inline('echo oi'), /nao comeca por WITH\/SELECT\/VALUES/, 'texto de shell sem SQL');
  recusa(
    '              RUNTIME=$(node x.mjs -X -v ON_ERROR_STOP=1 -At -c "\n' +
      '                RUNTIME=$(node y.mjs -c "select 1")\n' +
      '              ")',
    /substituicao de shell|fechamento/,
    'shell dentro do -c',
  );
  assert.throws(() => resolverInvocacao('abc'), /versao alvo invalida/);
  // Continuacao de linha do bash (barra + newline) tem de sumir, como no bash.
  assert.equal(desfazerAspasDuplasBash('linha1\\\nlinha2', 'sintetico'), 'linha1linha2');
});
