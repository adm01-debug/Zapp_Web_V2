import { useMemo } from 'react';

export interface ColorEntry {
  hex: string;
  name: string;
  percentage: number;
}

export interface UseLogoColorsOptions {
  /** Colors extracted by provider or image analysis library */
  extractedColors?: ColorEntry[];
}

export interface LogoColorsResult {
  colors: ColorEntry[];
  /** Product/color suggestions based on brand palette */
  suggestions: string[];
}

const COLOR_SUGGESTIONS: Record<string, string> = {
  '#0000ff': 'Caneta azul, squeeze azul, camiseta navy',
  '#ff0000': 'Caneta vermelha, squeeze vermelho, boné vermelho',
  '#008000': 'Caneta verde, squeeze verde, camiseta verde',
  '#ffff00': 'Post-it amarelo, caneta amarela',
  '#000000': 'Gravação laser, caneta preta',
  '#ffffff': 'Squeeze branco, camiseta branca, sacola branca',
};

function nearestSuggestion(hex: string): string | null {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  let best: string | null = null;
  let bestDist = Infinity;

  for (const [key, sug] of Object.entries(COLOR_SUGGESTIONS)) {
    const kr = parseInt(key.slice(1, 3), 16);
    const kg = parseInt(key.slice(3, 5), 16);
    const kb = parseInt(key.slice(5, 7), 16);
    const dist = (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2;
    if (dist < bestDist) { bestDist = dist; best = sug; }
  }

  return bestDist < 15000 ? best : null;
}

/**
 * CV-105 — Cores da marca do cliente.
 * Extracts dominant colors from logo and suggests compatible products.
 */
export function useLogoColors(options: UseLogoColorsOptions = {}): LogoColorsResult {
  const { extractedColors = [] } = options;

  return useMemo(() => {
    if (extractedColors.length === 0) return { colors: [], suggestions: [] };

    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const c of extractedColors.slice(0, 5)) {
      const sug = nearestSuggestion(c.hex);
      if (sug && !seen.has(sug)) {
        seen.add(sug);
        suggestions.push(sug);
      }
    }

    return { colors: extractedColors, suggestions };
  }, [extractedColors]);
}
