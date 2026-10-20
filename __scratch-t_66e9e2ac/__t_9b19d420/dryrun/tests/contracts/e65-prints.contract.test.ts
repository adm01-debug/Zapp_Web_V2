/**
 * E65 · Prints obrigatórios do combobox de endereço (FASE 6, acessibilidade/mobile).
 *
 * O que a etapa pede: 4 prints em `docs/mapa/prints/` — desktop em 1280 px, largura de celular
 * (360 px), teclado virtual aberto e tema escuro — cada um PNG de no máximo 200 KB.
 *
 * Este contrato pina o que o repositório consegue verificar sozinho:
 *   1. todo PNG da pasta `docs/mapa/prints/` cabe no limite de 200 KB (204800 bytes);
 *   2. os três prints do E65 (os que existem) estão presentes, são PNG de verdade e têm a largura
 *      que a etapa define — 1280 px no desktop, 360 px no celular e 1280 px no tema escuro.
 *
 * O quarto print (teclado virtual aberto) depende de aparelho real, não é simulável em browser
 * headless e segue declarado como pendente em `docs/mapa/prints/README.md` — é o item que mantém a
 * etapa PARCIAL. Nenhuma imagem foi sintetizada para "fechar" esse item.
 *
 * Vermelho antes: o `f3-desktop.png` da FASE 3 (que fica na mesma pasta) estava com 215968 bytes
 * até o PR #1580 comprimi-lo para 103541 bytes; rodando este contrato com o arquivo antigo, o
 * primeiro caso falha apontando `f3-desktop.png (215968 bytes)`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PASTA = 'docs/mapa/prints';

/** Limite de tamanho por PNG que a etapa E65 define. */
const LIMITE_PNG_BYTES = 200 * 1024;

const MAGIC_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Largura declarada pelo cabeçalho IHDR do PNG (bytes 16..19, big-endian). Lança se não for PNG. */
function larguraDoPng(caminho: string): number {
  const cabecalho = readFileSync(caminho).subarray(0, 24);
  if (!cabecalho.subarray(0, 8).equals(MAGIC_PNG)) {
    throw new Error(`${caminho} não é um PNG (magic bytes do formato ausentes)`);
  }
  return cabecalho.readUInt32BE(16);
}

/** Prints do E65 esperados no repo, com a largura em pixels que a etapa pede. */
const PRINTS_DO_E65 = [
  { arquivo: 'desktop-1280.png', largura: 1280 },
  { arquivo: 'mobile-360.png', largura: 360 },
  { arquivo: 'tema-escuro.png', largura: 1280 },
];

describe('E65 · prints do combobox de endereço', () => {
  it('todo PNG de docs/mapa/prints cabe no limite de 200 KB da etapa', () => {
    const pngs = readdirSync(PASTA).filter((nome) => nome.endsWith('.png'));
    expect(pngs.length).toBeGreaterThan(0);

    const acimaDoLimite = pngs
      .map((nome) => ({ nome, bytes: statSync(join(PASTA, nome)).size }))
      .filter(({ bytes }) => bytes > LIMITE_PNG_BYTES)
      .map(({ nome, bytes }) => `${nome} (${bytes} bytes)`);

    expect(acimaDoLimite).toEqual([]);
  });

  it('os três prints do E65 estão no repo e têm a largura que a etapa pede', () => {
    for (const { arquivo, largura } of PRINTS_DO_E65) {
      const caminho = join(PASTA, arquivo);
      expect(statSync(caminho).isFile()).toBe(true);
      expect(larguraDoPng(caminho)).toBe(largura);
    }
  });
});
