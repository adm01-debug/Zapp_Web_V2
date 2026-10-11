/**
 * L3 — gradiente do título do /auth no painel esquerdo (HeroBenefits).
 *
 * O realce "atendimento moderno." é pintado com `bg-clip-text` sobre um
 * gradiente. Antes ele terminava em `to-secondary`: no tema escuro `--secondary`
 * é `240 5% 16%` (quase preto), então o fim da palavra sumia no fundo escuro.
 * Agora termina em `--primary-text`, que já é claro no escuro e escuro no claro
 * (mesmo par de texto usado no resto do produto).
 *
 * O teste lê a CLASSE do componente REAL (sem mock de conteúdo) e calcula o
 * contraste WCAG a partir dos tokens em src/styles/tokens.css, nos dois temas.
 *
 * Vermelho antes (gradiente terminando em --secondary no escuro); verde depois.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HeroBenefits } from '../HeroBenefits';

const REALCE = 'atendimento moderno.';

type Rgb = [number, number, number];

/** Luminância relativa (WCAG 2.1, sRGB). */
function luminancia([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste WCAG entre duas cores. */
function razao(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminancia(a), luminancia(b)];
  const [alto, baixo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (alto + 0.05) / (baixo + 0.05);
}

/** HSL no formato dos tokens (`--x: 221 83% 53%`) → RGB. */
function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const luz = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(luz, 1 - luz);
  const f = (n: number) => luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
}

const TOKENS = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

/** Valor de um token dentro do bloco `seletor` (`:root` ou `.dark`). */
function token(css: string, seletor: string, nome: string): Rgb {
  const inicio = css.indexOf(`${seletor} {`);
  const fim = css.indexOf('\n}', inicio);
  const bloco = css.slice(inicio, fim);
  const m = bloco.match(new RegExp(`--${nome}:\\s*(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%`));
  if (!m) throw new Error(`token --${nome} não achado em ${seletor}`);
  return hslParaRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

describe('HeroBenefits — gradiente do realce do título', () => {
  it('termina em --primary-text (que muda com o tema) e não no --secondary', () => {
    render(<HeroBenefits />);
    const realce = screen.getByText(REALCE);
    expect(realce.className).toContain('from-primary');
    expect(realce.className).toContain('to-[hsl(var(--primary-text))]');
    expect(realce.className).not.toContain('to-secondary');
  });

  it('as duas pontas do gradiente ficam >= 3:1 contra o fundo nos dois temas', () => {
    // Lê do COMPONENTE qual token cada ponta usa — voltar o `to-secondary`
    // (quase preto no escuro) volta a reprovar aqui.
    const { unmount } = render(<HeroBenefits />);
    const classe = screen.getByText(REALCE).className;
    unmount();
    // Extrai as pontas `from-*`/`to-*` do gradiente (ignora `gradient-to-r`).
    const pontas = [...classe.matchAll(/(?:^|\s)(from|via|to)-([^\s]+)/g)]
      .filter(([, dir]) => dir === 'from' || dir === 'to')
      .map(([, dir, val]) => {
        const t = val.match(/^\[hsl\(var\(--([a-z-]+)\)\)\]$/);
        return { dir, token: t ? t[1] : val };
      });
    const de = pontas.find((p) => p.dir === 'from')?.token;
    const para = pontas.find((p) => p.dir === 'to')?.token;
    expect(de, 'ponta inicial do gradiente no className').toBeTruthy();
    expect(para, 'ponta final do gradiente no className').toBeTruthy();

    for (const [tema, seletor] of [['claro', ':root'], ['escuro', '.dark']] as const) {
      const fundo = token(TOKENS, seletor, 'background');
      expect(razao(token(TOKENS, seletor, de!), fundo), `${tema}: --${de}`).toBeGreaterThanOrEqual(3);
      expect(razao(token(TOKENS, seletor, para!), fundo), `${tema}: --${para}`).toBeGreaterThanOrEqual(3);
    }
  });
});
