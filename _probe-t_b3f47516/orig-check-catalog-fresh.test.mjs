import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { sha256 } from './database-identity.mjs';

const SCRIPT = fileURLToPath(new URL('./check-catalog-fresh.mjs', import.meta.url));
const ROOT = path.resolve(path.dirname(SCRIPT), '../..');
const PROJECT_REF = 'tnnnlkbymytvtqngbbqh';
const DESTINO_URL =
  'postgresql://postgres.' + PROJECT_REF + ':senha-nao-pode-vazar' +
  '@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';

const base = {
  format_version: 2,
  generated_at: '2026-08-29',
  source: 'postgres schema public',
  database_identity: { database: 'postgres', schema: 'public', server_major: 17 },
  how_to_regenerate: 'scripts/db-audit/catalog.sql',
  tables: ['contacts', 'gmail_accounts'],
  views: ['gmail_accounts_safe'],
  columns: [
    'contacts.id:uuid:not-null',
    'gmail_accounts.id:uuid:not-null',
  ],
  functions: ['get_gmail_tokens', 'store_gmail_tokens'],
  function_signatures: [
    'get_gmail_tokens(uuid)->jsonb|kind=f',
    'store_gmail_tokens(uuid, text)->void|kind=f',
  ],
  check_constraints: [
    "contacts.contacts_email_nonempty:CHECK ((email <> ''::text))",
    'gmail_accounts.gmail_accounts_status_check:CHECK ((status = ANY (ARRAY[\'active\'::text, \'revoked\'::text])))',
  ],
};

function executar(commitado, fresco, opcoes = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-fresh-test-'));
  const catalogoPath = path.join(tmp, 'catalogo.json');
  const frescoPath = path.join(tmp, 'fresco.json');
  const identidadePath = path.join(tmp, 'identidade.json');
  fs.writeFileSync(catalogoPath, JSON.stringify(commitado));
  fs.writeFileSync(frescoPath, typeof fresco === 'string' ? fresco : JSON.stringify(fresco));
  fs.writeFileSync(identidadePath, JSON.stringify({
    format_version: 1,
    connection_provider: 'supabase-cloud',
    project_ref_sha256: sha256(PROJECT_REF),
    database: 'postgres',
    schema: 'public',
    server_major: 17,
  }));
  const result = spawnSync(process.execPath, [SCRIPT, frescoPath], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      CATALOG_PATH: catalogoPath,
      CATALOG_IDENTITY_PATH: identidadePath,
      DESTINO_URL: DESTINO_URL,
      ...opcoes.env,
    },
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  return result;
}

test('aceita conjuntos identicos em ordem diferente', () => {
  const fresco = Object.fromEntries(
    Object.entries(base).map(([chave, valor]) => [chave, Array.isArray(valor) ? [...valor].reverse() : valor]),
  );
  const result = executar(base, fresco);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK: catalogo em sincronia/);
});

test('falha quando surge coluna nova no banco', () => {
  const fresco = { ...base, columns: [...base.columns, 'contacts.workspace_id:uuid:nullable'] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contacts\.workspace_id:uuid:nullable/);
});

test('falha quando o tipo de uma coluna muda', () => {
  const fresco = { ...base, columns: ['contacts.id:text:not-null', base.columns[1]] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contacts\.id:text:not-null/);
});

test('falha quando a nulabilidade de uma coluna muda', () => {
  const fresco = { ...base, columns: ['contacts.id:uuid:nullable', base.columns[1]] };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contacts\.id:uuid:nullable/);
});

test('falha quando surge funcao nova no banco', () => {
  const fresco = {
    ...base,
    functions: [...base.functions, 'encrypt_gmail_token'],
    function_signatures: [
      ...base.function_signatures,
      'encrypt_gmail_token(text)->text|kind=f',
    ],
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /encrypt_gmail_token/);
});

test('falha quando surge overload com o mesmo nome de funcao', () => {
  const fresco = {
    ...base,
    function_signatures: [
      ...base.function_signatures,
      'get_gmail_tokens(uuid, boolean)->jsonb|kind=f',
    ],
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /get_gmail_tokens\(uuid, boolean\)->jsonb\|kind=f/);
});

test('falha quando retorno de funcao muda', () => {
  const fresco = {
    ...base,
    function_signatures: [
      'get_gmail_tokens(uuid)->text|kind=f',
      base.function_signatures[1],
    ],
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /get_gmail_tokens\(uuid\)->text\|kind=f/);
});

test('falha quando identidade estrutural aponta para outro database', () => {
  const fresco = {
    ...base,
    source: 'outro schema public',
    database_identity: { ...base.database_identity, database: 'outro' },
  };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /database esperado="postgres" obtido="outro"/);
});

test('falha quando DESTINO_URL aponta para outro projeto sem vazar credencial', () => {
  const result = executar(base, base, {
    env: {
      DESTINO_URL:
        'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:senha-ultrassecreta' +
        '@aws-0.pooler.supabase.com:6543/postgres',
    },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /fingerprint divergente/);
  assert.doesNotMatch(result.stderr + result.stdout, /senha-ultrassecreta|aaaaaaaaaaaaaaaaaaaa/);
});

test('falha fechado sem DESTINO_URL', () => {
  const result = executar(base, base, { env: { DESTINO_URL: '' } });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /DESTINO_URL ausente/);
});

test('falha fechado quando uma secao obrigatoria esta ausente', () => {
  const { columns: _columns, ...semColunas } = base;
  const result = executar(semColunas, base);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[columns\] secao ausente ou invalida/);
});

test('retorna 2 quando uma secao obrigatoria falta no catalogo fresco', () => {
  const { function_signatures: _signatures, ...fresco } = base;
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /\[function_signatures\] secao ausente ou invalida no catalogo fresco/);
});

test('retorna 2 quando how_to_regenerate e invalido no catalogo fresco', () => {
  const fresco = { ...base, how_to_regenerate: 'script-nao-oficial.sql' };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /how_to_regenerate ausente ou invalido no catalogo fresco/);
});

test('retorna 1 quando how_to_regenerate e invalido no catalogo commitado', () => {
  const commitado = { ...base, how_to_regenerate: 'script-antigo.sql' };
  const result = executar(commitado, base);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /how_to_regenerate ausente ou invalido no catalogo commitado/);
});

test('falha fechado quando o catalogo contem entrada duplicada', () => {
  const fresco = { ...base, functions: [...base.functions, base.functions[0]] };
  const result = executar(base, fresco);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /entradas duplicadas no catalogo fresco/);
});

test('falha fechado para JSON fresco malformado', () => {
  const result = executar(base, '{invalido');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /catalogo fresco invalido/);
});

test('rejeita caminho fresco relativo que escapa das raizes permitidas', () => {
  const result = spawnSync(process.execPath, [SCRIPT, '../../../../etc/passwd'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      CATALOG_PATH: 'supabase/schema-catalog.json',
      CATALOG_IDENTITY_PATH: 'scripts/db-audit/database-identity.json',
      DESTINO_URL,
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fora das raizes permitidas/);
});

test('rejeita CATALOG_PATH absoluto fora das raizes permitidas', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-fresh-escape-'));
  const frescoPath = path.join(tmp, 'fresco.json');
  fs.writeFileSync(frescoPath, JSON.stringify(base));
  const result = spawnSync(process.execPath, [SCRIPT, frescoPath], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      CATALOG_PATH: path.resolve(ROOT, '..', '..', 'catalogo-fora.json'),
      CATALOG_IDENTITY_PATH: 'scripts/db-audit/database-identity.json',
      DESTINO_URL,
    },
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /fora das raizes permitidas/);
});

// TL-050 (refazer): coerencia entre os artefatos derivados do banco COMMITADOS.
// O guard de acoplamento (supabase-usage-guard.mjs) roda offline contra o
// schema-catalog.json; as outras baselines (retrato canonico, publicacao Realtime e
// grants) descrevem o MESMO banco. Catalogo mais velho que elas deixa o guard
// falso-positivo — o objeto existe no banco, com RLS, e o `.from()` reprova. Este
// teste le os quatro arquivos commitados e exige que o catalogo cubra o que os
// outros tres citam; o valor esperado vem dos artefatos gerados pelo banco, nao do
// proprio catalogo. Cobre os dois sentidos: sobrando objeto no catalogo tambem e
// falha (o banco deixou de ter o objeto).
function lerArtefato(relativo) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativo), 'utf8'));
}

// Nomes escolhidos a mao pelo banco vem entre aspas na assinatura estavel do
// manifesto (`conversation_tasks."position"`); nas colunas do catalogo saem sem.
const semAspas = (nome) => nome.replace(/"/gu, '');

test('catalogo commitado cobre os objetos que os outros artefatos do banco citam', () => {
  const catalogo = lerArtefato('supabase/schema-catalog.json');
  const manifesto = lerArtefato('supabase/schema-manifest.json');
  const realtime = lerArtefato('scripts/db-audit/realtime-publication-baseline.json');
  const grants = lerArtefato('scripts/db-audit/grants-baseline.json');

  const tabelas = new Set(catalogo.tables);
  const relacoes = new Set([...catalogo.tables, ...catalogo.views]);

  const semRlsNoCatalogo = Object.keys(manifesto.rls).filter((t) => !tabelas.has(t)).sort();
  assert.deepEqual(
    semRlsNoCatalogo,
    [],
    'tabela com RLS no schema-manifest.json e ausente do schema-catalog.json',
  );

  const colunasDoCatalogo = new Set(catalogo.columns.map((c) => semAspas(c.split(':')[0])));
  const semColunaNoCatalogo = Object.keys(manifesto.columns)
    .map(semAspas)
    .filter((c) => !colunasDoCatalogo.has(c))
    .sort();
  assert.deepEqual(
    semColunaNoCatalogo,
    [],
    'coluna do schema-manifest.json ausente do schema-catalog.json',
  );

  const foraDaPublicacao = realtime.tables
    .map((t) => t.split('.').pop())
    .filter((t) => !relacoes.has(t))
    .sort();
  assert.deepEqual(
    foraDaPublicacao,
    [],
    'tabela da realtime-publication-baseline.json ausente do schema-catalog.json',
  );

  const foraDosGrants = grants.anon_table_select
    .filter((t) => !relacoes.has(t))
    .sort();
  assert.deepEqual(
    foraDosGrants,
    [],
    'tabela do anon_table_select em grants-baseline.json ausente do schema-catalog.json',
  );
});

test('a secao tables do catalogo nao perde relacao que o retrato canonico cita', () => {
  // Sentido inverso: relacao que so o catalogo tem e o retrato canonico nao cita
  // significa catalogo escrito a mao/adiantado em relacao ao banco.
  const catalogo = lerArtefato('supabase/schema-catalog.json');
  const manifesto = lerArtefato('supabase/schema-manifest.json');
  const tabelas = new Set(catalogo.tables);
  const citadasPeloManifesto = new Set([
    ...Object.keys(manifesto.rls),
    ...Object.keys(manifesto.columns).map((c) => semAspas(c.split(':')[0]).split('.')[0]),
  ]);
  const soNoCatalogo = [...tabelas].filter((t) => !citadasPeloManifesto.has(t)).sort();
  assert.deepEqual(soNoCatalogo, [], 'tabela do schema-catalog.json que o retrato canonico nao cita');
});
