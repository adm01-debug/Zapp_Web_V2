import assert from 'node:assert/strict';
import test from 'node:test';

import {
  carregarIdentidadeEsperada,
  endurecerDestinoTls,
  extrairProjectRef,
  sha256,
  validarDestino,
  validarIdentidadeDoArtefato,
} from './database-identity.mjs';

const REF = 'tnnnlkbymytvtqngbbqh';
const ESPERADA = {
  project_ref_sha256: sha256(REF),
  database: 'postgres',
  schema: 'public',
  server_major: 17,
};

test('fingerprint versionado corresponde ao projeto oficial documentado', () => {
  const arquivo = new URL('./database-identity.json', import.meta.url);
  const identidade = carregarIdentidadeEsperada(arquivo);
  assert.equal(identidade.project_ref_sha256, sha256(REF));
  assert.equal(identidade.database, 'postgres');
  assert.equal(identidade.schema, 'public');
  assert.equal(identidade.server_major, 17);
});

test('extrai project-ref do host direto sem depender de senha', () => {
  assert.equal(
    extrairProjectRef('postgresql://postgres:segredo@db.' + REF + '.supabase.co:5432/postgres'),
    REF,
  );
});

test('extrai project-ref do usuario do pooler', () => {
  assert.equal(
    extrairProjectRef(
      'postgresql://postgres.' + REF + ':segredo@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
    ),
    REF,
  );
});

test('rejeita host parecido que nao e Supabase Cloud', () => {
  assert.equal(
    extrairProjectRef('postgresql://postgres.' + REF + ':segredo@evil.example/postgres'),
    null,
  );
});

test('valida destino oficial sem retornar credencial', () => {
  const erros = validarDestino(
    'postgresql://postgres.' + REF + ':senha-super-secreta@aws-0-sa-east-1.pooler.supabase.com:6543/postgres',
    ESPERADA,
  );
  assert.deepEqual(erros, []);
});

test('fixa sslmode verify-full quando o parametro esta ausente', () => {
  const resultado = endurecerDestinoTls(
    'postgresql://postgres.' + REF + ':senha@aws-0.pooler.supabase.com:6543/postgres',
  );
  assert.deepEqual(resultado.erros, []);
  const url = new URL(resultado.connectionString);
  assert.equal(url.searchParams.get('sslmode'), 'verify-full');
  assert.equal(url.searchParams.get('sslrootcert'), 'system');
});

test('preserva destino que ja exige TLS e CA do sistema', () => {
  const resultado = endurecerDestinoTls(
    'postgresql://postgres.' + REF + ':senha@aws-0.pooler.supabase.com:6543/postgres' +
    '?sslmode=verify-full&sslrootcert=system',
  );
  assert.deepEqual(resultado.erros, []);
  const url = new URL(resultado.connectionString);
  assert.equal(url.searchParams.get('sslmode'), 'verify-full');
  assert.equal(url.searchParams.get('sslrootcert'), 'system');
});

test('rejeita tentativa de downgrade TLS sem vazar credencial', () => {
  const resultado = endurecerDestinoTls(
    'postgresql://postgres.' + REF + ':senha-super-secreta@aws-0.pooler.supabase.com:6543/postgres?sslmode=require',
  );
  assert.equal(resultado.connectionString, null);
  assert.match(resultado.erros.join('\n'), /apenas verify-full/);
  assert.doesNotMatch(resultado.erros.join('\n'), /senha-super-secreta/);
});

test('rejeita CA customizada sem vazar credencial', () => {
  const resultado = endurecerDestinoTls(
    'postgresql://postgres.' + REF + ':outra-senha@aws-0.pooler.supabase.com:6543/postgres' +
    '?sslmode=verify-full&sslrootcert=%2Ftmp%2Fca-injetada.pem',
  );
  assert.equal(resultado.connectionString, null);
  assert.match(resultado.erros.join('\n'), /apenas sslrootcert=system/);
  assert.doesNotMatch(resultado.erros.join('\n'), /outra-senha|ca-injetada/);
});

test('falha para outro projeto usando apenas fingerprint na mensagem', () => {
  const erros = validarDestino(
    'postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:senha@aws-0.pooler.supabase.com:6543/postgres',
    ESPERADA,
  );
  assert.equal(erros.length, 1);
  assert.match(erros[0], /fingerprint divergente/);
  assert.doesNotMatch(erros.join('\n'), /senha|aaaaaaaaaaaaaaaaaaaa/);
});

test('falha para database diferente no mesmo projeto', () => {
  const erros = validarDestino(
    'postgresql://postgres.' + REF + ':senha@aws-0.pooler.supabase.com:6543/outro',
    ESPERADA,
  );
  assert.ok(erros.some((erro) => /database da DESTINO_URL/.test(erro)));
});

test('valida identidade estrutural retornada pelo SQL', () => {
  assert.deepEqual(
    validarIdentidadeDoArtefato(
      { database: 'postgres', schema: 'public', server_major: 17 },
      ESPERADA,
      'artefato',
    ),
    [],
  );
  assert.ok(
    validarIdentidadeDoArtefato(
      { database: 'postgres', schema: 'public', server_major: 16 },
      ESPERADA,
      'artefato',
    ).some((erro) => /server_major/.test(erro)),
  );
});
