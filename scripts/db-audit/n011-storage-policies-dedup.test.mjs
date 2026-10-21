#!/usr/bin/env node
// N-011 (P2 · banco, achado SEC-DEFINER_GRANTS_STORAGE-07): dedup das policies de
// leitura e de exclusao duplicadas em storage.objects.
//
// Prova OFFLINE, sem docker: roda em qualquer runner (inclusive no espelho do CI do
// E47, que FINJE o docker e nao aplica migration). Le os ARQUIVOS REAIS de
// supabase/migrations/ na ordem de versao e simula o estado final das policies de
// storage.objects, aplicando cada CREATE POLICY / DROP POLICY / ALTER POLICY.
// Nada de CREATE POLICY copiado para dentro do teste.
//
// O que o contrato prova, no historico atual (2026-10-16 em diante):
//   (a) as duas policies redundantes de avatars ("Avatar images are publicly
//       accessible" e "Users can delete their own avatars") NAO existem no
//       estado anterior nem no final — 20261009182648 tornou o bucket privado
//       ("avatars authenticated read") e 20261011000019 ja tinha dropado o par;
//       20261016105108 reaplica o DROP IF EXISTS e nao pode voltar a criar o par;
//   (b) nenhuma migration POSTERIOR ao fix recria esses dois nomes;
//   (c) avatars/DELETE fica so com a policy singular do dono;
//   (d) audio-memes/DELETE tem dono E admin (20261016001136) — nao e par
//       redundante: as assinaturas diferem, e o fix nao mexe nelas;
//   (e) o arquivo do fix so tem DROP POLICY IF EXISTS dessas 2, com rollback
//       que recria exatamente esses nomes (nao e o estado vivo: o vivo ja
//       nao as tem);
//   (f) reaplicar o fix e idempotente.
//
// Vermelho: N011_WITHOUT_FIX=1 (ou a migration do fix ausente do disco) esvazia o
// texto do arquivo — os testes do DDL/rollback falham. O estado simulado continua
// sem o par porque migrations anteriores ja o removeram.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirMig = join(raiz, 'supabase', 'migrations');
const FIX = '20261016105108_n011_storage_drop_duplicate_avatar_policies.sql';
const caminhoFix = join(dirMig, FIX);
// Dois gatilhos para rodar contra a BASE (estado anterior, sem o fix): a variavel
// N011_WITHOUT_FIX=1 e a ausencia do proprio arquivo da migration no disco — assim
// a prova vermelha tambem vale "worktree da base + so o teste".
const semFix = process.env.N011_WITHOUT_FIX === '1' || !existsSync(caminhoFix);

const ler = (caminho) => readFileSync(caminho, 'utf8');
// Texto do fix: vazio quando a migration esta ausente (rodada da BASE) — os testes
// que dependem do arquivo entao falham, que e o resultado honesto.
const lerFix = () => (existsSync(caminhoFix) ? ler(caminhoFix) : '');
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

const REDUNDANTES = [
  'Avatar images are publicly accessible',
  'Users can delete their own avatars',
];
const SOZINHOS = [
  ['stickers', 'SELECT', 'Anyone can view stickers'],
  ['stickers', 'DELETE', 'Users can delete own stickers'],
  ['audio-memes', 'SELECT', 'Public read audio memes'],
  ['custom-emojis', 'SELECT', 'Public read for custom emojis'],
  ['custom-emojis', 'DELETE', 'Users can delete own custom emojis'],
];

console.log(`FATO: migrations lidas = ${arquivosBase.length}`);
console.log(`FATO: modo = ${semFix ? 'SEM FIX (estado anterior)' : 'com o fix aplicado'}`);
for (const cmd of ['SELECT', 'DELETE']) {
  console.log(`FATO: avatars/${cmd} antes=[${grupo(antes, 'avatars', cmd).join(', ')}]`
    + ` depois=[${grupo(depois, 'avatars', cmd).join(', ')}]`);
}
console.log(`FATO: policies de storage.objects antes=${antes.size} depois=${depois.size}`);

test('nenhuma migration posterior recria o par redundante que o fix remove', () => {
  const versaoFix = basename(caminhoFix).split('_')[0];
  const versoes = arquivosTodos.map((a) => basename(a).split('_')[0]);
  assert.ok(versoes.includes(versaoFix), 'a migration do fix sumiu do disco');
  assert.notEqual(
    versoes[versoes.length - 1],
    versaoFix,
    'o fix voltou a ser a ultima migration; reavalie se algo posterior reescreveu storage.objects',
  );
  for (const nome of REDUNDANTES) {
    assert.equal(antes.has(nome), false, `estado anterior ainda tem "${nome}"`);
    assert.equal(depois.has(nome), false, `estado final recriou "${nome}"`);
  }
});

test('avatars/SELECT: bucket privado — so "avatars authenticated read", antes e depois', () => {
  assert.deepEqual(grupo(antes, 'avatars', 'SELECT'), ['avatars authenticated read']);
  assert.deepEqual(grupo(depois, 'avatars', 'SELECT'), ['avatars authenticated read']);
  assert.deepEqual(depois.get('avatars authenticated read'), antes.get('avatars authenticated read'));
  assert.equal(antes.has('Anyone can view avatars'), false);
  assert.equal(depois.has('Anyone can view avatars'), false);
});

test('avatars/DELETE: so a policy singular do dono, antes e depois', () => {
  assert.deepEqual(grupo(antes, 'avatars', 'DELETE'), ['Users can delete their own avatar']);
  assert.deepEqual(grupo(depois, 'avatars', 'DELETE'), ['Users can delete their own avatar']);
  assert.deepEqual(
    depois.get('Users can delete their own avatar'),
    antes.get('Users can delete their own avatar'),
  );
});

for (const [bucket, cmd, nome] of SOZINHOS) {
  test(`${bucket}/${cmd}: 1 policy ("${nome}") antes E depois`, () => {
    assert.deepEqual(grupo(antes, bucket, cmd), [nome]);
    assert.deepEqual(grupo(depois, bucket, cmd), [nome]);
  });
}

test('audio-memes/DELETE: dono e admin, assinaturas diferentes, antes e depois', () => {
  const esperado = ['Admins can delete any audio meme', 'Users can delete own audio memes'];
  assert.deepEqual(grupo(antes, 'audio-memes', 'DELETE'), esperado);
  assert.deepEqual(grupo(depois, 'audio-memes', 'DELETE'), esperado);
  assert.notEqual(
    assinatura(antes.get(esperado[0])),
    assinatura(antes.get(esperado[1])),
    'admin e dono nao podem ser a mesma policy duplicada',
  );
  assert.deepEqual(depois.get(esperado[0]), antes.get(esperado[0]));
  assert.deepEqual(depois.get(esperado[1]), antes.get(esperado[1]));
});

test('o fix so mexe em avatars: nenhuma policy de outro bucket muda', () => {
  const outros = (tab) => [...tab.entries()].filter(([, r]) => r.bucket !== 'avatars').sort();
  assert.deepEqual(outros(depois), outros(antes));
});

test('o fix nao altera a contagem: o par redundante ja tinha saido antes desta reaplicacao', () => {
  assert.equal(depois.size, antes.size);
  for (const nome of REDUNDANTES) assert.equal(depois.has(nome), false);
});

test('o fix nao tem DDL alheia: so DROP POLICY IF EXISTS das 2 redundantes', () => {
  const alheios = [];
  const nomes = [];
  for (const st of divide(lerFix())) {
    const m = st.match(RE_DP);
    const nome = m ? (m[2] ?? m[3]) : null;
    if (m && m[1] && REDUNDANTES.includes(nome)) nomes.push(nome);
    else alheios.push(normaliza(st).slice(0, 100));
  }
  assert.deepEqual(alheios, []);
  assert.deepEqual(nomes.sort(), [...REDUNDANTES].sort());
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
  assert.deepEqual(nomes.sort(), [...REDUNDANTES].sort());
});

test('o rollback recria so as 2 redundantes, que o estado vivo nao tem', () => {
  const stmts = divide(linhasFix[1].split('Rollback:')[1].trim());
  const restaurado = new Map(depois);
  for (const st of stmts) {
    const m = st.match(RE_CP);
    if (m) restaurado.set(m[1] ?? m[2], parseCriacao(m[3]));
  }
  const extras = [...restaurado.keys()].filter((nome) => !depois.has(nome)).sort();
  assert.deepEqual(extras, [...REDUNDANTES].sort());
  for (const nome of REDUNDANTES) assert.equal(antes.has(nome), false);
  const manter = (tab) => [...tab.entries()]
    .filter(([nome, reg]) => !REDUNDANTES.includes(nome) && reg.bucket === 'avatars')
    .sort();
  assert.deepEqual(manter(restaurado), manter(depois));
  assert.deepEqual(manter(depois), manter(antes));
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
