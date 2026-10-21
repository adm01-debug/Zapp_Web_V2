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
// Contrato (canonico atual, HEAD):
//   (a) estado FINAL: avatars SELECT = 1 ("avatars authenticated read"), DELETE = 1
//       ("Users can delete their own avatar"), INSERT = 1 ("avatars owner insert"),
//       UPDATE = 1 ("avatars owner update") — esquema do bucket privado
//       (20261009182648). O par duplicado historico ("Anyone can view avatars" /
//       "Avatar images are publicly accessible" e singular/plural do DELETE) ja foi
//       removido pelo bucket privado ANTES do fix; o fix e hoje um no-op idempotente
//       (DROP IF EXISTS de policies ja ausentes) que permanece como garantia.
//   (b) stickers / custom-emojis: 1 por verbo de leitura/exclusao; audio-memes
//       SELECT = 1 e DELETE = 2 ("Users can delete own audio memes" + admin
//       "Admins can delete any audio meme", de 20261016001136).
//   (c) teto DINAMICO por dominio: migrations com versao maior que o fix NAO podem
//       tocar nas policies dos buckets guardados (avatars, stickers, audio-memes,
//       custom-emojis). Migrations que tocam outros buckets (ex. audio-messages /
//       whisper) ou que nao tocam storage.objects passam livres — o guard nao quebra
//       a cada migration nova.
//   (d) o fix so tem DROP POLICY IF EXISTS das 2 redundantes historicas, sem DDL
//       alheia; o bloco `-- Rollback:` recria as 2 com assinatura parseavel;
//       reaplicar o fix e idempotente e o total de policies nao muda (delta 0).
//
// Vermelho: N011_WITHOUT_FIX=1 ou a migration do fix ausente do disco faz a suite
// falhar (teste "o fix esta aplicado" + testes que dependem do arquivo).

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

// Nomes historicos removidos pelo fix (para checagem de DDL/rollback).
const REMOVIDAS = [
  'Avatar images are publicly accessible',
  'Users can delete their own avatars',
];
// Canonico atual (HEAD): esquema do bucket privado + admin-delete em audio-memes.
const FINAL_AVATARS = [
  ['avatars', 'SELECT', 'avatars authenticated read'],
  ['avatars', 'DELETE', 'Users can delete their own avatar'],
  ['avatars', 'INSERT', 'avatars owner insert'],
  ['avatars', 'UPDATE', 'avatars owner update'],
];
const SOZINHOS_1 = [
  ['stickers', 'SELECT', 'Anyone can view stickers'],
  ['stickers', 'DELETE', 'Users can delete own stickers'],
  ['audio-memes', 'SELECT', 'Public read audio memes'],
  ['custom-emojis', 'SELECT', 'Public read for custom emojis'],
  ['custom-emojis', 'DELETE', 'Users can delete own custom emojis'],
];
const AUDIO_MEMES_DELETE_FINAL = ['Admins can delete any audio meme', 'Users can delete own audio memes'].sort();
const GUARD_BUCKETS = ['avatars', 'stickers', 'audio-memes', 'custom-emojis'];

console.log(`FATO: migrations lidas = ${arquivosBase.length}`);
console.log(`FATO: modo = ${semFix ? 'SEM FIX (estado anterior)' : 'com o fix aplicado'}`);
console.log(`FATO: avatars/SELECT depois=[${grupo(depois, 'avatars', 'SELECT').join(', ')}]`);
console.log(`FATO: avatars/DELETE depois=[${grupo(depois, 'avatars', 'DELETE').join(', ')}]`);
console.log(`FATO: audio-memes/DELETE depois=[${grupo(depois, 'audio-memes', 'DELETE').join(', ')}]`);
console.log(`FATO: policies de storage.objects antes=${antes.size} depois=${depois.size}`);

test('o fix esta aplicado (nao rodar em modo SEM FIX)', () => {
  assert.ok(!semFix, 'rode sem N011_WITHOUT_FIX=1 e com a migration do fix presente');
});

test('o fix continua sendo o ultimo a tocar nas policies guardadas (teto dinamico por dominio)', () => {
  const fixVersao = basename(caminhoFix).split('_')[0];
  const posteriores = arquivosTodos.filter((a) => basename(a).split('_')[0] > fixVersao);
  const infratores = [];
  for (const arq of posteriores) {
    const txt = ler(arq);
    if (!/storage\.objects/i.test(txt)) continue;
    // Buckets citados via bucket_id = '...' no arquivo.
    const citados = new Set();
    for (const m of txt.matchAll(/bucket_id\s*=\s*'([^']*)'/g)) citados.add(m[1]);
    // Policies guardadas citadas pelo nome (DROP/ALTER sem bucket_id).
    const nomesGuardados = [
      ...FINAL_AVATARS.map((r) => r[2]),
      ...SOZINHOS_1.map((r) => r[2]),
      ...AUDIO_MEMES_DELETE_FINAL,
    ];
    const citaGuardado = GUARD_BUCKETS.some((b) => citados.has(b))
      || nomesGuardados.some((n) => txt.includes(`"${n}"`));
    // CREATE/DROP/ALTER POLICY em storage.objects + menção a bucket/policy guardada = infrator.
    const temPolicyDDL = divide(txt).some((st) => RE_CP.test(st) || RE_DP.test(st) || RE_AP.test(st));
    if (temPolicyDDL && citaGuardado) infratores.push(basename(arq));
  }
  assert.deepEqual(infratores, []);
});

for (const [bucket, cmd, nome] of FINAL_AVATARS) {
  test(`${bucket}/${cmd}: estado FINAL tem exatamente "${nome}" (antes E depois)`, () => {
    assert.deepEqual(grupo(antes, bucket, cmd), [nome]);
    assert.deepEqual(grupo(depois, bucket, cmd), [nome]);
  });
  test(`a policy "${nome}" tem a mesma assinatura antes/depois`, () => {
    assert.deepEqual(depois.get(nome), antes.get(nome));
  });
}

for (const [bucket, cmd, nome] of SOZINHOS_1) {
  test(`${bucket}/${cmd}: 1 policy ("${nome}") antes E depois`, () => {
    assert.deepEqual(grupo(antes, bucket, cmd), [nome]);
    assert.deepEqual(grupo(depois, bucket, cmd), [nome]);
  });
}

test('audio-memes/DELETE: 2 policies (dono + admin) antes E depois', () => {
  assert.deepEqual(grupo(antes, 'audio-memes', 'DELETE'), AUDIO_MEMES_DELETE_FINAL);
  assert.deepEqual(grupo(depois, 'audio-memes', 'DELETE'), AUDIO_MEMES_DELETE_FINAL);
});

test('o fix nao altera o canonico atual (no-op): nenhum bucket muda antes/depois', () => {
  const norm = (tab) => [...tab.entries()].sort();
  assert.deepEqual(norm(depois), norm(antes));
});

test('o total de policies de storage.objects nao muda (fix no-op no canonico atual)', () => {
  assert.equal(depois.size, antes.size);
});

test('o fix nao tem DDL alheia: so DROP POLICY IF EXISTS das 2 redundantes historicas', () => {
  const alheios = [];
  const nomes = [];
  for (const st of divide(lerFix())) {
    const m = st.match(RE_DP);
    const nome = m ? (m[2] ?? m[3]) : null;
    if (m && m[1] && nome === REMOVIDAS.find((n) => n === nome)) nomes.push(nome);
    else alheios.push(normaliza(st).slice(0, 100));
  }
  assert.deepEqual(alheios, []);
  assert.deepEqual(nomes.sort(), [...REMOVIDAS].sort());
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
  assert.deepEqual(nomes.sort(), [...REMOVIDAS].sort());
});

test('o rollback recria policies de avatars parseaveis (bucket avatars, cmds SELECT/DELETE)', () => {
  const stmts = divide(linhasFix[1].split('Rollback:')[1].trim());
  const regs = stmts.map((st) => {
    const m = st.match(RE_CP);
    return [m[1] ?? m[2], parseCriacao(m[3])];
  });
  const porNome = new Map(regs);
  assert.equal(porNome.get('Avatar images are publicly accessible')?.bucket, 'avatars');
  assert.equal(porNome.get('Avatar images are publicly accessible')?.cmd, 'SELECT');
  assert.equal(porNome.get('Users can delete their own avatars')?.bucket, 'avatars');
  assert.equal(porNome.get('Users can delete their own avatars')?.cmd, 'DELETE');
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
