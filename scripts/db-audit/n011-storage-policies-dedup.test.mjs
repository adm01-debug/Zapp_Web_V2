#!/usr/bin/env node
// N-011 (P2 · banco, achado SEC-DEFINER_GRANTS_STORAGE-07): ausencia de policies de
// leitura/exclusao redundantes em storage.objects.
//
// Prova OFFLINE, sem docker: roda em qualquer runner (inclusive no espelho do CI do
// E47, que FINJE o docker e nao aplica migration). Le os ARQUIVOS REAIS de
// supabase/migrations/ na ordem de versao e simula o estado final das policies de
// storage.objects, aplicando cada CREATE POLICY / DROP POLICY / ALTER POLICY.
// Nada de CREATE POLICY copiado para dentro do teste.
//
// O que o contrato prova (replay das migrations da main):
//   (a) NENHUM par de policies do mesmo bucket+verbo tem papel+USING+WITH CHECK
//       identicos. Policies permissivas combinam por OR, entao o par identico so
//       amplia a superficie de revisao sem mudar o acesso — esta e a invariante do
//       N-011 e vale para todos os buckets de storage.objects;
//   (b) ha UMA policy canonica por bucket+verbo de leitura/exclusao em avatars,
//       stickers, audio-memes (SELECT) e custom-emojis, com os nomes originais;
//   (c) audio-memes/DELETE tem DUAS policies por DESIGN — dono (foldername =
//       auth.uid) e admin (is_admin_or_supervisor) —, com predicados diferentes:
//       nao e duplicata e nao pode ser "deduplicada";
//   (d) os nomes redundantes do N-011 ("Avatar images are publicly accessible",
//       "Users can delete their own avatars") e o par publico de SELECT de avatars
//       ("Anyone can view avatars") NAO existem no estado final: as duas remocoes
//       foram consumadas por 20261009182648_avatars_bucket_private (bucket privado)
//       ANTES do fix, e nenhuma migration posterior os recria;
//   (e) o fix (20261016105108) e idempotente e so contem DROP POLICY IF EXISTS dos
//       2 nomes redundantes — nenhuma DDL alheia, nenhuma policy viva tocada;
//   (f) o bloco `-- Rollback:` da migration recria as 2 policies no bucket+verbo
//       corretos (avatars/SELECT e avatars/DELETE, TO authenticated).
//
// Vermelho: N011_WITHOUT_FIX=1 (ou a migration do fix ausente do disco) deixa o texto
// do fix vazio, entao os testes de conteudo/rollback/idempotencia do ARQUIVO falham.
// Os testes de ESTADO continuam verdes de proposito: a redundancia ja nao existia
// quando o fix foi escrito (20261009182648 a removeu em 2026-10-09), e o teste nao
// finge um estado anterior que o repositorio nao produz.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirMig = join(raiz, 'supabase', 'migrations');
const FIX = '20261016105108_n011_storage_drop_duplicate_avatar_policies.sql';
const caminhoFix = join(dirMig, FIX);
// Dois gatilhos para rodar com o texto do fix vazio: a variavel N011_WITHOUT_FIX=1 e
// a ausencia do proprio arquivo da migration no disco — assim a prova vermelha
// tambem vale "worktree da base + so o teste".
const semFix = process.env.N011_WITHOUT_FIX === '1' || !existsSync(caminhoFix);

const ler = (caminho) => readFileSync(caminho, 'utf8');
// Texto do fix: vazio na rodada SEM FIX (arquivo ausente do disco ou N011_WITHOUT_FIX=1)
// — os testes de conteudo/rollback/idempotencia do arquivo entao falham, que e a prova
// vermelha; os de estado seguem verdes porque o estado nao depende do fix.
const lerFix = () => (semFix ? '' : ler(caminhoFix));
const normaliza = (txt) => txt.replace(/\s+/g, ' ').trim();

const TAG_DOLAR = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

// Quebra o SQL em statements, respeitando aspas, identificadores e dollar-quote.
function divide(sql) {
  const stmts = [];
  let buf = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (sql.startsWith('--', i)) {
      const j = sql.indexOf('\n', i);
      i = j < 0 ? sql.length : j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j += 1;
          break;
        }
        j += 1;
      }
      buf += sql.slice(i, j);
      i = j;
      continue;
    }
    if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      const fim = j < 0 ? sql.length : j + 1;
      buf += sql.slice(i, fim);
      i = fim;
      continue;
    }
    if (c === '$') {
      const m = sql.slice(i).match(new RegExp('^' + TAG_DOLAR.source));
      if (m) {
        const tag = m[0];
        const j = sql.indexOf(tag, i + tag.length);
        if (j < 0) { buf += sql.slice(i); i = sql.length; }
        else { buf += sql.slice(i, j + tag.length); i = j + tag.length; }
        continue;
      }
    }
    if (c === ';') {
      stmts.push(buf);
      buf = '';
      i += 1;
      continue;
    }
    buf += c;
    i += 1;
  }
  if (buf.trim()) stmts.push(buf);
  return stmts.map((s) => s.trim()).filter(Boolean);
}

// Conteudo balanceado de `palavra (` ... `)` (USING / WITH CHECK).
function clausula(texto, palavra) {
  const re = new RegExp(palavra + '\\s*\\(', 'i');
  const m = texto.match(re);
  if (!m) return null;
  const inicio = m.index + m[0].length;
  let prof = 1;
  for (let i = inicio; i < texto.length; i += 1) {
    if (texto[i] === '(') prof += 1;
    else if (texto[i] === ')') {
      prof -= 1;
      if (prof === 0) return normaliza(texto.slice(inicio, i));
    }
  }
  return null;
}

const RE_CP = /^create\s+policy\s+(?:"([^"]+)"|([A-Za-z0-9_]+))\s+on\s+storage\.objects\b([\s\S]*)$/i;
const RE_DP = /^drop\s+policy\s+(if\s+exists\s+)?(?:"([^"]+)"|([A-Za-z0-9_]+))\s+on\s+storage\.objects\s*$/i;
const RE_AP = /^alter\s+policy\s+(?:"([^"]+)"|([A-Za-z0-9_]+))\s+on\s+storage\.objects\b([\s\S]*)$/i;
const RE_CMD = /\bFOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b/i;
const RE_ROLES = /\bTO\s+([^()]*?)(?=\bUSING\b|\bWITH\s+CHECK\b|$)/i;
const RE_BUCKET = /bucket_id\s*=\s*'([^']*)'/;

const assinatura = (reg) => [reg.cmd.toUpperCase(), reg.roles, reg.using, reg.withCheck].join(' | ');

function bucketDe(using, withCheck) {
  for (const txt of [using, withCheck]) {
    if (txt) {
      const m = txt.match(RE_BUCKET);
      if (m) return m[1];
    }
  }
  return null;
}

function parseCriacao(resto) {
  const mCmd = resto.match(RE_CMD);
  const mRoles = resto.match(RE_ROLES);
  const using = clausula(resto, '\\bUSING');
  const withCheck = clausula(resto, '\\bWITH\\s+CHECK');
  return {
    cmd: mCmd ? mCmd[1].toUpperCase() : 'ALL',
    roles: mRoles ? normaliza(mRoles[1]) : 'public',
    using,
    withCheck,
    bucket: bucketDe(using, withCheck),
  };
}

// Estado final (nome -> registro) das policies de storage.objects.
function estado(arquivos) {
  const pol = new Map();
  for (const caminho of arquivos) {
    for (const st of divide(ler(caminho))) {
      let m = st.match(RE_CP);
      if (m) {
        pol.set(m[1] ?? m[2], parseCriacao(m[3]));
        continue;
      }
      m = st.match(RE_AP);
      if (m) {
        const nome = m[1] ?? m[2];
        assert.ok(pol.has(nome), `ALTER POLICY em policy inexistente (${nome}) em ${basename(caminho)}`);
        const reg = pol.get(nome);
        const mRoles = m[3].match(RE_ROLES);
        if (mRoles) reg.roles = normaliza(mRoles[1]);
        const using = clausula(m[3], '\\bUSING');
        const withCheck = clausula(m[3], '\\bWITH\\s+CHECK');
        if (using !== null) reg.using = using;
        if (withCheck !== null) reg.withCheck = withCheck;
        reg.bucket = bucketDe(reg.using, reg.withCheck);
        continue;
      }
      m = st.match(RE_DP);
      if (m) pol.delete(m[2] ?? m[3]);
    }
  }
  return pol;
}

const arquivosTodos = readdirSync(dirMig)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => join(dirMig, f));

const arquivosBase = arquivosTodos.filter((a) => a !== caminhoFix);
const antes = estado(arquivosBase);
const depois = semFix ? estado(arquivosBase) : estado(arquivosTodos);

const grupo = (tab, bucket, cmd) =>
  [...tab.entries()].filter(([, r]) => r.bucket === bucket && r.cmd === cmd).map(([n]) => n).sort();

// Uma policy canonica por bucket+verbo de leitura/exclusao no estado final.
const CANONICAS = [
  ['avatars', 'SELECT', 'avatars authenticated read'],
  ['avatars', 'DELETE', 'Users can delete their own avatar'],
  ['stickers', 'SELECT', 'Anyone can view stickers'],
  ['stickers', 'DELETE', 'Users can delete own stickers'],
  ['audio-memes', 'SELECT', 'Public read audio memes'],
  ['custom-emojis', 'SELECT', 'Public read for custom emojis'],
  ['custom-emojis', 'DELETE', 'Users can delete own custom emojis'],
];

// audio-memes/DELETE tem DUAS policies por design: dono e admin, com predicados
// diferentes — nao e o par redundante que o N-011 combate.
const AUDIO_MEMES_DELETE = ['Admins can delete any audio meme', 'Users can delete own audio memes'];

// Nomes que o N-011 tirou de cena e que NAO podem voltar: as duas de SELECT de
// avatars duplicavam entre si e a plural duplicava o DELETE singular.
const REDUNDANTES = [
  'Anyone can view avatars',
  'Avatar images are publicly accessible',
  'Users can delete their own avatars',
];
// Os 2 nomes que a migration de fix se propoe a apagar (DROP POLICY IF EXISTS).
const FIX_DROPS = ['Avatar images are publicly accessible', 'Users can delete their own avatars'];

console.log(`FATO: migrations lidas = ${arquivosBase.length}`);
console.log(`FATO: modo = ${semFix ? 'SEM FIX (estado anterior)' : 'com o fix aplicado'}`);
console.log(`FATO: policies de storage.objects antes=${antes.size} depois=${depois.size}`);
for (const [bucket, cmd, nome] of CANONICAS) {
  console.log(`FATO: ${bucket}/${cmd} depois=[${grupo(depois, bucket, cmd).join(', ')}] (canonica "${nome}")`);
}
console.log(`FATO: audio-memes/DELETE depois=[${grupo(depois, 'audio-memes', 'DELETE').join(', ')}]`);
console.log(`FATO: redundantes ausentes no estado final = ${REDUNDANTES.filter((n) => !depois.has(n)).length}/${REDUNDANTES.length}`);

test('nenhum par de policies do mesmo bucket+verbo tem papel+USING+WITH CHECK identicos', () => {
  const duplicados = [];
  const vistos = new Map();
  for (const [nome, reg] of [...depois.entries()].sort()) {
    const chave = `${reg.bucket ?? '?'} | ${assinatura(reg)}`;
    if (vistos.has(chave)) duplicados.push([vistos.get(chave), nome]);
    else vistos.set(chave, nome);
  }
  assert.deepEqual(duplicados, []);
});

for (const [bucket, cmd, nome] of CANONICAS) {
  test(`${bucket}/${cmd}: exatamente 1 policy ("${nome}")`, () => {
    assert.deepEqual(grupo(depois, bucket, cmd), [nome]);
  });
  test(`${bucket}/${cmd}: a canonica nao muda de assinatura com o fix`, () => {
    assert.deepEqual(depois.get(nome), antes.get(nome));
  });
}

test('audio-memes/DELETE: dono + admin com predicados distintos (nao e duplicata)', () => {
  assert.deepEqual(grupo(depois, 'audio-memes', 'DELETE'), [...AUDIO_MEMES_DELETE].sort());
  assert.notEqual(
    assinatura(depois.get(AUDIO_MEMES_DELETE[1])),
    assinatura(depois.get(AUDIO_MEMES_DELETE[0])),
  );
});

test('os nomes redundantes do N-011 nao existem no estado final', () => {
  assert.deepEqual(REDUNDANTES.filter((n) => depois.has(n)), []);
});

test('nenhuma migration posterior ao fix recria as policies redundantes', () => {
  const versao = (caminho) => basename(caminho).split('_')[0];
  const versaoFix = versao(caminhoFix);
  const recriadas = [];
  for (const caminho of arquivosTodos) {
    if (versao(caminho) <= versaoFix) continue;
    for (const st of divide(ler(caminho))) {
      const m = st.match(RE_CP);
      const nome = m ? (m[1] ?? m[2]) : null;
      if (REDUNDANTES.includes(nome)) recriadas.push(`${basename(caminho)}: ${nome}`);
    }
  }
  assert.deepEqual(recriadas, []);
});

test('o fix so mexe em avatars: nenhuma policy de outro bucket muda', () => {
  const outros = (tab) => [...tab.entries()].filter(([, r]) => r.bucket !== 'avatars').sort();
  assert.deepEqual(outros(depois), outros(antes));
});

test('o fix nao muda o total: as 2 remocoes ja foram consumadas pela 20261009182648', () => {
  assert.equal(depois.size, antes.size);
});

test('o fix nao tem DDL alheia: so DROP POLICY IF EXISTS das 2 redundantes', () => {
  const alheios = [];
  const nomes = [];
  for (const st of divide(lerFix())) {
    const m = st.match(RE_DP);
    const nome = m ? (m[2] ?? m[3]) : null;
    if (m && m[1] && FIX_DROPS.includes(nome)) nomes.push(nome);
    else alheios.push(normaliza(st).slice(0, 100));
  }
  assert.deepEqual(alheios, []);
  assert.deepEqual(nomes.sort(), [...FIX_DROPS].sort());
});

const linhasFix = lerFix().split('\n');

test('a 1a linha da migration e o cabecalho `-- <slug>`', () => {
  assert.ok(linhasFix[0].startsWith('-- '));
  assert.ok(!linhasFix[0].startsWith('-- Rollback'));
});

test('a 2a linha da migration comeca com `-- Rollback:`', () => {
  assert.ok(linhasFix[1].startsWith('-- Rollback:'));
});

test('o bloco `-- Rollback:` tem 2 CREATE POLICY executaveis', () => {
  const stmts = divide(linhasFix[1].split('Rollback:')[1].trim());
  assert.equal(stmts.length, 2);
  stmts.forEach((st) => assert.match(st, RE_CP));
});

test('o rollback recria as 2 policies removidas', () => {
  const stmts = divide(linhasFix[1].split('Rollback:')[1].trim());
  const nomes = stmts.map((st) => {
    const m = st.match(RE_CP);
    return m ? (m[1] ?? m[2]) : null;
  }).filter(Boolean);
  assert.deepEqual(nomes.sort(), [...FIX_DROPS].sort());
});

test('o rollback recria cada policy no bucket+verbo que ela cobria (avatars SELECT/DELETE)', () => {
  const alvos = new Map([
    ['Avatar images are publicly accessible', 'avatars | SELECT'],
    ['Users can delete their own avatars', 'avatars | DELETE'],
  ]);
  for (const st of divide(linhasFix[1].split('Rollback:')[1].trim())) {
    const m = st.match(RE_CP);
    assert.ok(m, `rollback com statement que nao e CREATE POLICY: ${normaliza(st).slice(0, 80)}`);
    const nome = m[1] ?? m[2];
    const reg = parseCriacao(m[3]);
    assert.equal(`${reg.bucket} | ${reg.cmd}`, alvos.get(nome), `alvo errado no rollback de "${nome}"`);
    assert.equal(reg.roles, 'authenticated');
  }
});

test('reaplicar o fix e idempotente (DROP POLICY IF EXISTS)', () => {
  if (semFix) {
    console.log('  ok  : reaplicar o fix e idempotente (nao avaliado na rodada SEM FIX)');
    return;
  }
  const reaplicado = new Map(depois);
  for (const st of divide(lerFix())) {
    const m = st.match(RE_DP);
    if (m) reaplicado.delete(m[2] ?? m[3]);
  }
  assert.deepEqual([...reaplicado.entries()].sort(), [...depois.entries()].sort());
});
