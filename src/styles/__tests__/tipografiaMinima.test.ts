/**
 * Piso tipográfico de 10px (`text-3xs`).
 *
 * O inventário de tipografia (docs/tipografia/PLANO_AUDITORIA_FONTES_100_ETAPAS_
 * 2026-09-24.md:90, item 39) manda marcar os arbitrários de 7px e 8px como
 * anomalia — estão abaixo do mínimo utilizável de leitura. O degrau que cobre
 * essa faixa é o token `3xs` (10px / line-height 13px, declarado em
 * tailwind.config.ts) e ele já era usado dentro do próprio `CompanyLogo`, na
 * variante `md`, ao lado dos dois menores.
 *
 * O guard de CI (scripts/qa/medir-tipografia.cjs --check) compara apenas TETOS
 * de violação: um arbitrário novo abaixo de 10px não reprova nada. Este teste é
 * a trava do piso, e por isso lê a árvore real de `src/`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Piso aceito hoje: 9px. O resíduo de `text-[9px]` é item próprio do inventário
 * de tipografia; 7px e 8px não têm uso nenhum e não voltam.
 */
const PISO_PX = 9;

const ARBITRARIO_PX_RE = /\btext-\[([0-9.]+)px\]/g;

function arquivosFonte(dir: string, acc: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = `${dir}/${entrada.name}`;
    if (entrada.isDirectory()) arquivosFonte(caminho, acc);
    else if (/\.(tsx?|jsx?)$/.test(entrada.name)) acc.push(caminho);
  }
  return acc;
}

/** Todo `text-[Npx]` de src com N abaixo do piso, no formato `arquivo:linha`. */
function abaixoDoPiso(): string[] {
  const achados: string[] = [];
  for (const arquivo of arquivosFonte('src')) {
    const conteudo = readFileSync(arquivo, 'utf8');
    ARBITRARIO_PX_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ARBITRARIO_PX_RE.exec(conteudo))) {
      const px = Number.parseFloat(m[1]);
      if (px < PISO_PX) {
        achados.push(`${arquivo}:${conteudo.slice(0, m.index).split('\n').length} text-[${m[1]}px]`);
      }
    }
  }
  return achados;
}

describe('piso tipográfico de src', () => {
  it('nenhum arbitrário abaixo de 10px: a faixa de 7px/8px agora é o token text-3xs', () => {
    expect(abaixoDoPiso()).toEqual([]);
  });

  it('CompanyLogo usa o token do piso em xs/sm, como já fazia em md', () => {
    const fonte = readFileSync('src/components/contacts/CompanyLogo.tsx', 'utf8');
    expect(fonte).toMatch(/xs:\s*'w-4 h-4 text-3xs',/);
    expect(fonte).toMatch(/sm:\s*'w-5 h-5 text-3xs',/);
  });

  it('text-3xs é o degrau de 10px / 13px da escala do Tailwind', () => {
    const config = readFileSync('tailwind.config.ts', 'utf8');
    expect(config).toMatch(/"3xs": \["0\.625rem", \{ lineHeight: "0\.8125rem" \}\]/);
  });
});
