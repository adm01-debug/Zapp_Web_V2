// E62: extrai os contratos de runtime que hoje vivem embutidos no passo
// "Provar estado runtime antes do push" do db-migrate.yml.
//
// Originalmente o passo era um `case "$TARGET_VERSION"` com um braco por versao de
// migration. Cada braco montava uma consulta que extraia o fingerprint do estado runtime
// daquele alvo (`runtime_sha256`), e o valor era comparado ao CONFIRM_RUNTIME_SHA256
// (composicao da E64). Os contratos foram extraidos para `scripts/db-audit/contracts/`
// em 01/10/2026 (E62), e o workflow foi refatorado para delegar a execucao ao
// `run-runtime-contract.mjs`. Este script e idempotente: relata os contratos existentes
// se a extracao ja foi concluida; caso contrario tenta extrair do formato atual.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const FONTE = '.github/workflows/db-migrate.yml';
const PASSO = '- name: Provar estado runtime antes do push';
const SAIDA = 'scripts/db-audit/contracts';
const EVIDENCIA = 'docs/audits/evidence/db-migrate-contratos-historicos.md';

const sha256 = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

// Verificar se a extracao ja foi concluida anteriormente.
// O workflow foi refatorado de `case "$TARGET_VERSION"` para Node.js `if/else if`
// em 01/10/2026, delegando a execucao aos arquivos `.sql` em SAIDA.
// Se os contratos existem, reportar e sair com sucesso.
if (existsSync(SAIDA)) {
  const sqls = readdirSync(SAIDA).filter((f) => f.endsWith('.sql'));
  if (sqls.length > 0) {
    sqls.sort();
    const totalBytes = sqls.reduce((acc, f) => {
      try { return acc + statSync(join(SAIDA, f)).size; } catch { return acc; }
    }, 0);
    console.log(`[E62] extracao ja concluida: ${sqls.length} contratos em ${SAIDA}`);
    console.log(`total: ${totalBytes} bytes`);
    for (const f of sqls.slice(0, 6)) console.log(`  ${f}`);
    if (sqls.length > 6) console.log(`  ... e mais ${sqls.length - 6}`);
    if (existsSync(EVIDENCIA)) console.log(`evidencia: ${EVIDENCIA}`);
    process.exit(0);
  }
}

const linhas = readFileSync(FONTE, 'utf8').split('\n');

// 1. delimita o passo: do `- name:` ate o proximo `      - name:` no mesmo nivel.
const inicio = linhas.findIndex((l) => l.startsWith('      ' + PASSO));
if (inicio < 0) throw new Error('passo nao encontrado: ' + PASSO);
let fim = inicio + 1;
while (fim < linhas.length && !linhas[fim].startsWith('      - name:')) fim += 1;
const bloco = linhas.slice(inicio, fim);
const offset = inicio + 1; // 1-based

// 2. cada braco comeca numa linha `            <14 digitos>)` (formato shell case).
// Tambem suporta o formato Node.js: `if (process.env.TARGET_VERSION === '<14 digitos>') {`
const bracos = [];
bloco.forEach((l, i) => {
  const mShell = /^ {12}(\d{14})\)\s*$/.exec(l);
  if (mShell) { bracos.push({ versao: mShell[1], i, formato: 'shell' }); return; }
  const mNode = /TARGET_VERSION\s*===?\s*['"](\d{14})['"]/.exec(l);
  if (mNode) bracos.push({ versao: mNode[1], i, formato: 'node' });
});
if (bracos.length === 0) {
  throw new Error(
    'nenhum braco de versao encontrado em ' + PASSO + '\n' +
    'O workflow pode ter sido refatorado. Se os contratos ja existem em ' + SAIDA +
    ', a extracao foi concluida e este script nao precisa ser re-executado.',
  );
}

mkdirSync(SAIDA, { recursive: true });
const registros = [];
bracos.forEach(({ versao, i }, n) => {
  const ate = n + 1 < bracos.length ? bracos[n + 1].i : bloco.length;
  const corpo = bloco.slice(i + 1, ate);
  const ultimo = corpo.map((l, k) => (l.trim() === ';;' ? k : -1)).filter((k) => k >= 0).pop();
  const util = ultimo === undefined ? corpo : corpo.slice(0, ultimo);
  const texto = util.join('\n');
  const arquivo = join(SAIDA, `${versao}.sql`);
  writeFileSync(arquivo, texto + '\n');
  registros.push({
    versao,
    arquivo,
    linhasDeOrigem: `${offset + i}–${offset + i + util.length}`,
    linhasUteis: util.filter((l) => l.trim() && !l.trim().startsWith('#')).length,
    sha256: sha256(texto),
  });
});

const doc = [
  '# Contratos historicos do `db-migrate.yml` (E62)',
  '',
  'Gerado por `scripts/db-audit/extrair-contratos-runtime.mjs` a partir de `origin/main`.',
  'Cada contrato e o corpo de um braco do `case "$TARGET_VERSION"` do passo',
  '`Provar estado runtime antes do push`, extraido **sem alteracao de texto**.',
  '',
  '## Por que isto existe',
  '',
  'O passo e a rede de protecao que roda **antes** de aplicar uma migration em producao:',
  'extrai o fingerprint do estado runtime do alvo e o compara ao `CONFIRM_RUNTIME_SHA256`',
  '(composicao da E64). Reduzir o workflow a ~150 linhas so e seguro se a **mesma consulta**',
  'continuar rodando, agora vinda de um arquivo. Por isso a equivalencia aqui e textual:',
  'o arquivo e o braco de origem tem o mesmo `sha256`.',
  '',
  '## Como reexecutar um contrato sob demanda',
  '',
  '```bash',
  'node scripts/db-audit/psql-safe.mjs -X -v ON_ERROR_STOP=1 -At -c "$(cat scripts/db-audit/contracts/<versao>.sql)"',
  '```',
  '',
  'Em producao, o executor generico do workflow faz exatamente isso para a versao alvo.',
  '',
  '## Contratos',
  '',
  '| versao | arquivo | linhas uteis | linhas de origem | sha256 (texto extraido) |',
  '| --- | --- | --- | --- | --- |',
  ...registros.map((r) => `| \`${r.versao}\` | \`${r.arquivo}\` | ${r.linhasUteis} | ${r.linhasDeOrigem} | \`${r.sha256.slice(0, 16)}...\` |`),
  '',
  `Total: **${registros.length}** contratos, ${registros.reduce((a, r) => a + r.linhasUteis, 0)} linhas uteis extraidas do workflow.`,
  '',
].join('\n');
writeFileSync(EVIDENCIA, doc);

console.log(`contratos extraidos: ${registros.length}`);
console.log(`linhas uteis no total: ${registros.reduce((a, r) => a + r.linhasUteis, 0)}`);
for (const r of registros.slice(0, 4)) console.log(`  ${r.versao} -> ${r.arquivo} (${r.linhasUteis} linhas uteis, origem ${r.linhasDeOrigem})`);
console.log(`dados completos em ${EVIDENCIA}`);
