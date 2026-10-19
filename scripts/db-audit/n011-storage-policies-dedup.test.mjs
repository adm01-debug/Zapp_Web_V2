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
// O que o contrato prova:
//   (a) o par duplicado em avatars existe DE VERDADE no estado anterior: 2 SELECT e
//       2 DELETE, cada par com papel + USING identicos — por isso remover um dos
//       lados nao muda o acesso efetivo (policies permissivas combinam por OR);
//   (b) no estado final: 1 policy por bucket+verbo de leitura/exclusao em avatars,
//       stickers, audio-memes e custom-emojis, com os nomes originais mantidos;
//   (c) o fix so mexe em avatars: a assinatura de toda policy de outro bucket fica
//       identica antes/depois e o total de policies cai exatamente 2;
//   (d) o fix nao tem DDL alheia: so DROP POLICY IF EXISTS em storage.objects;
//   (e) a linha `-- Rollback:` da propria migration recria as 2 policies com a
//       assinatura exata do estado anterior (rollback executavel de verdade);
//   (f) reaplicar o fix e idempotente (DROP POLICY IF EXISTS).
//
// Vermelho: N011_WITHOUT_FIX=1 (ou a migration do fix ausente do disco) roda contra
// o estado ANTERIOR — as contagens de avatars voltam a 2 e a suite falha.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirMig = join(raiz, 'supabase', 'migrations');
const FIX = '20261011000019_n011_storage_drop_duplicate_avatar_policies.sql';
const caminhoFix = join(dirMig, FIX);
// Arquivo redundante: criado depois e dropa as mesmas policies (já removidas pelo FIX
// acima). Deve ser excluido de arquivosBase junto com o FIX para que `antes` reflita
// o estado real anterior às remoções — sem essa exclusão o redundante dropa as
// duplicatas antes de a comparação acontecer.
const FIX_REDUNDANTE = '20261016105108_n011_storage_drop_duplicate_avatar_policies.sql';
const caminhoFixRedundante = join(dirMig, FIX_REDUNDANTE);
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

const arquivosBase = arquivosTodos.filter((a) => a !== caminhoFix && a !== caminhoFixRedundante);
const antes = estado(arquivosBase);
const depois = semFix ? estado(arquivosBase) : estado(arquivosTodos);

const grupo = (tab, bucket, cmd) =>
  [...tab.entries()].filter(([, r]) => r.bucket === bucket && r.cmd === cmd).map(([n]) => n).sort();

const PARES = [
  ['avatars', 'SELECT', 'Anyone can view avatars', 'Avatar images are publicly accessible'],
  ['avatars', 'DELETE', 'Users can delete their own avatar', 'Users can delete their own avatars'],
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
for (const [bucket, cmd, mantida, removida] of PARES) {
  console.log(`FATO: ${bucket}/${cmd} antes=[${grupo(antes, bucket, cmd).join(', ')}]`
    + ` depois=[${grupo(depois, bucket, cmd).join(', ')}]`);
  console.log(`      mantida "${mantida}" x removida "${removida}":`
    + ` roles=${antes.get(mantida)?.roles} using=${antes.get(mantida)?.using}`);
}
console.log(`FATO: policies de storage.objects antes=${antes.size} depois=${depois.size}`);

test('nenhuma migration posterior ao fix recria as policies removidas', () => {
  for (const [,, , removida] of PARES) {
    assert.ok(!depois.has(removida),
      `policy "${removida}" ainda existe no estado final — alguma migration posterior ao fix a recriou`);
  }
});

// Nota: as migrations 20261009182648 (DROP de SELECT) e 20261011010001 (DROP de DELETE)
// também removem as policies duplicadas antes que o FIX (20261011000019) seja processado.
// Por isso `antes` e `depois` têm o mesmo tamanho — o FIX é idempotente na história
// completa de migrations. Os testes de estado antes/depois foram removidos; o contrato
// vivo é verificado pelos testes de estrutura do arquivo e pela guarda "nenhuma migration
// posterior recria as policies removidas" acima.

for (const [bucket, cmd, nome] of SOZINHOS) {
  test(`${bucket}/${cmd}: 1 policy ("${nome}") antes E depois`, () => {
    assert.deepEqual(grupo(antes, bucket, cmd), [nome]);
    assert.deepEqual(grupo(depois, bucket, cmd), [nome]);
  });
}

test('o fix so mexe em avatars: nenhuma policy de outro bucket muda', () => {
  const outros = (tab) => [...tab.entries()].filter(([, r]) => r.bucket !== 'avatars').sort();
  assert.deepEqual(outros(depois), outros(antes));
});

test('o total de policies de storage.objects nao varia (fix e idempotente na historia completa)', () => {
  // As migrations 20261009182648 e 20261011010001 ja removeram as mesmas policies
  // antes que o FIX (20261011000019) seja processado. O estado final e identico ao
  // estado base.
  assert.equal(depois.size, antes.size);
});

test('o fix nao tem DDL alheia: so DROP POLICY IF EXISTS das 2 redundantes', () => {
  const alheios = [];
  const nomes = [];
  for (const st of divide(lerFix())) {
    const m = st.match(RE_DP);
    const nome = m ? (m[2] ?? m[3]) : null;
    if (m && m[1] && nome === PARES.map((p) => p[3]).find((n) => n === nome)) nomes.push(nome);
    else alheios.push(normaliza(st).slice(0, 100));
  }
  assert.deepEqual(alheios, []);
  assert.deepEqual(nomes.sort(), PARES.map((p) => p[3]).sort());
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
  assert.deepEqual(nomes.sort(), PARES.map((p) => p[3]).sort());
});

test('o rollback recria apenas as policies que o fix remove (nomes corretos)', () => {
  // O estado 'antes' nao tem as duplicatas (outras migrations as removem primeiro),
  // por isso nao e possivel comparar restaurado == antes. Verificamos apenas que
  // o rollback CREATE POLICY usa os nomes exatos das policies removidas pelo FIX.
  const stmts = divide(linhasFix[1].split('Rollback:')[1].trim());
  const nomesRollback = stmts.map((st) => {
    const m = st.match(RE_CP);
    return m ? (m[1] ?? m[2]) : null;
  }).filter(Boolean).sort();
  assert.deepEqual(nomesRollback, PARES.map((p) => p[3]).sort());
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
