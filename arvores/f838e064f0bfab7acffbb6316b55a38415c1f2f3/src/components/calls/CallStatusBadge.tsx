import { Badge } from '@/components/ui/badge';
import { RESULT_LABEL, RESULT_TONE, toResult } from '@/lib/calls/callStatus';
import type { CallStatusRow } from '@/lib/calls/callStatus';

/**
 * Selo do desfecho da ligacao (T65). O resultado NAO vem pronto na linha da RPC: ele e
 * derivado do status persistido + contexto pelo contrato `toResult` (tabela 2.7). Rotulo e
 * tom saem do dominio - a tela nao inventa resultado nem cor.
 */
export function CallStatusBadge({ call }: { call: CallStatusRow }) {
  const resultado = toResult(call);
  if (!resultado) return null;
  const rotulo = RESULT_LABEL[resultado];
  if (!rotulo) return null;
  return (
    <Badge variant="outline" className={`text-3xs ${RESULT_TONE[resultado] ?? ''}`}>
      {rotulo}
    </Badge>
  );
}
