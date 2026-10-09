/**
 * E43/E44 (SL-177) — a escala fluida morta não pode voltar.
 *
 * Antes da correção este teste reprovava em três frentes: o tailwind.config.ts
 * declarava as 8 chaves `fontSize.fluid-*`, o src usava `text-fluid-*` em 2
 * pontos (PageTemplate) e o tokens.css declarava os 8 tokens `--text-*` — cujo
 * único consumidor eram justamente aquelas chaves do Tailwind, ou seja, órfãos
 * depois de a escala sair.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Chave de fontSize no Tailwind: `"fluid-xs": "var(--text-xs)"`. */
const CHAVE_FLUID_NO_CONFIG = /^\s*"?fluid-[a-z0-9-]+"?\s*:/m;

/** Classe utilitária da escala fluida, com os 8 nomes que existiam. */
const CLASSE_FLUID_NO_SRC = /\btext-fluid-(?:xs|sm|base|lg|xl|2xl|3xl|4xl)\b/;

/** Declaração de custom property de tipografia fluida no CSS. */
const TOKEN_TEXT_NO_CSS = /--text-[a-z0-9]+\s*:/;

const TOKENS_ESPERADOS = [
  '--text-xs',
  '--text-sm',
  '--text-base',
  '--text-lg',
  '--text-xl',
  '--text-2xl',
  '--text-3xl',
  '--text-4xl',
] as const;

function ler(caminho: string): string {
  return readFileSync(caminho, 'utf8');
}

/** Caminhos de todos os .ts/.tsx dentro de src. */
function fontesDeSrc(dir = 'src', acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) fontesDeSrc(caminho, acc);
    else if (/\.tsx?$/.test(entrada.name)) acc.push(caminho);
  }
  return acc;
}

describe('escala fluida morta (E43/E44)', () => {
  it('não declara fontSize.fluid-* em tailwind.config.ts', () => {
    const config = ler('tailwind.config.ts');
    expect(config.match(CHAVE_FLUID_NO_CONFIG) ?? []).toEqual([]);
  });

  it('não usa a classe text-fluid-* em nenhum arquivo de src', () => {
    const comUso = fontesDeSrc().filter((arquivo) => CLASSE_FLUID_NO_SRC.test(ler(arquivo)));
    expect(comUso).toEqual([]);
  });

  it('não declara os tokens --text-* órfãos em tokens.css', () => {
    const css = ler('src/styles/tokens.css');
    const orfaos = TOKENS_ESPERADOS.filter((token) => new RegExp(`${token}\\s*:`).test(css));
    expect(orfaos).toEqual([]);
  });
});
