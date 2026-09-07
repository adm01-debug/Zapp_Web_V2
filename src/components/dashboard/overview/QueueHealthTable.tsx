import { ListChecks } from 'lucide-react';
import { DashboardCard, SectionHeader, VerTodasButton, StatusChip } from './DashboardCard';
import { formatShortDuration } from './formatShortDuration';
import type { QueueHealthRow } from '@/hooks/dashboard/useQueueHealth';
import { cn } from '@/lib/utils';

interface QueueHealthTableProps {
  rows: QueueHealthRow[];
  isConnected: boolean;
  onSeeAll: () => void;
}

const STATUS_LABEL: Record<NonNullable<QueueHealthRow['status']>, string> = {
  excelente: 'Excelente',
  bom: 'Bom',
  atencao: 'Atenção',
};

function StatusBadge({ status }: { status: QueueHealthRow['status'] }) {
  if (status === null) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <span
      data-testid="queue-status"
      className={cn(
        'h-[22px] px-2 rounded-md text-[11px] font-semibold inline-flex items-center',
        status === 'atencao' ? 'bg-dash-tile-amber text-dash-amber' : 'bg-dash-tile-green text-dash-green',
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function QueueHealthTable({ rows, isConnected, onSeeAll }: QueueHealthTableProps) {
  const visibleRows = rows.slice(0, 4);

  return (
    <DashboardCard testid="queue-health-card" className="min-h-[220px]">
      <SectionHeader
        icon={ListChecks}
        title="Saúde das Filas"
        tileSize={44}
        right={(
          <div className="flex items-center gap-2 ml-auto">
            <StatusChip label="Tempo real" tone={isConnected ? 'success' : 'muted'} />
            <VerTodasButton onClick={onSeeAll} />
          </div>
        )}
      />
      {visibleRows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-muted-foreground min-h-[120px]">
          Sem filas ativas
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="h-[22px] text-[11px] font-medium text-muted-foreground text-left">
              <th className="font-medium">Fila</th>
              <th className="font-medium">Aguardando</th>
              <th className="font-medium">Em atendimento</th>
              <th className="font-medium">Tempo médio</th>
              <th className="font-medium">SLA</th>
              <th className="font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.queueId} data-testid="queue-row" className="h-[31px] border-t border-border/40">
                <td className="truncate max-w-[120px]">{row.name}</td>
                <td>{row.waiting}</td>
                <td>{row.inService}</td>
                <td>{row.avgResponse !== null ? formatShortDuration(row.avgResponse) : '—'}</td>
                <td>{row.slaRate !== null ? `${row.slaRate}%` : '—'}</td>
                <td><StatusBadge status={row.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DashboardCard>
  );
}
