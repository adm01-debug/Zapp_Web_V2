import assert from 'node:assert/strict';
import test from 'node:test';

import {
  carregarIdentidadeEsperada,
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
