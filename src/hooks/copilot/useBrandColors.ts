/**
 * CV-105 — Extração de cores da marca do cliente.
 */
import { useMemo } from 'react';

export interface BrandColor {
  hex: string;
  name: string;
  role: 'primary' | 'secondary' | 'text' | 'background' | 'accent';
}

export interface BrandColorsResult {
  colors: BrandColor[];
  printingSuggestion: string;
  maxColorsForProcess: number;
}

const NAMED_COLORS: Record<string, string> = {
  vermelho: '#e53935', azul: '#1e88e5', verde: '#43a047', amarelo: '#fdd835',
  laranja: '#fb8c00', roxo: '#8e24aa', rosa: '#e91e63', marrom: '#6d4c41',
  cinza: '#757575', preto: '#212121', branco: '#fafafa', dourado: '#ffc107', prata: '#9e9e9e',
};

function parseHex(input: string): string | null {
  const clean = input.replace(/\s/g, '');
  if (/^#?[0-9a-fA-F]{3}$/.test(clean)) { const c = clean.replace('#', ''); return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`; }
  if (/^#?[0-9a-fA-F]{6}$/.test(clean)) return `#${clean.replace('#', '')}`;
  return null;
}

function resolveColor(input: string): string | null {
  const lower = input.toLowerCase().trim();
  return NAMED_COLORS[lower] ?? parseHex(input);
}

export function useBrandColors({ colorInputs }: { colorInputs: string[] }): BrandColorsResult {
  return useMemo(() => {
    const roles: BrandColor['role'][] = ['primary', 'secondary', 'accent', 'text', 'background'];
    const colors: BrandColor[] = [];
    colorInputs.forEach((input, i) => {
      const hex = resolveColor(input);
      if (!hex) return;
      const entry = Object.entries(NAMED_COLORS).find(([, v]) => v === hex);
      const name = entry ? entry[0].charAt(0).toUpperCase() + entry[0].slice(1) : hex;
      colors.push({ hex, name, role: roles[i] ?? 'accent' });
    });
    const count = colors.length;
    const printingSuggestion = count <= 1 ? 'Silk-screen 1 cor ou laser — menor custo por peça.' : count <= 4 ? 'Silk-screen multicolor ou transfer digital até 4 cores.' : 'Transfer digital full color ou sublimação — paleta ilimitada.';
    const maxColorsForProcess = count <= 1 ? 1 : count <= 4 ? 4 : 99;
    return { colors, printingSuggestion, maxColorsForProcess };
  }, [colorInputs]);
}
