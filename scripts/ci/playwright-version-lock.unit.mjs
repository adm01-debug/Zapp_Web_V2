// N-022: a versão do Playwright nos workflows deve vir do bun.lock,
// não de um literal hardcoded. Este teste falha se encontrar
// `playwright@<versão>` nos install/ install-deps dos workflows.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = new URL('../../.github/workflows/', import.meta.url);
const arquivos = (await readdir(DIR)).filter((f) => f.endsWith('.yml'));

const wf = {};
for (const f of arquivos) wf[f] = await readFile(new URL(f, DIR), 'utf8');

const ALVO = new Set(['e2e-talkx.yml', 'e2e-logado.yml']);
const nomes = Object.keys(wf).filter((f) => ALVO.has(f));

// Regex que detecta playwright com versão literal nos comandos de install.
const PIN_REGEX = /\bplaywright@[\w.-]+\s+(install|install-deps)\b/;

test('N-022: nenhum workflow tem playwright com versão literal hardcoded', () => {
  const infratores = [];
  for (const nome of nomes) {
    const linhas = wf[nome].split('\n');
    for (let i = 0; i < linhas.length; i++) {
      if (PIN_REGEX.test(linhas[i])) {
        infratores.push(`${nome}:${i + 1}: ${linhas[i].trim()}`);
      }
    }
  }
  assert.deepEqual(infratores, [], `playwright com versão literal (deve vir do bun.lock):\n${infratores.join('\n')}`);
});