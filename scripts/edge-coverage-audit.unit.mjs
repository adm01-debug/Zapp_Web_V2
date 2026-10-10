import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const __dirname = join(fileURLToPath(import.meta.url), '..');
const workspace = join(__dirname, '..');
const script = join(workspace, 'scripts', 'edge-coverage-audit.sh');
const auditFile = join(workspace, 'docs', 'audits', 'edge-functions-authz-coverage.md');

// OTH-014 / EN-088 (#154) — a régua de cobertura dos helpers de autorização
// das Edge Functions precisa existir, ser reproduzível e registrar o número
// de cobertura de linhas dos cinco arquivos *authz/*auth*.
//
// Esta guarda trava a PONTA ESTÁVEL: a existência do script, a existência
// do relatório de auditoria e a reprodutibilidade entre duas execuções
// idênticas. A verificação COMPORTAMENTAL (o número de cobertura real)
// mora no próprio relatório gerado, não aqui: esta guarda só confere que
// o script roda, produz um arquivo válido e o segundo run bate no primeiro.

test('o script de auditoria de cobertura existe e é executável', () => {
  assert.ok(existsSync(script), 'o arquivo edge-coverage-audit.sh existe no workspace');
  assert.ok(statSync(script).mode & 0o111, 'o script edge-coverage-audit.sh é executável');
});

test('a execução do script gera o relatório de cobertura em docs/audits/', () => {
  // Garante que o arquivo não existe antes da primeira execução.
  try { unlinkSync(auditFile); } catch { /* já não existe */ }

  execSync(`bash "${script}"`, { cwd: workspace, encoding: 'utf8', timeout: 120_000 });

  assert.ok(existsSync(auditFile), 'o relatório de cobertura foi gerado em docs/audits/');
  const content = readFileSync(auditFile, 'utf8');
  assert.ok(content.includes('# Cobertura de linhas'), 'o relatório não tem o título esperado');
  for (const helper of ['ai-auth.ts', 'ai-audio-authz.ts', 'cron-secret-auth.ts', 'evolution-control-authz.ts', 'voice-copilot-authz.ts']) {
    assert.ok(content.includes(helper), `o relatório não inclui o helper "${helper}"`);
  }
});

test('o relatório de cobertura existe e contém os cinco helpers de autorização', () => {
  const content = readFileSync(auditFile, 'utf8');

  assert.ok(content.includes('# Cobertura de linhas'), 'o relatório não tem o título esperado');

  for (const helper of ['ai-auth.ts', 'ai-audio-authz.ts', 'cron-secret-auth.ts', 'evolution-control-authz.ts', 'voice-copilot-authz.ts']) {
    assert.ok(content.includes(helper), `o relatório não inclui o helper "${helper}"`);
  }

  // Cada helper deve ter uma linha com um percentual de cobertura.
  const pctRegex = /\| .*\.ts \| \d+(\.\d+)?% \|/;
  const lines = content.split('\n').filter((l) => l.startsWith('|') && l.includes('.ts'));
  assert.ok(lines.length >= 5, `esperado pelo menos 5 linhas de cobertura, encontradas ${lines.length}`);
  for (const line of lines) {
    assert.match(line, pctRegex, `linha sem percentual válido: "${line}"`);
  }
});

test('segunda execução idêntica reproduz o mesmo número de cobertura', () => {
  // Captura o conteúdo atual (primeira execução).
  const primeiro = readFileSync(auditFile, 'utf8');

  // Roda o script novamente.
  execSync(`bash "${script}"`, { cwd: workspace, encoding: 'utf8', timeout: 120_000 });

  // Captura o conteúdo após a segunda execução.
  const segundo = readFileSync(auditFile, 'utf8');

  // Extrai as linhas de cobertura (ignora cabeçalho e timestamp).
  const linhasPrimeiro = primeiro.split('\n').filter((l) => l.startsWith('|') && l.includes('.ts'));
  const linhasSegundo = segundo.split('\n').filter((l) => l.startsWith('|') && l.includes('.ts'));

  assert.equal(linhasPrimeiro.length, linhasSegundo.length, 'número de helpers difere entre as execuções');
  for (let i = 0; i < linhasPrimeiro.length; i++) {
    assert.equal(linhasPrimeiro[i], linhasSegundo[i], `linha ${i} difere entre as execuções`);
  }
});