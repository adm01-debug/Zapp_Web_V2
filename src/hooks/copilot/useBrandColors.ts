/**
 * CV-105 — Extração de cores da marca do cliente.
 *
 * A partir de referências visuais (URL de imagem, código hex informado ou nome
 * de cor em linguagem natural), extrai e normaliza as cores da marca para
 * auxiliar na orientação de personalização de brindes.
 */
import { useMemo } from 'react';

export interface BrandColor {
  hex: string;
  /** Nome aproximado em PT-BR. */
  name: string;
  /** Uso sugerido: primária, secundária, texto, fundo. */
  role: 'primary' | 'secondary' | 'text' | 'background' | 'accent';
}

export interface BrandColorsResult {
  colors: BrandColor[];
  /** Sugestão de processo de impressão baseado na paleta. */
  printingSuggestion: string;
  /** Número máximo de cores que a técnica suporta sem sobrecusto. */
  maxColorsForProcess: number;
}

/** Cores nomeadas comuns em PT-BR → hex aproximado. */
const NAMED_COLORS: Record<string, string> = {
  vermelho: '#e53935',
  azul: '#1e88e5',
  verde: '#43a047',
  amarelo: '#fdd835',
  laranja: '#fb8c00',
  roxo: '#8e24aa',
  rosa: '#e91e63',
  marrom: '#6d4c41',
  cinza: '#757575',
  preto: '#212121',
  branco: '#fafafa',
  dourado: '#ffc107',
  prata: '#9e9e9e',
};

function parseHex(input: string): string | null {
  const clean = input.replace(/\s/g, '');
  if (/^#?[0-9a-fA-F]{3}$/.test(clean)) {
    const c = clean.replace('#', '');
    return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`;
  }
  if (/^#?[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean.replace('#', '')}`;
  }
  return null;
}

function resolveColor(input: string): string | null {
  const lower = input.toLowerCase().trim();
  const byName = NAMED_COLORS[lower];
  if (byName) return byName;
  return parseHex(input);
}

function colorName(hex: string): string {
  const entry = Object.entries(NAMED_COLORS).find(([, v]) => v === hex);
  return entry ? entry[0].charAt(0).toUpperCase() + entry[0].slice(1) : hex;
}

function printingSuggestion(count: number): { suggestion: string; maxColors: number } {
  if (count <= 1) return { suggestion: 'Silk-screen 1 cor ou laser — menor custo por peça.', maxColors: 1 };
  if (count <= 4) return { suggestion: 'Silk-screen multicolor ou transfer digital até 4 cores.', maxColors: 4 };
  return { suggestion: 'Transfer digital full color ou sublimação — paleta ilimitada.', maxColors: 99 };
}

export interface UseBrandColorsOptions {
  /** Lista de entradas: hex (#RRGGBB), nome em PT-BR ou "vazio". */
  colorInputs: string[];
}

export function useBrandColors({ colorInputs }: UseBrandColorsOptions): BrandColorsResult {
  return useMemo(() => {
    const resolved: BrandColor[] = [];
    const roles: BrandColor['role'][] = ['primary', 'secondary', 'accent', 'text', 'background'];

    colorInputs.forEach((input, i) => {
      const hex = resolveColor(input);
      if (!hex) return;
      resolved.push({
        hex,
        name: colorName(hex),
        role: roles[i] ?? 'accent',
      });
    });

    const { suggestion, maxColors } = printingSuggestion(resolved.length);
    return {
      colors: resolved,
      printingSuggestion: suggestion,
      maxColorsForProcess: maxColors,
    };
  }, [colorInputs]);
}
