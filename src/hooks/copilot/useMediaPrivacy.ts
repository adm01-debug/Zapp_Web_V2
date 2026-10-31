/**
 * CV-110 — Verificação de privacidade de mídia.
 *
 * Antes de o vendedor encaminhar ou reutilizar uma imagem/arquivo recebido do
 * cliente, verifica se o conteúdo parece conter dados pessoais sensíveis
 * (documentos, CPF/CNPJ, notas fiscais, contratos) que não devem ser
 * redistribuídos sem consentimento.
 */
import { useMemo } from 'react';

export type PrivacyRisk = 'none' | 'low' | 'medium' | 'high';

export interface MediaPrivacyResult {
  risk: PrivacyRisk;
  reasons: string[];
  /** Se verdadeiro, bloquear reenvio até o vendedor confirmar. */
  requiresConfirmation: boolean;
}

interface MediaInput {
  /** Nome do arquivo (usado para heurística de extensão/nome). */
  filename?: string;
  /** Texto extraído via OCR ou caption informado pelo cliente. */
  captionOrOcr?: string;
  /** Tipo MIME. */
  mimeType?: string;
}

const SENSITIVE_FILENAME_PATTERNS = [
  /contrato/i, /nf[_-]?e?/i, /nota[-_\s]?fiscal/i, /cpf/i, /cnpj/i,
  /rg[_.\s]/i, /cnh/i, /passaporte/i, /identidade/i, /boleto/i,
  /procura[çc][ãa]o/i, /laudo/i, /documento/i,
];

const SENSITIVE_TEXT_PATTERNS = [
  /\d{3}\.\d{3}\.\d{3}-\d{2}/, // CPF
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/, // CNPJ
  /nf[- ]?e?\s*n[oº°]?\s*\d+/i, // NF/NFe
  /chave\s*(de\s*acesso|nfe)/i,
  /data\s*de\s*nascimento/i,
  /endere[çc]o\s*completo/i,
];

export interface UseMediaPrivacyOptions {
  media: MediaInput | null;
  /** Modos de ação: 'warn' mostra aviso; 'block' impede reenvio. */
  mode?: 'warn' | 'block';
}

export function useMediaPrivacy({
  media,
  mode = 'warn',
}: UseMediaPrivacyOptions): MediaPrivacyResult {
  return useMemo(() => {
    if (!media) return { risk: 'none', reasons: [], requiresConfirmation: false };

    const reasons: string[] = [];
    const name = media.filename ?? '';
    const text = media.captionOrOcr ?? '';

    for (const pattern of SENSITIVE_FILENAME_PATTERNS) {
      if (pattern.test(name)) {
        reasons.push(`Nome do arquivo sugere documento sensível ("${name}")`);
        break;
      }
    }

    for (const pattern of SENSITIVE_TEXT_PATTERNS) {
      if (pattern.test(text)) {
        reasons.push('Texto contém dado pessoal (CPF, CNPJ, NF ou endereço)');
        break;
      }
    }

    // PDFs e documentos Office têm risco médio por padrão
    const mime = (media.mimeType ?? '').toLowerCase();
    if (
      mime === 'application/pdf' ||
      mime.includes('wordprocessingml') ||
      mime.includes('spreadsheetml')
    ) {
      reasons.push('Tipo de arquivo (PDF/Office) pode conter dados pessoais');
    }

    let risk: PrivacyRisk = 'none';
    if (reasons.length >= 2) risk = 'high';
    else if (reasons.length === 1) risk = 'medium';

    return {
      risk,
      reasons,
      requiresConfirmation: mode === 'block' ? risk !== 'none' : risk === 'high',
    };
  }, [media, mode]);
}
