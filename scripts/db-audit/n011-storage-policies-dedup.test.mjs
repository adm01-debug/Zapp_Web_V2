#!/usr/bin/env node
// N-011 (P2 · banco, achado SEC-DEFINER_GRANTS_STORAGE-07): dedup das policies de
// leitura e de exclusao duplicadas em storage.objects.
//
// Prova OFFLINE, sem docker: roda em qualquer runner (inclusive no espelho do CI do
// E47, que FINJE o docker e nao aplica migration). Le os ARQUIVOS REAIS de
// supabase/migrations/ na ordem de versao e compara o estado da policy com e sem
// o arquivo N-011 apontado por FIX. Nada de CREATE POLICY copiado para dentro do teste.
//
// O que o contrato prova:
//   (a) replay limpo: migrations anteriores ja removeram os alvos, entao N-011 e no-op;
//   (b) replay drifted: reintroduz os alvos da migration historica, aplica N-011 e prova
//       que ambos somem sem alterar policies alheias;
//   (c) reaplicar o fix e idempotente (DROP POLICY IF EXISTS).
//
// N011_WITHOUT_FIX=1 afeta o estado comparativo, nao as simulacoes explicitas abaixo.
// O historico anterior ja remove os alvos; nao se presume contagem 2 de avatars.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirMig = join(raiz, 'supabase', 'migrations');
const FIX = '20261016105108_n011_storage_drop_duplicate_avatar_policies.sql';
const ORIGEM = '20260511233306_0e3f3b66-5585-4762-af6b-549c050f6275.sql';
const NOMES_REMOVIDOS_N011 = ['Avatar images are publicly accessible', 'Users can delete their own avatars'];
const caminhoFix = join(dirMig, FIX);
// Dois gatilhos para formar o estado-base sem N011 na comparacao do replay: a
// variavel N011_WITHOUT_FIX=1 ou a ausencia do arquivo da migration no disco.
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

// Simula apenas DDL de policy sobre um snapshot em memoria; nao executa SQL nem
// abre conexao. O estado drifted e semeado pelas CREATE POLICY do rollback real.
function aplicarStatementsDePolicy(estadoInicial, statements) {
  const resultado = new Map(estadoInicial);
  for (const statement of statements) {
    if (/^select\s+1$/i.test(statement.replace(/;$/, '').trim())) continue;
    const create = statement.match(RE_CP);
    if (create) {
      const name = create[1] ?? create[2];
      assert.equal(resultado.has(name), false, `CREATE POLICY duplicada (${name})`);
      resultado.set(name, parseCriacao(create[3]));
      continue;
    }
    const drop = statement.match(RE_DP);
    if (drop) {
      const name = drop[2] ?? drop[3];
      assert.ok(drop[1] || resultado.has(name), `DROP POLICY sem IF EXISTS em policy ausente (${name})`);
      resultado.delete(name);
      continue;
    }
    assert.fail(`DDL fora do simulador de policies: ${normaliza(statement)}`);
  }
  return resultado;
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
const estadoSemFix = estado(arquivosBase);
const estadoComFix = semFix ? estado(arquivosBase) : estado(arquivosTodos);
const linhasFix = lerFix().split('\n');
const statementsFix = divide(lerFix());
const simuladoCleanDepoisFix = aplicarStatementsDePolicy(estadoSemFix, statementsFix);
// Drift controlado: injeta as definicoes REAIS da migration historica de origem,
// para provar o efeito da migration forward no replay com drift.
const politicasOriginais = estado([join(dirMig, ORIGEM)]);
const simuladoDriftedAntes = new Map(estadoSemFix);
for (const nome of NOMES_REMOVIDOS_N011) {
  const policy = politicasOriginais.get(nome);
  assert.ok(policy, `policy historica ausente na migration de origem: ${nome}`);
  simuladoDriftedAntes.set(nome, { ...policy });
}
const simuladoDriftedDepoisFix = aplicarStatementsDePolicy(simuladoDriftedAntes, statementsFix);

const grupo = (tab, bucket, cmd) =>
  [...tab.entries()].filter(([, r]) => r.bucket === bucket && r.cmd === cmd).map(([n]) => n).sort();

const AVATAR_SELECT_VIGENTE = 'avatars authenticated read';
const AVATAR_DELETE_VIGENTE = 'Users can delete their own avatar';
const SOZINHOS = [
  ['stickers', 'SELECT', 'Anyone can view stickers'],
  ['stickers', 'DELETE', 'Users can delete own stickers'],
  ['audio-memes', 'SELECT', 'Public read audio memes'],
  ['audio-memes', 'DELETE', ['Admins can delete any audio meme', 'Users can delete own audio memes']],
  ['custom-emojis', 'SELECT', 'Public read for custom emojis'],
  ['custom-emojis', 'DELETE', 'Users can delete own custom emojis'],
];

console.log(`FATO: migrations lidas = ${arquivosBase.length}`);
console.log(`FATO: modo = ${semFix ? 'SEM FIX (estado anterior)' : 'com o fix aplicado'}`);
console.log(`FATO: policies de storage.objects sem fix=${estadoSemFix.size} com fix=${estadoComFix.size}`);
console.log(`SIMULACAO: replay limpo N011 ${estadoSemFix.size} -> ${simuladoCleanDepoisFix.size}`);
console.log(`SIMULACAO: replay drifted N011 ${simuladoDriftedAntes.size} -> ${simuladoDriftedDepoisFix.size}`);

test('migrations posteriores nao reescrevem policies de avatars', () => {
  const versaoFix = basename(caminhoFix).split('_')[0];
  const posteriores = arquivosTodos.filter((a) => basename(a).split('_')[0] > versaoFix);
  const alteracoesAvatar = posteriores.flatMap((caminho) => divide(ler(caminho))
    .filter((st) => /\b(?:create|drop|alter)\s+policy\b/i.test(st)
      && /\bon\s+storage\.objects\b/i.test(st)
      && /\bavatars?\b/i.test(st))
    .map((st) => `${basename(caminho)}: ${normaliza(st)}`));
  assert.deepEqual(alteracoesAvatar, []);
});

test('avatars/SELECT preserva a policy autenticada vigente', () => {
  assert.deepEqual(grupo(estadoSemFix, 'avatars', 'SELECT'), [AVATAR_SELECT_VIGENTE]);
  assert.deepEqual(grupo(estadoComFix, 'avatars', 'SELECT'), [AVATAR_SELECT_VIGENTE]);
  assert.deepEqual(estadoComFix.get(AVATAR_SELECT_VIGENTE), estadoSemFix.get(AVATAR_SELECT_VIGENTE));
});

test('replay limpo: as migrations anteriores ja removeram os alvos e N-011 e no-op', () => {
  assert.equal(estadoSemFix.has(NOMES_REMOVIDOS_N011[0]), false);
  assert.equal(estadoSemFix.has(NOMES_REMOVIDOS_N011[1]), false);
  assert.deepEqual([...simuladoCleanDepoisFix.entries()].sort(), [...estadoSemFix.entries()].sort());
  assert.deepEqual([...estadoComFix.entries()].sort(), [...estadoSemFix.entries()].sort());
});

test('replay drifted: N-011 remove os dois alvos reais sem alterar as demais policies', () => {
  assert.deepEqual(
    [...simuladoDriftedAntes.keys()].filter((name) => NOMES_REMOVIDOS_N011.includes(name)).sort(),
    [...NOMES_REMOVIDOS_N011].sort(),
  );
  assert.deepEqual(
    [...simuladoDriftedDepoisFix.keys()].filter((name) => NOMES_REMOVIDOS_N011.includes(name)),
    [],
  );
  assert.equal(simuladoDriftedAntes.size, estadoSemFix.size + 2);
  assert.equal(simuladoDriftedDepoisFix.size, estadoSemFix.size);
  assert.deepEqual([...simuladoDriftedDepoisFix.entries()].sort(), [...estadoSemFix.entries()].sort());
  assert.deepEqual(
    assinatura(simuladoDriftedAntes.get(AVATAR_DELETE_VIGENTE)),
    assinatura(simuladoDriftedDepoisFix.get(AVATAR_DELETE_VIGENTE)),
  );
});

for (const [bucket, cmd, nomesEsperados] of SOZINHOS) {
  const nomes = Array.isArray(nomesEsperados) ? nomesEsperados : [nomesEsperados];
  test(`${bucket}/${cmd}: policies vigentes antes e depois do fix`, () => {
    assert.deepEqual(grupo(estadoSemFix, bucket, cmd), [...nomes].sort());
    assert.deepEqual(grupo(estadoComFix, bucket, cmd), [...nomes].sort());
  });
}

test('o fix so mexe em avatars: nenhuma policy de outro bucket muda', () => {
  const outros = (tab) => [...tab.entries()].filter(([, r]) => r.bucket !== 'avatars').sort();
  assert.deepEqual(outros(estadoComFix), outros(estadoSemFix));
});

test('o fix nao tem DDL alheia: so DROP POLICY IF EXISTS das 2 redundantes', () => {
  const alheios = [];
  const nomes = [];
  for (const st of divide(lerFix())) {
    const m = st.match(RE_DP);
    const nome = m ? (m[2] ?? m[3]) : null;
    if (m && m[1] && NOMES_REMOVIDOS_N011.includes(nome)) nomes.push(nome);
    else alheios.push(normaliza(st).slice(0, 100));
  }
  assert.deepEqual(alheios, []);
  assert.deepEqual(nomes.sort(), [...NOMES_REMOVIDOS_N011].sort());
});

test('a 1a linha da migration e o cabecalho `-- <slug>`', () => {
  assert.ok(linhasFix[0].startsWith('-- '));
  assert.ok(!linhasFix[0].startsWith('-- Rollback'));
});

test('a 2a linha da migration comeca com `-- Rollback:`', () => {
  assert.ok(linhasFix[1].startsWith('-- Rollback:'));
});

test('reaplicar o fix e idempotente (DROP POLICY IF EXISTS)', () => {
  if (semFix) {
    console.log('  ok  : reaplicar o fix e idempotente (nao avaliado na rodada SEM FIX)');
    return;
  }
  const reaplicadoClean = aplicarStatementsDePolicy(simuladoCleanDepoisFix, statementsFix);
  const reaplicadoDrifted = aplicarStatementsDePolicy(simuladoDriftedDepoisFix, statementsFix);
  assert.deepEqual([...reaplicadoClean.entries()].sort(), [...simuladoCleanDepoisFix.entries()].sort());
  assert.deepEqual([...reaplicadoDrifted.entries()].sort(), [...simuladoDriftedDepoisFix.entries()].sort());
});
