import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Reutiliza no CI obrigatório a suíte Python do produtor, sem duplicar os testes.
test('gerador de regras: regressões offline de fontes SQL', () => {
  execFileSync('python3', [fileURLToPath(new URL('../regras_negocio/test_generate.py', import.meta.url))], {
    encoding: 'utf8', stdio: 'pipe', timeout: 60_000,
  });
});
