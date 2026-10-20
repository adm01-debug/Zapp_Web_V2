import { CallKpiCard } from './CallKpiCard';
import { useCallsKpi, type CallsKpi } from '@/hooks/calls/useCallsKpi';
import { formatarDuracao } from '@/lib/calls/formatoKpi';

interface CallsKpiGridProps {
  period: string;
  channel: string;
  scope: string;
}


const TILES: { chave: keyof CallsKpi; rotulo: string; dica: string; formato?: (v: number) => string }[] = [
  { chave: 'total', rotulo: 'Total', dica: 'Ligacoes no periodo' },
  { chave: 'answered', rotulo: 'Atendidas', dica: 'Ligacoes atendidas' },
  { chave: 'missed_inbound', rotulo: 'Perdidas', dica: 'Recebidas nao atendidas' },
  { chave: 'outbound', rotulo: 'Realizadas', dica: 'Ligacoes feitas por voce' },
  { chave: 'avg_talk_seconds', rotulo: 'Tempo medio', dica: 'Duracao media das atendidas', formato: formatarDuracao },
];

/**
 * T39 — o grid de KPIs. 5 tiles: 2 colunas no celular, 3 no tablet, 5 no desktop
 * (aceite: grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3).
 *
 * Enquanto carrega, mostra 5 skeletons com a MESMA altura do tile (78px) para o
 * conteudo nao empurrar a tela quando os numeros chegam. Em erro, mostra o aviso com
 * "Tentar novamente" - nao um tile zerado, que seria mentira.
 */
export function CallsKpiGrid({ period, channel, scope }: CallsKpiGridProps) {
  const { data, isLoading, isError, refetch } = useCallsKpi({ period, channel, scope });

  if (isError) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="tel-kpi-grid-erro">
        <div className="col-span-2 md:col-span-3 xl:col-span-5 h-[78px] rounded-lg border border-destructive/40 bg-card px-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Nao foi possivel carregar os numeros.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs font-medium underline underline-offset-2"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="tel-kpi-grid">
      {TILES.map((t) => (
        <CallKpiCard
          key={t.chave}
          rotulo={t.rotulo}
          dica={t.dica}
          carregando={isLoading}
          valor={t.formato ? t.formato(data?.[t.chave] ?? 0) : (data?.[t.chave] ?? 0)}
        />
      ))}
    </div>
  );
}
