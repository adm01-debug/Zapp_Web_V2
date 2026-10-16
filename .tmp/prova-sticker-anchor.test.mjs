#!/usr/bin/env node
// Prova do drift de espelho ESTADO.md:70 (edge classify-sticker), em node:test
// para gerar sumário padrão (pass/fail). Espelha a regra do CI
// ("cada âncora contém a própria edge"), restrito à linha classify-sticker:
// cada âncora `arquivo:linha` da linha tem um teste próprio que exige que a
// linha citada do código contenha o nome da edge. Só lê arquivos reais.
// ESTADO_PATH permite rodar contra outra cópia do ESTADO.md (prova do vermelho).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = 'classify-sticker';
const estadoPath = process.env.ESTADO_PATH || path.join(raiz, 'ESTADO.md');
const linha = fs.readFileSync(estadoPath, 'utf8')
  .split('\n')
  .find((l) => l.startsWith(`| \`${EDGE}\` |`));
assert.ok(linha, `linha \`${EDGE}\` ausente em ESTADO.md`);
const ancoras = [...linha.matchAll(/`([^`]+:\d+)`/g)].map((m) => m[1]);
assert.ok(ancoras.length > 0, 'linha sem âncoras');

for (const ancora of ancoras) {
  test(`âncora ${ancora} cita \`${EDGE}\``, () => {
    const [arquivo, numero] = ancora.split(/:(?=\d+$)/);
    const caminho = path.join(raiz, arquivo);
    assert.ok(fs.existsSync(caminho), `arquivo não existe: ${ancora}`);
    const conteudo = fs.readFileSync(caminho, 'utf8').split('\n')[Number(numero) - 1] || '';
    assert.ok(conteudo.includes(EDGE), `âncora desatualizada: ${ancora} não cita \`${EDGE}\``);
  });
}
