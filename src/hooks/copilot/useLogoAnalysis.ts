import { useMemo } from 'react';

export type LogoQuality = 'good' | 'poor' | 'unknown';

export interface UseLogoAnalysisOptions {
  /** Image MIME type, e.g. 'image/svg+xml', 'image/png' */
  mimeType?: string;
  /** Width in pixels, if known */
  width?: number;
  /** Height in pixels, if known */
  height?: number;
  /** File size in bytes */
  fileSizeBytes?: number;
  /** Number of unique colors detected (provider-supplied) */
  colorCount?: number;
}

export interface LogoAnalysisResult {
  isLogo: boolean;
  quality: LogoQuality;
  issues: string[];
  /** Suggestion message to show the vendor */
  suggestion: string | null;
}

const MIN_RESOLUTION_PX = 200;
const MAX_COLORS_FOR_ENGRAVING = 4;

/**
 * CV-104 — Logo recebido.
 * Detects whether the image is a logo and evaluates its suitability for engraving.
 * Heuristic: SVG always passes; PNG/JPG must meet resolution and color thresholds.
 */
export function useLogoAnalysis(options: UseLogoAnalysisOptions = {}): LogoAnalysisResult {
  const { mimeType, width, height, fileSizeBytes, colorCount } = options;

  return useMemo(() => {
    if (!mimeType) {
      return { isLogo: false, quality: 'unknown', issues: [], suggestion: null };
    }

    const isVector = mimeType === 'image/svg+xml' || mimeType === 'application/pdf';
    const isBitmap = mimeType.startsWith('image/') && !isVector;

    const isLogo = isVector || isBitmap;
    if (!isLogo) return { isLogo: false, quality: 'unknown', issues: [], suggestion: null };

    const issues: string[] = [];

    if (isVector) {
      return { isLogo: true, quality: 'good', issues: [], suggestion: null };
    }

    // Bitmap quality checks
    const minDim = Math.min(width ?? 0, height ?? 0);
    if (minDim > 0 && minDim < MIN_RESOLUTION_PX) {
      issues.push(`Resolução baixa (${minDim}px, mínimo ${MIN_RESOLUTION_PX}px)`);
    }

    if (colorCount !== undefined && colorCount > MAX_COLORS_FOR_ENGRAVING) {
      issues.push(`Muitas cores (${colorCount}) — gravação fica melhor com até ${MAX_COLORS_FOR_ENGRAVING}`);
    }

    if (fileSizeBytes !== undefined && fileSizeBytes < 5_000) {
      issues.push('Arquivo muito pequeno — pode ser baixa qualidade');
    }

    const quality: LogoQuality = issues.length === 0 ? 'good' : 'poor';

    let suggestion: string | null = null;
    if (quality === 'poor') {
      const needsVector = issues.some(i => i.includes('Resolução') || i.includes('cores'));
      suggestion = needsVector
        ? 'Peça o logo em vetor (.ai, .eps ou .svg) para garantir a qualidade da gravação.'
        : 'O logo pode ter problemas na gravação. Peça uma versão de maior resolução.';
    }

    return { isLogo: true, quality, issues, suggestion };
  }, [mimeType, width, height, fileSizeBytes, colorCount]);
}
