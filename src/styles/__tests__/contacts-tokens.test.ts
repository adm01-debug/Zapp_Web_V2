/**
 * Cartão t_1f7280f0 ([refazer 1] do t_ee2824b6) — RD-002 (redesign de Contatos): contrato dos tokens `--contacts-*`.
 *
 * O que este teste prova: o CONTRATO DE DEFINIÇÃO dos tokens do redesign — todo token
 * `--contacts-*` existe em `:root` (claro) e em `.dark` (escuro), e a DERIVAÇÃO é
 * estrutural (via `var()`), não cópia de valor:
 * - superfícies apontam para a base (`--contacts-panel: var(--card)`); se alguém colar
 *   a trinca HSL ou um hex no lugar do `var()`, fica vermelho — e recolorir a base
 *   (`--card`, `--border`…) propaga sozinho, sem deriva silenciosa;
 * - gradientes referenciam as superfícies (`var(--contacts-*)`), sombras referenciam
 *   `--elev-N` (+ `--primary` no anel), raios têm os px do design nos dois temas.
 *
 * Por que aqui, e não no navegador: o estilo COMPUTADO é idêntico com cópia ou com
 * `var()` — só o teste da definição distingue um do outro. Cor/contraste/layout
 * continuam sendo prova de navegador na fase de captura visual (RD-010).
 *
 * Referência de design → token: docs/design/contatos-redesign-2026-10-12/MAPA-TOKENS.md.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve(__dirname, '../tokens.css'), 'utf8');

/**
 * Extrai as variáveis de TODOS os blocos cujo cabeçalho começa em `header`
 * (blocos repetidos fundem; o último vence) — não só da primeira ocorrência,
 * para uma redeclaração posterior não passar despercebida.
 */
function extractBlocks(header: string): Record<string, string> {
  const vars: Record<string, string> = {};
  let from = 0;
  for (;;) {
    const idx = css.indexOf(header, from);
    if (idx === -1) break;
    const start = css.indexOf('{', idx);
    let depth = 1;
    let i = start + 1;
    while (depth > 0 && i < css.length) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') depth--;
      i++;
    }
    const body = css.slice(start + 1, i - 1).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
    from = i;
  }
  return vars;
}

const themes = { claro: extractBlocks(':root'), escuro: extractBlocks('.dark') } as const;
const TEMAS = ['claro', 'escuro'] as const;

// Superfície → token base do sistema. O valor declarado TEM de ser `var(--base)`;
 // trinca HSL copiada ou hex colado = deriva silenciosa quando a base mudar.
const DERIVACAO: Record<string, string> = {
  'contacts-page': 'background',
  'contacts-panel': 'card',
  'contacts-raised': 'card-elevated',
  'contacts-line': 'border',
  'contacts-line-soft': 'input',
};
const SUPERFICIES = Object.keys(DERIVACAO);

const GRADIENTES = ['contacts-card-gradient', 'contacts-icon-tile'] as const;
// Sombra → `--elev-N` exato que ela estende (anel extra referencia `--primary`).
const SOMBRAS: Record<string, string> = {
  'contacts-select-glow': 'elev-3',
  'contacts-hover-shadow': 'elev-4',
  'contacts-dialog-shadow': 'elev-5',
};
const RAIOS: Record<string, number> = {
  'contacts-radius-stat': 11,
  'contacts-radius-card': 13,
  'contacts-radius-dialog': 17,
};

const TODOS = [...SUPERFICIES, ...GRADIENTES, ...Object.keys(SOMBRAS), ...Object.keys(RAIOS)];

describe('tokens --contacts-* — contrato de definição (RD-002)', () => {
  it('o parser lê os dois temas de verdade (bases presentes, contacts-* não vazio)', () => {
    // Sem isto, um erro de parsing faria o contrato passar vazio (teste tautológico).
    for (const tema of TEMAS) {
      for (const base of ['background', 'primary', 'card', 'border', 'input', 'card-elevated']) {
        expect(themes[tema][base], `--${base} ausente em ${tema}`).toBeTruthy();
      }
      const lidos = Object.keys(themes[tema]).filter((k) => k.startsWith('contacts-'));
      expect(lidos.length, `nenhum --contacts-* lido em ${tema}`).toBe(TODOS.length);
    }
  });

  it('todo token existe nos DOIS temas (claro e escuro), com valor não vazio', () => {
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

  it('as superfícies derivam da base COM var() (cópia de trinca ou hex fica vermelha)', () => {
    for (const tema of TEMAS) {
      for (const [superficie, base] of Object.entries(DERIVACAO)) {
        expect(
          themes[tema][superficie],
          `--${superficie} (${tema}) deveria ser var(--${base})`,
        ).toBe(`var(--${base})`);
      }
    }
  });

  it('os gradientes são linear-gradient() só com referências var(--*) que existem', () => {
    for (const tema of TEMAS) {
      for (const nome of GRADIENTES) {
        const valor = themes[tema][nome];
        expect(valor, `--${nome} (${tema})`).toContain('linear-gradient(');
        // Toda referência var(--*) tem de existir no tema: gradiente que cola cor
        // fixa ou referencia token inexistente fica vermelho nos dois temas.
        const refs: string[] = [];
        const re = /var\(--([a-z0-9-]+)/g;
        let rm: RegExpExecArray | null;
        while ((rm = re.exec(valor)) !== null) refs.push(rm[1]);
        expect(refs.length, `--${nome} (${tema}) sem nenhuma referência var(--*)`).toBeGreaterThan(0);
        for (const ref of refs) {
          expect(themes[tema][ref], `--${nome} (${tema}) referencia --${ref}, que não existe`).toBeTruthy();
        }
      }
    }
  });

  it('as sombras estendem o --elev-N exato, nos dois temas', () => {
    for (const tema of TEMAS) {
      for (const [nome, elev] of Object.entries(SOMBRAS)) {
        expect(themes[tema][nome], `--${nome} (${tema})`).toContain(`var(--${elev})`);
      }
    }
  });

  it('o anel de seleção/hover acompanha --primary (sem cor fixa colada)', () => {
    for (const tema of TEMAS) {
      for (const nome of ['contacts-select-glow', 'contacts-hover-shadow'] as const) {
        expect(themes[tema][nome], `--${nome} (${tema})`).toContain('var(--primary)');
      }
    }
  });

  it('os raios têm os px do design (11, 13 e 17), iguais nos dois temas', () => {
    for (const tema of TEMAS) {
      for (const [nome, px] of Object.entries(RAIOS)) {
        expect(themes[tema][nome], `--${nome} (${tema})`).toBe(`${px}px`);
      }
    }
    for (const nome of Object.keys(RAIOS)) {
      expect(themes.escuro[nome], `--${nome} diverge entre temas`).toBe(themes.claro[nome]);
    }
  });

  it('nenhum valor --contacts-* carrega cor literal (#hex, rgb ou trinca solta)', () => {
    const literais = /#(?:[0-9a-f]{3,8})\b|rgba?\(/i;
    const trincaSolta = /^\d+(?:\.\d+)? \d+(?:\.\d+)?% \d+(?:\.\d+)?%$/;
    for (const tema of TEMAS) {
      for (const nome of TODOS) {
        const valor = themes[tema][nome];
        expect(valor, `--${nome} (${tema}) tem cor literal`).not.toMatch(literais);
        expect(
          trincaSolta.test(valor),
          `--${nome} (${tema}) colou trinca em vez de var()`,
        ).toBe(false);
      }
    }
  });
});
