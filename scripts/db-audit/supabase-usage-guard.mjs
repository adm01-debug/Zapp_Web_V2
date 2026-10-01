#!/usr/bin/env node
/**
 * Guard de acoplamento codigo <-> banco.
 *
 * Varre src/ e supabase/functions/ procurando .from('x') e .rpc('y') feitos no
 * cliente Supabase PRINCIPAL e falha se o alvo nao existir em
 * supabase/schema-catalog.json.
 *
 * Roda OFFLINE. Nao precisa de credencial de banco, entao funciona em PR de fork.
 *
 * Chamadas em outros clientes (CRM externo, PROMOGIFTS, base de clientes) e em
 * storage.from() sao ignoradas - sao outros bancos/buckets. Este repo tem tres
 * clientes Supabase distintos; tratar todos como um so gera falso positivo.
 *
 * Violacoes ja conhecidas ficam em known-violations.json (padrao ratchet):
 * o CI passa com elas, mas falha se aparecer UMA nova. Entradas do baseline que
 * deixarem de existir tambem falham, para o arquivo nao apodrecer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { stripSqlComments } from './sql-lexer.mjs';

const ROOT = process.cwd();
const CATALOG = path.join(ROOT, 'supabase/schema-catalog.json');
const BASELINE = path.join(ROOT, 'scripts/db-audit/known-violations.json');
const SCAN_DIRS = ['src', 'supabase/functions'];
const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

// Receptores que NAO sao o banco principal deste projeto.
const NON_MAIN = /(externalSupabase|getExternalSupabase\(\)|clientesSupabase|getClientesSupabase\(\)|extClient|externalClient|storage|Array)\s*\??\.?\s*$/;

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (EXTS.has(path.extname(e.name))) acc.push(p);
  }
  return acc;
}

function scan() {
  const found = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(dir)) {
      const src = fs.readFileSync(file, 'utf8');
      for (const [kind, re] of [
        ['from', /\.from\(\s*['"`]([a-zA-Z0-9_-]+)['"`]/g],
        ['rpc', /\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g],
      ]) {
        let m;
        while ((m = re.exec(src))) {
          const before = src.slice(Math.max(0, m.index - 150), m.index);
          if (NON_MAIN.test(before)) continue;
          // `supabase.schema('ops').from('x')` aponta para outro schema: o schema
          // faz parte da identidade do alvo. Sem ele o guard compara 'x' com o
          // catalogo public e acusa alvo inexistente (ou deixa passar um alvo de
          // outro schema que nao existe). Sem `.schema(...)`, o padrao e public.
          const schemaMatch = before.match(/\.schema\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)\s*$/);
          found.push({
            kind,
            schema: (schemaMatch ? schemaMatch[1] : 'public').toLowerCase(),
            name: m[1],
            file: file.split(path.sep).join('/'),
            line: src.slice(0, m.index).split('\n').length,
          });
        }
      }
    }
  }
  return found;
}

// Assinaturas de funcao. O guard compara por NOME (rpc('x') nao carrega tipos),
// mas precisa saber se AINDA existe alguma assinatura depois de um DROP:
// `DROP FUNCTION public.f(uuid)` remove UMA assinatura de f, e o nome so pode
// sair da projecao quando TODAS as assinaturas conhecidas forem dropadas —
// senao o DROP de um overload orfana falsamente callers que continuam validos.
const MULTIWORD_TYPE_START = new Set([
  'timestamp', 'time', 'double', 'character', 'bit', 'national', 'interval',
]);

function splitArgs(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// Normaliza argumentos para TIPOS. pg_get_function_identity_arguments traz o
// NOME do argumento (`p_queue_id uuid`) e as migrations normalmente o omitem
// (`uuid`); sem remover o nome, a assinatura do catalogo e a do DROP nunca
// casariam e o DROP de um overload deixaria de ser reconhecido.
function normArgs(argsText) {
  return splitArgs(argsText)
    .map((raw) => {
      let t = raw.trim().replace(/\s+default\s+[\s\S]*$/i, '').trim();
      t = t.replace(/^(?:in|out|inout|variadic)\s+/i, '');
      const words = t.split(/\s+/).filter(Boolean);
      if (words.length > 1 && !MULTIWORD_TYPE_START.has(words[0].toLowerCase())) words.shift();
      return words.join(' ').toLowerCase().replace(/\s*\[\s*\]\s*/g, '[]');
    })
    .join(',');
}

function addSignature(map, key, sig) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(sig);
}

function dropSignature(map, key, sig) {
  const set = map.get(key);
  if (!set) return;
  // Uma unica assinatura conhecida: o DROP e dela, mesmo que a grafia do tipo
  // divirja entre catalogo e migration (ex.: timestamptz x timestamp with time
  // zone). Com varias assinaturas, um DROP que nao casa nenhuma e mantido
  // (conservador: evita orfaos falsos num ratchet que bloqueia merge).
  if (set.size <= 1) {
    map.delete(key);
    return;
  }
  // Sobrou mais de uma assinatura: o DROP remove SO a assinatura citada e o nome
  // continua na projecao enquanto existir qualquer outra.
  set.delete(sig);
}

function projectSchemaFromForwardMigrations(catalog) {
  const cutoff = String(catalog.generated_at || '').replace(/\D/g, '').slice(0, 8);
  // Base = estado do catalogo no snapshot. A janela forward-only pode ADICIONAR
  // (CREATE) e REMOVER (DROP) objetos. Comecar VAZIO e unir ao catalogo depois
  // (no main) tornaria o DROP de um objeto do catalogo INVISIVEL — a uniao o
  // restauraria — e o guard aprovaria o DROP de uma tabela/funcao existente
  // ainda usada por um caller. Partindo do catalogo, o DROP remove tanto
  // objetos novos da janela quanto os ja catalogados.
  // Chave QUALIFICADA (schema.nome). O catalogo cobre so o schema public, mas a
  // janela forward-only pode criar/remover objetos em qualquer schema (ex.:
  // supabase_migrations.reserve_migration_version). Guardar so o nome faria um
  // objeto de outro schema colidir com um homonimo de public.
  const functions = new Map();
  for (const n of catalog.functions) functions.set('public.' + n, new Set());
  for (const raw of catalog.function_signatures || []) {
    const m = /^([A-Za-z0-9_]+)\((.*)\)->/s.exec(String(raw));
    if (!m) continue;
    addSignature(functions, 'public.' + m[1], normArgs(m[2]));
  }
  const relations = new Set([...catalog.tables, ...catalog.views].map((n) => 'public.' + n));
  const migrationsDir = path.join(ROOT, 'supabase/migrations');
  if (!/^\d{8}$/.test(cutoff) || !fs.existsSync(migrationsDir)) return { functions, relations };

  for (const filename of fs.readdirSync(migrationsDir).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort()) {
    // Catalog snapshots only retain YYYY-MM-DD, not the generation time. A
    // migration from the same UTC day may have been created after the snapshot,
    // so same-day files must remain in the forward-only projection.
    if (filename.slice(0, 8) < cutoff) continue;
    // Remove comentarios antes de projetar CREATE/DROP. O hermes-db-migrar
    // exige um cabecalho '-- rollback: ...' que frequentemente cita um DROP;
    // sem remover comentarios, esse DROP (que nunca roda) removeria da
    // projecao a funcao que a propria migration cria. stripSqlComments tambem
    // torna strings e corpos dollar-quoted opacos, para CREATE/DROP citados
    // como texto (ex.: dentro do corpo de uma funcao) nao virarem DDL.
    const rawSql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    const sql = stripSqlComments(rawSql);
    // CREATE e DROP sao aplicados na ORDEM em que aparecem no texto. Rodar
    // todos os CREATEs e depois todos os DROPs (em loops separados) inverte a
    // ordem de uma migration que faz DROP + CREATE do mesmo nome para trocar a
    // assinatura (padrao do repo, ex.: adicionar include_legacy): o DROP venceria
    // e o objeto sumiria da projecao -> falso positivo "alvo nao existe".
    const ops = [];
    // Qualquer schema (nao so public): o DDL real e qualificado e a chave e
    // montada como schema.nome, igual a projecao do catalogo e ao scan().
    const qual = (schema, name) => schema.toLowerCase() + '.' + name;
    // A migration roda com search_path public: DDL sem qualificacao (`DROP TABLE x;`)
    // atinge public.x. Exigir o prefixo deixava esse DROP invisivel (fail-open: o
    // caller de x seguia aprovado mesmo com a tabela derrubada).
    const alvo = (schema, name) => qual(schema || 'public', name);
    // VIEW entra em relations: 27 arquivos de migration criam view e views do
    // catalogo sao derrubadas na janela (profiles_public, whatsapp_connections_public,
    // password_reset_requests_safe, ...). Sem projetar o CREATE acusa falso positivo
    // (a view recem-criada "nao existe") e o DROP passa invisivel (fail-open).
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)/gi)) {
      ops.push({ at: m.index, kind: 'rel', op: 'add', name: alvo(m[1], m[2]) });
    }
    for (const m of sql.matchAll(/DROP\s+(?:MATERIALIZED\s+)?VIEW(?:\s+IF\s+EXISTS)?\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)/gi)) {
      ops.push({ at: m.index, kind: 'rel', op: 'del', name: alvo(m[1], m[2]) });
    }
    for (const m of sql.matchAll(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)/gi)) {
      ops.push({ at: m.index, kind: 'rel', op: 'add', name: alvo(m[1], m[2]) });
    }
    for (const m of sql.matchAll(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)/gi)) {
      ops.push({ at: m.index, kind: 'rel', op: 'del', name: alvo(m[1], m[2]) });
    }
    // RENAME TO muda a identidade do alvo: o nome antigo sai da projecao e o novo
    // entra. Sem isso um caller do nome antigo fica invisivel ao guard (e um do
    // nome novo vira falso positivo). O `+ 1` mantem o add depois do del na ordem.
    for (const m of sql.matchAll(/ALTER\s+(?:MATERIALIZED\s+VIEW|TABLE|VIEW)(?:\s+IF\s+EXISTS)?\s+(?:ONLY\s+)?(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s+RENAME\s+TO\s+([a-zA-Z0-9_]+)/gi)) {
      ops.push({ at: m.index, kind: 'rel', op: 'del', name: alvo(m[1], m[2]) });
      ops.push({ at: m.index + 1, kind: 'rel', op: 'add', name: alvo(m[1], m[3]) });
    }
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|ROUTINE|PROCEDURE)\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi)) {
      ops.push({ at: m.index, kind: 'fn', op: 'add', name: alvo(m[1], m[2]), sig: normArgs(m[3]) });
    }
    for (const m of sql.matchAll(/DROP\s+(?:FUNCTION|ROUTINE|PROCEDURE)(?:\s+IF\s+EXISTS)?\s+(?:([a-zA-Z0-9_]+)\.)?([a-zA-Z0-9_]+)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/gi)) {
      ops.push({ at: m.index, kind: 'fn', op: 'del', name: alvo(m[1], m[2]), sig: normArgs(m[3]) });
    }
    ops.sort((a, b) => a.at - b.at);
    for (const change of ops) {
      if (change.kind === 'fn') {
        if (change.op === 'add') addSignature(functions, change.name, change.sig);
        else dropSignature(functions, change.name, change.sig);
      } else if (change.op === 'add') {
        relations.add(change.name);
      } else {
        relations.delete(change.name);
      }
    }
  }
  return { functions, relations };
}

function main() {
  if (!fs.existsSync(CATALOG)) {
    console.error('ERRO: ' + CATALOG + ' nao encontrado. Regenere com scripts/db-audit/catalog.sql.');
    process.exit(2);
  }
  const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const projected = projectSchemaFromForwardMigrations(cat);
  const relations = projected.relations;
  const functions = projected.functions;
  const baseline = fs.existsSync(BASELINE)
    ? new Set(JSON.parse(fs.readFileSync(BASELINE, 'utf8')).known)
    : new Set();

  const violations = scan().filter((h) => {
    const alvo = h.schema + '.' + h.name;
    return h.kind === 'from' ? !relations.has(alvo) : !functions.has(alvo);
  });

  const seen = new Set();
  const novas = [];
  for (const v of violations) {
    // Chave do ratchet: o schema public fica implicito para nao invalidar o
    // baseline existente (todo ele em public); alvo de outro schema entra
    // qualificado, para nao confundir com um homonimo de public.
    const alvo = v.schema === 'public' ? v.name : v.schema + '.' + v.name;
    const key = v.kind + ':' + alvo + ':' + v.file;
    seen.add(key);
    if (!baseline.has(key)) novas.push({ ...v, key });
  }
  const obsoletas = [...baseline].filter((k) => !seen.has(k));

  console.log(
    'Catalogo: ' + cat.tables.length + ' tabelas, ' + cat.views.length +
    ' views, ' + cat.functions.length + ' funcoes, ' +
    (cat.trigger_functions || []).length + ' trigger functions (excluidas do guard .rpc())' +
    ' (gerado em ' + cat.generated_at +
    '); projecao forward-only: ' + projected.relations.size + ' relacoes, ' +
    projected.functions.size + ' funcoes',
  );
  console.log(
    'Violacoes totais: ' + violations.length +
    ' | no baseline: ' + (violations.length - novas.length) +
    ' | novas: ' + novas.length,
  );

  if (novas.length) {
    console.error('\nNOVAS violacoes - alvo nao existe no banco principal:');
    for (const v of novas) {
      console.error('  ' + v.file + ':' + v.line + '  .' + v.kind + "('" + v.name + "')");
    }
    console.error('\nSe for intencional (outro cliente Supabase), use um receptor reconhecido.');
    console.error('Se for divida tecnica conhecida, adicione a chave em scripts/db-audit/known-violations.json:');
    for (const v of [...new Set(novas.map((n) => n.key))]) console.error('  "' + v + '",');
  }
  if (obsoletas.length) {
    console.error('\nEntradas obsoletas no baseline (a violacao sumiu - remova-as):');
    for (const k of obsoletas) console.error('  ' + k);
  }

  if (novas.length || obsoletas.length) process.exit(1);
  console.log('OK: nenhuma violacao nova.');
}

main();
