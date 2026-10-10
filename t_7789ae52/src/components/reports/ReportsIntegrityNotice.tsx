import { AlertTriangle, Info } from 'lucide-react';

interface ReportsIntegrityNoticeProps {
  /** Erro de leitura (rede/permissão) — o que não foi lido NÃO é zero confirmado. */
  error?: unknown;
  /** Leitura parou no meio (teto/erro parcial): os números são parciais, não o total. */
  incomplete?: boolean;
}

function errorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const m = (error as { message?: unknown }).message;
    return typeof m === 'string' ? m : null;
  }
  return null;
}

/**
 * R2-MOD-018/019: torna visível que o relatório **não** tem o total do período.
 * Sem isto, uma falha de leitura ou uma leitura truncada era publicada como "0" / subtotal.
 */
export function ReportsIntegrityNotice({ error, incomplete }: ReportsIntegrityNoticeProps) {
  const msg = errorMessage(error);

  if (error) {
    return (
      <div
        role="alert"
        data-testid="reports-error"
        className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm"
      >
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground">Não foi possível ler os dados deste período</p>
          <p className="text-muted-foreground">
            Os números abaixo <span className="font-medium">não</span> são totais confirmados
            {msg ? ` (${msg})` : ''}.
          </p>
        </div>
      </div>
    );
  }

  if (incomplete) {
    return (
      <div
        role="status"
        data-testid="reports-incomplete"
        className="flex items-start gap-3 rounded-lg border border-warning/50 bg-warning/5 p-4 text-sm"
      >
        <Info className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground">Leitura incompleta</p>
          <p className="text-muted-foreground">
            Parte do período não foi lida: os totais são parciais, não o total definitivo.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
