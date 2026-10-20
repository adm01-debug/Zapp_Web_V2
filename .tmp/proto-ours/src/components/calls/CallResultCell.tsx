import { RESULT_LABEL, RESULT_TONE, type CallResult, type ResultTone } from '@/lib/calls/callStatus';

/**
 * Ton do resultado resolvido em classe (T50). O mapa fica aqui, e não no
 * `callStatus.ts`, porque é decisão de apresentação: aquele módulo é de domínio.
 */
const CLASSE_DO_TOM: Record<ResultTone, { dot: string; texto: string }> = {
  success: { dot: 'bg-success', texto: 'text-success' },
  destructive: { dot: 'bg-destructive', texto: 'text-destructive' },
  warning: { dot: 'bg-warning', texto: 'text-warning' },
  muted: { dot: 'bg-muted-foreground', texto: 'text-muted-foreground' },
  primary: { dot: 'bg-primary', texto: 'text-primary' },
};

interface CallResultCellProps {
  result: CallResult | null;
  /** Ligação em andamento: o ponto pulsa enquanto isso durar. */
  emAndamento?: boolean;
}

export function CallResultCell({ result, emAndamento = false }: CallResultCellProps) {
  if (!result) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const tom = CLASSE_DO_TOM[RESULT_TONE[result]] ?? CLASSE_DO_TOM.muted;
  return (
    <span className={`inline-flex items-center gap-2 text-xs ${tom.texto}`}>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${tom.dot} ${emAndamento ? 'motion-safe:animate-pulse' : ''}`}
        aria-hidden="true"
      />
      {RESULT_LABEL[result]}
    </span>
  );
}
