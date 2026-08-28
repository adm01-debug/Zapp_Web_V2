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
          const before = src.slice(Math.max(0, m.index - 90), m.index);
          if (NON_MAIN.test(before)) continue;
          found.push({
            kind,
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

function main() {
  if (!fs.existsSync(CATALOG)) {
    console.error('ERRO: ' + CATALOG + ' nao encontrado. Regenere com scripts/db-audit/catalog.sql.');
    process.exit(2);
  }
  const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const relations = new Set([...cat.tables, ...cat.views]);
  const functions = new Set(cat.functions);
  const baseline = fs.existsSync(BASELINE)
    ? new Set(JSON.parse(fs.readFileSync(BASELINE, 'utf8')).known)
    : new Set();

  const violations = scan().filter((h) =>
    h.kind === 'from' ? !relations.has(h.name) : !functions.has(h.name),
  );

  const seen = new Set();
  const novas = [];
  for (const v of violations) {
    const key = v.kind + ':' + v.name + ':' + v.file;
    seen.add(key);
    if (!baseline.has(key)) novas.push({ ...v, key });
  }
  const obsoletas = [...baseline].filter((k) => !seen.has(k));

  console.log(
    'Catalogo: ' + cat.tables.length + ' tabelas, ' + cat.views.length +
    ' views, ' + cat.functions.length + ' funcoes (gerado em ' + cat.generated_at + ')',
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
