import { useCallback } from 'react';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import {
  type ScanResult,
  isBlocking,
  isRetryable,
  isInputError,
} from '@/lib/scanResponse';


/** Opções de exibição do resultado da varredura. */
export interface HandleScanOptions {
  /** Nome do arquivo mostrado como descrição do aviso nos bloqueios. */
  fileName?: string;
  /** Id do toast, para não empilhar avisos do mesmo envio. */
  toastId?: string;
  /** Chamado no "Tentar novamente" dos erros passageiros. */
  onRetry?: () => void;
}

export type ScanOutcome = 'success' | 'skipped' | 'blocked' | 'retry' | 'input' | 'error';

/**
 * Único ponto de exibição do resultado do `file-security-scanner`.
 *
 * Mapeamento:
 *   success                                   → 'success'  (sem aviso; quem chamou emite o seu)
 *   scanned:false (skipped)                   → 'skipped'  (aviso discreto, envio segue)
 *   MALWARE_DETECTED | SUSPICIOUS_FILE        → 'blocked'  (aviso forte, sem retry)
 *   SCAN_TIMEOUT | SCAN_UNAVAILABLE | rede    → 'retry'    (aviso com "Tentar novamente")
 *   e RATE_LIMITED
 *   INVALID_INPUT | METHOD_NOT_ALLOWED        → 'input'    (quem chamou corrige o pedido)
 *   STORAGE_ERROR | INTERNAL_ERROR | UNKNOWN  → 'error'    (aviso genérico)
 */
export function useScanResponseHandler() {
  const handleScanResult = useCallback(
    (result: ScanResult, opts: HandleScanOptions = {}): ScanOutcome => {
      const { fileName, toastId = 'file-upload', onRetry } = opts;

      if (result.status === 'success') return 'success';

      const description =
        [
          fileName ? `Arquivo: ${fileName}` : null,
          result.status === 'error' && result.scanId ? `ID da varredura: ${result.scanId}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined;

      if (result.status === 'skipped') {
        // Aviso discreto em id PRÓPRIO: o envio segue e o toast de sucesso vem logo
        // depois no mesmo `toastId` — no id do envio, este aviso sumiria sem ser lido.
        log.warn('[scan] upload seguiu sem verificação', {
          reason: result.reason,
          fileName,
        });
        toast.info(result.message, {
          id: `${toastId}-scan`,
          description,
          duration: 8000,
        });
        return 'skipped';
      }

      if (isBlocking(result)) {
        log.warn('[scan] upload bloqueado', {
          code: result.code,
          verdict: result.verdict,
          scanId: result.scanId,
          fileName,
        });
        toast.error(result.message, { id: toastId, description, duration: 8000 });
        return 'blocked';
      }

      if (isRetryable(result)) {
        log.warn('[scan] varredura falhou, dá para tentar de novo', {
          code: result.code,
          scanId: result.scanId,
          fileName,
        });
        toast.error(result.message, {
          id: toastId,
          description,
          duration: 10000,
          action: onRetry ? { label: 'Tentar novamente', onClick: onRetry } : undefined,
        });
        return 'retry';
      }

      if (isInputError(result)) {
        toast.error(result.message, { id: toastId, description, duration: 6000 });
        return 'input';
      }

      log.error('[scan] falha na varredura', {
        code: result.code,
        scanId: result.scanId,
        fileName,
        details: result.details,
      });
      toast.error(result.message, { id: toastId, description, duration: 6000 });
      return 'error';
    },
    [],
  );

  return { handleScanResult };
}
