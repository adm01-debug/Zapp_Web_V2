#!/usr/bin/env node
// N-011 (P2 · banco, achado SEC-DEFINER_GRANTS_STORAGE-07): dedup das policies de
// leitura e de exclusao duplicadas em storage.objects.
//
// Prova OFFLINE, sem docker: roda em qualquer runner (inclusive no espelho do CI do
// E47, que FINJE o docker e nao aplica migration). Le os ARQUIVOS REAIS de
// supabase/migrations/ e simula a primeira deduplicacao e a repeticao posterior,
// aplicando CREATE POLICY / DROP POLICY / ALTER POLICY.
// Nada de CREATE POLICY copiado para dentro do teste.
//
// O que o contrato prova:
//   (a) antes da primeira deduplicacao (20261011000019), o par de DELETE em avatars
//       existe e tem papel/USING identicos; depois resta apenas a policy original;
//   (b) a migration repetida (20261016105108) e no-op no historico atual, porque as
//       policies-alvo ja foram removidas por migrations anteriores;
//   (c) o no-op nao toca em outras policies, inclusive a policy administrativa de
//       audio-memes criada depois da primeira deduplicacao;
//   (d) o SQL da migration repetida so contem os dois DROP POLICY IF EXISTS esperados;
//   (e) o rollback reintroduz policies legadas redundantes, com assinatura equivalente
//       as policies mantidas; ele restaura esses nomes, nao o catalogo exato atual.
//
// A prova RED→GREEN com e sem aplicação da migration é a integração PostgreSQL
// `n011-storage-avatar-policies-dedup.test.sh`; este contrato offline verifica o
// histórico e os bytes do SQL, não simula a ausência de execução com variável env.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirMig = join(raiz, 'supabase', 'migrations');
const FIX = '20261016105108_n011_storage_drop_duplicate_avatar_policies.sql';
const FIX_ANTERIOR = '20261011000019_n011_storage_drop_duplicate_avatar_policies.sql';
const caminhoFix = join(dirMig, FIX);
const caminhoFixAnterior = join(dirMig, FIX_ANTERIOR);
// Se o arquivo sumir no checkout, `depois` modela o estado anterior e os contratos
// de conteúdo abaixo falham. Não há modo env que finja ter aplicado SQL no simulador.
const semFix = !existsSync(caminhoFix);

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
const assinaturaLeituraAvatar = (reg) => [
  reg.cmd.toUpperCase(),
  reg.roles,
  (reg.using ?? '').replace(/::text/g, '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim(),
].join(' | ');

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

// A prova pertence ao ponto histórico da migration, não ao estado atual depois
// de dezenas de migrations posteriores que legitimamente recriam/alteram policies.
const versaoFix = basename(caminhoFix).slice(0, 14);
const arquivosAntesFix = arquivosTodos.filter((a) => basename(a).slice(0, 14) < versaoFix);
const arquivosAteFix = arquivosTodos.filter((a) => basename(a).slice(0, 14) <= versaoFix);
const antes = estado(arquivosAntesFix);
const depois = semFix ? estado(arquivosAntesFix) : estado(arquivosAteFix);
const versaoFixAnterior = basename(caminhoFixAnterior).slice(0, 14);
const arquivosAntesFixAnterior = arquivosTodos.filter((a) => basename(a).slice(0, 14) < versaoFixAnterior);
const arquivosAteFixAnterior = arquivosTodos.filter((a) => basename(a).slice(0, 14) <= versaoFixAnterior);
const antesDoPrimeiroFix = estado(arquivosAntesFixAnterior);
const depoisDoPrimeiroFix = estado(arquivosAteFixAnterior);

const grupo = (tab, bucket, cmd) =>
  [...tab.entries()].filter(([, r]) => r.bucket === bucket && r.cmd === cmd).map(([n]) => n).sort();

const PARES = [
  ['avatars', 'DELETE', 'Users can delete their own avatar', 'Users can delete their own avatars'],
];
const SOZINHOS = [
  ['stickers', 'SELECT', ['Anyone can view stickers']],
  ['stickers', 'DELETE', ['Users can delete own stickers']],
  ['audio-memes', 'SELECT', ['Public read audio memes']],
  ['audio-memes', 'DELETE', ['Admins can delete any audio meme', 'Users can delete own audio memes']],
  ['custom-emojis', 'SELECT', ['Public read for custom emojis']],
  ['custom-emojis', 'DELETE', ['Users can delete own custom emojis']],
];

console.log(`FATO: migrations antes do fix repetido = ${arquivosAntesFix.length}`);
console.log(`FATO: migrations antes do primeiro fix = ${arquivosAntesFixAnterior.length}`);
console.log(`FATO: modo = ${semFix ? 'SEM FIX repetido' : 'com o fix repetido aplicado'}`);
for (const [bucket, cmd, mantida, removida] of PARES) {
  console.log(`FATO: ${bucket}/${cmd} antes=[${grupo(antes, bucket, cmd).join(', ')}]`
    + ` depois=[${grupo(depois, bucket, cmd).join(', ')}]`);
  console.log(`      mantida "${mantida}" x removida "${removida}":`
    + ` roles=${antes.get(mantida)?.roles} using=${antes.get(mantida)?.using}`);
}
console.log(`FATO: policies de storage.objects antes=${antes.size} depois=${depois.size}`);

test('a prova compara as janelas historicas do primeiro fix e da migration repetida', () => {
  assert.ok(existsSync(caminhoFix), `migration ausente: ${FIX}`);
  assert.equal(arquivosAteFix.at(-1), caminhoFix);
  assert.equal(arquivosAteFixAnterior.at(-1), caminhoFixAnterior);
});

for (const [bucket, cmd, mantida, removida] of PARES) {
  test(`${bucket}/${cmd}: antes do primeiro fix existe exatamente o par redundante`, () => {
    assert.deepEqual(grupo(antesDoPrimeiroFix, bucket, cmd), [mantida, removida].sort());
  });
  test(`${bucket}/${cmd}: o par historico tem papel+USING+WITH CHECK identicos`, () => {
    assert.equal(assinatura(antesDoPrimeiroFix.get(mantida)), assinatura(antesDoPrimeiroFix.get(removida)));
  });
  test(`${bucket}/${cmd}: o primeiro fix conserva exatamente a policy original`, () => {
    assert.deepEqual(grupo(depoisDoPrimeiroFix, bucket, cmd), [mantida]);
  });
  test(`a policy mantida "${mantida}" nao muda com o primeiro fix`, () => {
    assert.deepEqual(depoisDoPrimeiroFix.get(mantida), antesDoPrimeiroFix.get(mantida));
  });
}

test('a migration repetida nao altera o catalogo historico', () => {
  assert.deepEqual([...depois.entries()].sort(), [...antes.entries()].sort());
});

for (const [bucket, cmd, nomes] of SOZINHOS) {
  test(`${bucket}/${cmd}: policies esperadas permanecem antes e depois da repeticao`, () => {
    assert.deepEqual(grupo(antes, bucket, cmd), nomes.slice().sort());
    assert.deepEqual(grupo(depois, bucket, cmd), nomes.slice().sort());
  });
}

test('o fix so mexe em avatars: nenhuma policy de outro bucket muda', () => {
  const outros = (tab) => [...tab.entries()].filter(([, r]) => r.bucket !== 'avatars').sort();
  assert.deepEqual(outros(depois), outros(antes));
});

test('a migration repetida nao altera a contagem de policies', () => {
  assert.equal(depois.size, antes.size);
});

test('o fix nao tem DDL alheia: so DROP POLICY IF EXISTS das 2 redundantes', () => {
  const alheios = [];
  const nomes = [];
  for (const st of divide(lerFix())) {
    const m = st.match(RE_DP);
    const nome = m ? (m[2] ?? m[3]) : null;
    if (m && m[1] && ['Users can delete their own avatars', 'Avatar images are publicly accessible'].includes(nome)) nomes.push(nome);
    else alheios.push(normaliza(st).slice(0, 100));
  }
  assert.deepEqual(alheios, []);
  assert.deepEqual(nomes.sort(), ['Avatar images are publicly accessible', 'Users can delete their own avatars'].sort());
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
  assert.deepEqual(nomes.sort(), ['Avatar images are publicly accessible', 'Users can delete their own avatars'].sort());
});

test('o rollback reintroduz as duas policies legadas, equivalentes as mantidas', () => {
  const stmts = divide(linhasFix[1].split('Rollback:')[1].trim());
  const restaurado = new Map(depois);
  for (const st of stmts) {
    const m = st.match(RE_CP);
    if (m) restaurado.set(m[1] ?? m[2], parseCriacao(m[3]));
  }
  assert.equal(restaurado.size, depois.size + 2);
  assert.equal(
    assinatura(restaurado.get('Users can delete their own avatars')),
    assinatura(restaurado.get('Users can delete their own avatar')),
  );
  assert.equal(
    assinaturaLeituraAvatar(restaurado.get('Avatar images are publicly accessible')),
    assinaturaLeituraAvatar(restaurado.get('avatars authenticated read')),
  );
});

test('reaplicar o fix e idempotente (DROP POLICY IF EXISTS)', () => {
  assert.ok(existsSync(caminhoFix), `migration ausente: ${FIX}`);
  const reaplicado = new Map(depois);
  for (const st of divide(lerFix())) {
    const m = st.match(RE_DP);
    if (m) reaplicado.delete(m[2] ?? m[3]);
  }
  assert.deepEqual([...reaplicado.entries()].sort(), [...depois.entries()].sort());
});
