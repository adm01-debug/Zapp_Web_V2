#!/usr/bin/env node
/**
 * lint-migrations-content.mjs — E31 (porte V3 -> V2, cartao t_2e6a6730)
 *
 * Lint ESTATICO do CONTEUDO das migrations. Onde o check-migration-drift.mjs
 * olha nome, formato, duplicata e SQL vazio, este olha o que o SQL FAZ.
 *
 * Roda sobre os arquivos ALTERADOS no PR (env CHANGED_FILES, como
 * scripts/lint-migrations.mjs da V3). Nao varre a divida historica: em
 * 12/10/2026 o diretorio tem 831 migrations ja aplicadas e varias casam nas
 * regras abaixo — o portao existe para barrar o que ENTRA, nao para reprovar
 * o que ja esta la.
 *
 * Regras (todas bloqueantes):
 *   ML-001  SECURITY DEFINER sem SET search_path
 *   ML-004  CREATE TABLE de app (public./zapp.) sem ENABLE ROW LEVEL SECURITY
 *   ML-005  GRANT EXECUTE ... TO PUBLIC|anon em funcao de app
 *   ML-008  SECURITY DEFINER com GRANT EXECUTE TO authenticated sem checagem
 *           do chamador no corpo (auth.uid(), auth.role(), has_role() ou
 *           current_profile_id()) — escalada horizontal de privilegio
 *   ANTIPADRAO  EXCEPTION WHEN OTHERS THEN ... RAISE NOTICE engolindo a falha
 *           (log sem re-raise: o bloco termina "OK" com erro). `RAISE NOTICE ...;
 *           RAISE;` e o padrao correto e passa.
 *
 * Excecoes documentadas no manifesto: um arquivo cujo basename consta em
 * `exceptions[]` do manifesto de excecoes do check-migration-drift.mjs
 * (padrao: scripts/db-audit/migration-evidence.json) e dispensado deste lint —
 * o conteudo dele ja e fixado por file_sha256 no manifesto, entao qualquer
 * edicao e recusada pelo drift checker; repetir o aviso aqui nao acrescenta
 * guarda. O caminho do manifesto pode ser trocado por MIGRATION_LINT_MANIFEST.
 *
 * Uso:
 *   node scripts/db-audit/lint-migrations-content.mjs                 # varre o diretorio inteiro
 *   CHANGED_FILES=$'supabase/migrations/a.sql\nsupabase/migrations/b.sql' \
 *     node scripts/db-audit/lint-migrations-content.mjs               # so os alterados (CI)
 *   MIGRATIONS_DIR=<fixtures> node scripts/db-audit/lint-migrations-content.mjs   # testes
 *
 * Exit: 0 = nenhuma violacao (ou nada para lintar); 1 = violacao.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const MIGRATION_DIR = process.env.MIGRATIONS_DIR || 'supabase/migrations';
const MANIFEST_PATH = process.env.MIGRATION_LINT_MANIFEST
  || 'scripts/db-audit/migration-evidence.json';
const TIMESTAMP_RE = /^\d{14}_.*\.sql$/;

// ── Selecao dos arquivos ────────────────────────────────────────────────────
// CI: CHANGED_FILES (lista separada por \n) e filtrada para as migrations.
// Local/teste: varredura completa do diretorio, em ordem de versao.
const changedEnv = process.env.CHANGED_FILES;
let files = [];

if (changedEnv) {
  files = changedEnv
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.startsWith(`${MIGRATION_DIR}/`) && f.endsWith('.sql'));
} else {
  try {
    files = readdirSync(MIGRATION_DIR)
      .filter((f) => TIMESTAMP_RE.test(f))
      .sort()
      .map((f) => join(MIGRATION_DIR, f));
  } catch {
    console.log(`lint-migrations-content: ${MIGRATION_DIR}/ nao encontrado — nada a lintar.`);
    process.exit(0);
  }
}

if (files.length === 0) {
  console.log('lint-migrations-content: nenhuma migration alterada — nada a lintar.');
  process.exit(0);
}

// ── Excecoes documentadas no manifesto ──────────────────────────────────────
function loadManifestExceptions() {
  const dispensados = new Set();
  let raw;
  try {
    raw = readFileSync(MANIFEST_PATH, 'utf8');
  } catch {
    return dispensados;
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return dispensados;
  }
  for (const entry of manifest.exceptions || []) {
    if (entry && typeof entry.filename === 'string') {
      dispensados.add(basename(entry.filename));
    }
  }
  return dispensados;
}

const dispensados = loadManifestExceptions();

// ── Violacoes ───────────────────────────────────────────────────────────────
const violations = [];

function add(filePath, line, rule, message) {
  violations.push({ file: basename(filePath), line, rule, message });
}

// ANTIPADRAO: handler que engole a falha. Mesma definicao do
// check-migration-gates.mjs da V3 (achado A) — regex tolerante a quebra de
// linha, janela de 120 chars para o RAISE NOTICE.
const SWALLOW_RE = /EXCEPTION\s+WHEN\s+OTHERS\s+THEN[\s\S]{0,120}?RAISE\s+NOTICE\b/i;
const RE_RAISE_RE = /RAISE\s*;|RAISE\s+EXCEPTION\b/i;

// Mascara, DENTRO de cada linha, o comentario `-- ...` e o conteudo de string
// entre aspas simples. Sem isso, o texto da justificativa — que a V2 cita em
// `comment on function ... is '... SECURITY DEFINER ...'` — casaria ML-001 (falso
// positivo real no merge dia/2026-10-12) e DDL comentada casaria ML-005. A
// numeracao das linhas e preservada. Heuristica por linha: string quebrada em
// varias linhas perde o mascaramento na segunda, o que so pode ACRESCENTAR
// deteccao, nunca esconder DDL.
function maskSqlLine(line) {
  let out = '';
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (!inString && ch === '-' && line[i + 1] === '-') break;
    if (ch === "'") {
      inString = !inString;
      out += ' ';
      continue;
    }
    out += inString ? ' ' : ch;
  }
  return out;
}

function hasImmediateReRaise(content, fromIdx) {
  const semi = content.indexOf(';', fromIdx);
  if (semi === -1) return false;
  return RE_RAISE_RE.test(content.slice(semi, semi + 160));
}

// ML-005: pega GRANT multilinha que a varredura por linha deixaria passar.
// Comentarios de linha sao removidos antes (DDL comentada nao viola).
const GRANT_TO_RE = /GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]{0,600}?\bTO\s+(PUBLIC|anon)\b/gi;
const GRANT_EXEMPT_RE = /--\s*(stub|bootstrap|ci[.-]only|exempt|ignore-lint-ml005)/i;

let lintadas = 0;

for (const filePath of files) {
  let src;
  try {
    src = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }

  const fileName = basename(filePath);
  if (dispensados.has(fileName)) {
    console.log(`i  [EXCECAO-MANIFESTO] ${fileName} — excecao documentada no manifesto, dispensada.`);
    continue;
  }
  lintadas += 1;

  const lines = src.split('\n');
  const codeLines = lines.map(maskSqlLine);
  const codeText = codeLines.join('\n');

  // ── ML-001: SECURITY DEFINER sem SET search_path ─────────────────────────
  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i];
    if (/^\s*--/.test(lines[i])) continue;
    if (!/SECURITY\s+DEFINER/i.test(line)) continue;
    // "SECURITY DEFINER" dentro de mensagem de RAISE nao e definicao de funcao.
    if (/\bRAISE\b/i.test(lines[i])) continue;
    const window = codeLines.slice(i, Math.min(i + 20, codeLines.length)).join('\n');
    if (/SET\s+search_path\s*=/i.test(window) || /SET\s+search_path\s+TO/i.test(window)) continue;
    const priorContext = lines.slice(Math.max(0, i - 5), i).join('\n');
    const isStub = /--\s*(stub|mock|dummy|ci[.-]only)/i.test(priorContext)
      || /--\s*ignore-lint-ml001/i.test(lines[i]);
    if (isStub) continue;
    add(
      filePath, i + 1, 'ML-001',
      'SECURITY DEFINER sem SET search_path. Adicione: LANGUAGE plpgsql SET search_path = public SECURITY DEFINER; '
      + '(ou -- ignore-lint-ml001 se for stub de CI).',
    );
  }

  // ── ML-004: CREATE TABLE de app sem ENABLE ROW LEVEL SECURITY ────────────
  // Na V2 as tabelas de app vivem em `public.` (a V3 usa `zapp.`); aceita os dois.
  const CREATE_APP_TABLE_RE = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public|zapp)\.(\w+)/i;
  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i];
    if (/^\s*--/.test(lines[i])) continue;
    const ctMatch = line.match(CREATE_APP_TABLE_RE);
    if (!ctMatch) continue;
    const window = codeLines.slice(i, Math.min(i + 60, codeLines.length)).join('\n');
    if (/ALTER\s+TABLE\s+(?:(?:IF\s+EXISTS\s+)?(?:public|zapp)\.)?[\w.]+\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(window)) continue;
    if (/--\s*ignore-lint-ml004/i.test(lines[i])) continue;
    const rawWindow = lines.slice(i, Math.min(i + 60, lines.length)).join('\n');
    if (/rls[.\s-]*disabled[.\s-]*intentionally/i.test(rawWindow)) continue;
    add(
      filePath, i + 1, 'ML-004',
      `CREATE TABLE ${ctMatch[1]} sem ALTER TABLE ... ENABLE ROW LEVEL SECURITY na mesma migration. `
      + 'Toda tabela de app exige RLS (ou -- ignore-lint-ml004 com a justificativa, se ja habilitado antes).',
    );
  }

  // ── ML-005: GRANT EXECUTE TO PUBLIC|anon ─────────────────────────────────
  GRANT_TO_RE.lastIndex = 0;
  let grantMatch;
  while ((grantMatch = GRANT_TO_RE.exec(codeText)) !== null) {
    const line = codeText.slice(0, grantMatch.index).split('\n').length;
    const contexto = [lines[line - 1] ?? '', lines[line - 2] ?? ''].join('\n');
    if (GRANT_EXEMPT_RE.test(contexto)) continue;
    add(
      filePath, line, 'ML-005',
      `GRANT EXECUTE TO ${grantMatch[1]} em funcao de app. Usuarios anonimos nao podem executar funcoes de app: `
      + 'use TO authenticated ou TO service_role (ou -- ignore-lint-ml005 se for stub).',
    );
  }

  // ── ML-008: SECURITY DEFINER + GRANT TO authenticated sem checagem ───────
  {
    const hasSecDefiner = /SECURITY\s+DEFINER/i.test(codeText);
    const grantAuthenticated = /GRANT\s+EXECUTE\s+ON\s+FUNCTION\b[^;]*\bTO\s+authenticated\b/i;
    if (hasSecDefiner && grantAuthenticated.test(codeText)) {
      const dollarBlocks = [...src.matchAll(/\$(\w*)\$([\s\S]*?)\$\1\$/g)].map((m) => m[2]);
      const bodyText = dollarBlocks.length > 0 ? dollarBlocks.join('\n') : codeText;
      // O cartao nomeia auth.uid()/has_role(); entram tambem os padroes
      // canonicos equivalentes da V2 — auth.role() (e o que o proprio ML-008 da
      // V3 aceita) e current_profile_id() (helper de identidade do chamador das
      // RPCs da V2). Sem os dois, 4 RPCs legitimas do merge dia/2026-10-12
      // seriam falso positivo.
      const temGuarda = /auth\.uid\s*\(\)/i.test(bodyText)
        || /auth\.role\s*\(\)/i.test(bodyText)
        || /has_role\s*\(/i.test(bodyText)
        || /current_profile_id\s*\(/i.test(bodyText);
      if (!temGuarda) {
        // O GRANT pode estar quebrado em varias linhas: localiza pelo indice
        // real no texto mascarado (findIndex por linha reportava a linha 1).
        const grantMatch2 = codeText.match(grantAuthenticated);
        const grantIdx = grantMatch2
          ? codeText.slice(0, grantMatch2.index).split('\n').length - 1
          : 0;
        const grantLineNum = grantIdx + 1;
        const isExempt = /--\s*ignore-lint-ml008/i.test(lines[grantIdx] ?? '');
        if (!isExempt) {
          add(
            filePath, grantLineNum, 'ML-008',
            'Funcao SECURITY DEFINER com GRANT TO authenticated sem checagem do chamador no corpo '
            + '(auth.uid(), auth.role(), has_role() ou current_profile_id()) — qualquer authenticated '
            + "chama em nome de outro usuario. Adicione IF auth.uid() IS NULL THEN RAISE EXCEPTION "
            + "'unauthenticated'; END IF; ou -- ignore-lint-ml008.",
          );
        }
      }
    }
  }

  // ── ANTIPADRAO: EXCEPTION WHEN OTHERS THEN ... RAISE NOTICE ──────────────
  {
    const mAnti = codeText.match(SWALLOW_RE);
    if (mAnti && !hasImmediateReRaise(codeText, mAnti.index + mAnti[0].length)) {
      const line = codeText.slice(0, mAnti.index).split('\n').length;
      add(
        filePath, line, 'ANTIPADRAO',
        'EXCEPTION WHEN OTHERS THEN com RAISE NOTICE engole a falha (o bloco termina "OK" com erro). '
        + 'Use RAISE EXCEPTION ou faca RAISE NOTICE ...; RAISE; (re-raise imediato).',
      );
    }
  }
}

// ── Relatorio ───────────────────────────────────────────────────────────────
if (violations.length === 0) {
  console.log(`ok lint-migrations-content: ${lintadas} migration(s) verificada(s) — 0 violacoes.`);
  process.exit(0);
}

console.error(`lint-migrations-content: ${violations.length} violacao(oes) em ${lintadas} migration(s)\n`);
for (const v of violations) {
  console.error(`[${v.rule}] ${v.file}:${v.line}`);
  console.error(`   ${v.message}\n`);
}
console.error('Detalhes das regras: scripts/db-audit/lint-migrations-content.mjs');
process.exit(1);
