// Como rodar: node --test scripts/verify-crm-integration-doc.test.mjs
// Tambem roda no CI pelo passo "Test CI and Edge deployment guards" em .github/workflows/ci.yml.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DOC = path.join(RAIZ, 'docs', 'crm-integration', 'FLAG_CHANGES.md');

// Encontra todos os arquivos que importam/usem useCRMIntegrationEnabled,
// excluindo o hook proprio, seu teste e o index de re-export.
function findUsages() {
  const resultado = spawnSync('grep', [
    '-rn',
    'useCRMIntegrationEnabled',
    '--include=*.ts',
    '--include=*.tsx',
    'src/',
  ], { cwd: RAIZ, encoding: 'utf8' });

  if (resultado.status !== 0 && resultado.status !== 1) {
    throw new Error('grep falhou: ' + resultado.stderr);
  }

  const linhas = resultado.stdout.split('\n').filter(Boolean);
  const arquivos = new Set();

  for (const linha of linhas) {
    // Ignora o proprio hook, seu teste, o index de re-export e arquivos de teste
    if (linha.includes('useCRMIntegrationEnabled.ts:') && !linha.includes('__tests__')) continue;
    if (linha.includes('useCRMIntegrationEnabled.test.tsx')) continue;
    if (linha.includes('hooks/system/index.ts')) continue;
    // Exclui arquivos de teste (__tests__/) e mocks — nao sao usos em producao
    if (linha.includes('__tests__/')) continue;
    if (linha.match(/\.test\.(tsx?|mjs)$/)) continue;

    // Extrai o caminho do arquivo (formato: src/caminho/arquivo.ts:NN)
    const match = linha.match(/^(src\/[^:]+)/);
    if (match) {
      arquivos.add(match[1]);
    }
  }

  return [...arquivos].sort();
}

test('documento FLAG_CHANGES.md contem todos os usos de useCRMIntegrationEnabled', () => {
  assert.equal(fs.existsSync(DOC), true, 'documento FLAG_CHANGES.md nao existe');

  const conteudo = fs.readFileSync(DOC, 'utf8');
  const usagens = findUsages();

  assert.ok(usagens.length > 0, 'nenhum uso em producao encontrado; o grep pode estar quebrado');

  for (const arquivo of usagens) {
    // Exige o caminho completo `src/...` dentro de backticks numa linha de
    // tabela (| ... | `src/...` | ... |). Basename solto em qualquer lugar do
    // doc nao vale: ele pode vir da coluna de nome do hook e mascarar um uso
    // faltando.
    const linhaTabela = new RegExp(
      '^\\|[^\\n]*`' + arquivo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^`]*`[^\\n]*\\|',
      'm',
    );

    assert.equal(
      linhaTabela.test(conteudo),
      true,
      `uso de useCRMIntegrationEnabled em ${arquivo} nao encontrado como caminho completo src/... em linha de tabela no documento FLAG_CHANGES.md`,
    );
  }
});
