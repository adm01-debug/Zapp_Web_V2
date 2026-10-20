import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface CallDirectionCellProps {
  direction: string;
}

/**
 * Direção da ligação (T50). Recebida = seta entrando; realizada = seta saindo.
 * Sem texto: a coluna é estreita e a seta já é o vocabulário da tabela.
 */
export function CallDirectionCell({ direction }: CallDirectionCellProps) {
  const recebida = direction === 'inbound';
  const Icone = recebida ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      title={recebida ? 'Recebida' : 'Realizada'}
    >
      <Icone className={`h-4 w-4 ${recebida ? 'text-info' : 'text-primary'}`} aria-hidden="true" />
      <span className="sr-only">{recebida ? 'Recebida' : 'Realizada'}</span>
    </span>
  );
}
