/**
 * CV-104 — Análise de logo enviado pelo cliente.
 *
 * Quando o cliente envia uma imagem que parece ser um logotipo, extrai metadados
 * básicos (formato detectado, presença de fundo transparente, complexidade percebida)
 * e sugere ao vendedor como orientar a gravação/personalização.
 * Opera sobre a URL pública da mídia; análise real é feita na edge function.
 */
import { useMemo } from 'react';

export type LogoFormat = 'vector' | 'raster_hq' | 'raster_lq' | 'unknown';
export type LogoComplexity = 'simple' | 'medium' | 'complex';

export interface LogoAnalysisResult {
  format: LogoFormat;
  complexity: LogoComplexity;
  hasTransparency: boolean;
  /** Recomendação de técnica de gravação. */
  engraving: string;
  /** Aviso para o vendedor, se houver. */
  warning?: string;
}

/** Simulação do resultado — substituir pela resposta da edge function quando implementada. */
function inferFromFilename(url: string): LogoAnalysisResult {
  const lower = url.toLowerCase();
  const isSvg = lower.endsWith('.svg');
  const isPdf = lower.endsWith('.pdf') || lower.endsWith('.ai') || lower.endsWith('.eps');
  const isPng = lower.endsWith('.png');
  const isJpg = lower.endsWith('.jpg') || lower.endsWith('.jpeg');

  if (isSvg || isPdf) {
    return {
      format: 'vector',
      complexity: 'simple',
      hasTransparency: true,
      engraving: 'Vetorial — ideal para laser, silk e bordado sem limitação de cores.',
    };
  }
  if (isPng) {
    return {
      format: 'raster_hq',
      complexity: 'medium',
      hasTransparency: true,
      engraving: 'PNG com transparência — silk e transfer digital, verificar resolução.',
    };
  }
  if (isJpg) {
    return {
      format: 'raster_hq',
      complexity: 'medium',
      hasTransparency: false,
      engraving: 'JPEG — silk e transfer digital, verificar se tem fundo branco.',
      warning: 'JPEG não suporta transparência — pode ser necessário remover fundo.',
    };
  }
  return {
    format: 'unknown',
    complexity: 'medium',
    hasTransparency: false,
    engraving: 'Formato desconhecido — solicitar arquivo vetorial ao cliente.',
    warning: 'Peça ao cliente para enviar o logo em SVG, PDF ou PNG com fundo transparente.',
  };
}

export interface UseLogoAnalysisOptions {
  /** URL pública da imagem enviada pelo cliente. Null quando não há imagem. */
  imageUrl: string | null;
  /** Tipo MIME reportado pelo sistema de mídia. */
  mimeType?: string;
}

export function useLogoAnalysis({
  imageUrl,
  mimeType,
}: UseLogoAnalysisOptions): LogoAnalysisResult | null {
  return useMemo(() => {
    if (!imageUrl) return null;
    const lower = (mimeType ?? '').toLowerCase();
    if (lower.startsWith('image/') || lower === 'application/pdf' || !mimeType) {
      return inferFromFilename(imageUrl);
    }
    return null;
  }, [imageUrl, mimeType]);
}
