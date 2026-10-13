/**
 * Cartão t_ee2824b6 — RD-002 (redesign de Contatos): contrato dos tokens `--contacts-*`.
 *
 * O que este teste prova: o CONTRATO DE DEFINIÇÃO dos tokens do redesign — todo token
 * `--contacts-*` precisa existir em `:root` (claro) e em `.dark` (escuro), com o formato
 * combinado no cartão (superfícies em trinca HSL sem `hsl()`, raios em px, gradientes como
 * `linear-gradient`, sombras derivadas de `--elev-*`). Se alguém remover um token de um tema
 * ou colar um hex solto, fica vermelho.
 *
 * O que este teste NÃO prova: aparência (cor computada, contraste, tamanho, layout). Isso é
 * do navegador e será medido na fase de captura visual (RD-010); jsdom não carrega o CSS do app.
 *
 * Referência de design → token: docs/design/contatos-redesign-2026-10-12/MAPA-TOKENS.md.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../tokens.css'), 'utf8');

/** Extrai as variáveis declaradas dentro do bloco cujo cabeçalho começa em `header`. */
function extractBlock(header: string): Record<string, string> {
  const idx = css.indexOf(header);
  if (idx === -1) return {};
  const start = css.indexOf('{', idx);
  let depth = 1;
  let i = start + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') depth--;
    i++;
  }
  const body = css.slice(start + 1, i - 1).replace(/\/\*[\s\S]*?\*\//g, '');
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}

const themes = { claro: extractBlock(':root'), escuro: extractBlock('.dark') } as const;
const TEMAS = ['claro', 'escuro'] as const;

// Superfícies em níveis: trinca HSL sem hsl() — o consumidor escreve hsl(var(--contacts-*)).
const SUPERFICIES = [
  'contacts-page',
  'contacts-panel',
  'contacts-raised',
  'contacts-line',
  'contacts-line-soft',
] as const;

const GRADIENTES = ['contacts-card-gradient', 'contacts-icon-tile'] as const;
const SOMBRAS = ['contacts-select-glow', 'contacts-hover-shadow', 'contacts-dialog-shadow'] as const;
const RAIOS: Record<string, number> = {
  'contacts-radius-stat': 11,
  'contacts-radius-card': 13,
  'contacts-radius-dialog': 17,
};

const TODOS = [...SUPERFICIES, ...GRADIENTES, ...SOMBRAS, ...Object.keys(RAIOS)];

const HSL = /^\d+(?:\.\d+)? \d+(?:\.\d+)?% \d+(?:\.\d+)?%$/;

describe('tokens --contacts-* — contrato de definição (RD-002)', () => {
  it('o parser lê os dois temas de verdade (base --background e --primary presentes)', () => {
    // Sem isto, um erro de parsing faria o contrato passar vazio (teste tautológico).
    for (const tema of TEMAS) {
      expect(themes[tema]['background'], `--background ausente em ${tema}`).toBeTruthy();
      expect(themes[tema]['primary'], `--primary ausente em ${tema}`).toBeTruthy();
    }
  });

  it('todo token existe nos DUAS temas (claro e escuro), com valor não vazio', () => {
    for (const tema of TEMAS) {
      const faltando = TODOS.filter((t) => !themes[tema][t]);
      expect(faltando, `tokens --* ausentes no tema ${tema}`).toEqual([]);
    }
  });

  it('nenhum token é declarado só num tema', () => {
    for (const tema of TEMAS) {
      const declarados = Object.keys(themes[tema]).filter((k) => k.startsWith('contacts-'));
      const soNesteTema = declarados.filter((k) => !themes[tema === 'claro' ? 'escuro' : 'claro'][k]);
      expect(soNesteTema, `tokens --contacts-* só no tema ${tema}`).toEqual([]);
    }
  });

  it('as superfícies são trinca HSL (sem hsl(), sem hex/rgb)', () => {
    for (const tema of TEMAS) {
      for (const nome of SUPERFICIES) {
        const valor = themes[tema][nome];
        expect(valor, `--${nome} (${tema}) deveria ser trinca HSL`).toMatch(HSL);
      }
    }
  });

  it('os gradientes são linear-gradient()', () => {
    for (const tema of TEMAS) {
      for (const nome of GRADIENTES) {
        expect(themes[tema][nome], `--${nome} (${tema})`).toContain('linear-gradient(');
      }
    }
  });

  it('as sombras derivam de --elev-*', () => {
    for (const tema of TEMAS) {
      for (const nome of SOMBRAS) {
        expect(themes[tema][nome], `--${nome} (${tema})`).toContain('var(--elev-');
      }
    }
  });

  it('os raios têm os px do design (11, 13 e 17)', () => {
    for (const tema of TEMAS) {
      for (const [nome, px] of Object.entries(RAIOS)) {
        expect(themes[tema][nome], `--${nome} (${tema})`).toBe(`${px}px`);
      }
    }
  });

  it('nenhum valor --contacts-* carrega cor literal (#hex ou rgb)', () => {
    const literais = /#(?:[0-9a-f]{3,8})\b|rgba?\(/i;
    for (const tema of TEMAS) {
      for (const nome of TODOS) {
        expect(themes[tema][nome], `--${nome} (${tema}) tem cor literal`).not.toMatch(literais);
      }
    }
  });
});
