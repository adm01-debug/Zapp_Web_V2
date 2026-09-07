import { Activity, MessageSquare, Clock, AlertTriangle, Users } from 'lucide-react';
import { DashboardCard, SectionHeader, StatusChip } from './DashboardCard';
import type { RealtimeDashboardState } from '@/hooks/analytics/useRealtimeDashboard';
import type { QueueHealthRow } from '@/hooks/dashboard/useQueueHealth';

interface NowPanelProps {
  realtime: RealtimeDashboardState;
  pendingConversations: number;
  slaBreachedToday: number | undefined;
  busiestQueue: QueueHealthRow | null;
}

export function NowPanel({ realtime, pendingConversations, slaBreachedToday, busiestQueue }: NowPanelProps) {
  const rows = [
    { testid: 'now-row', tile: 'bg-dash-tile-blue', icon: MessageSquare, value: String(realtime.activeConversationsNow), label: 'Conversas ativas' },
    { testid: 'now-row', tile: 'bg-dash-tile-green', icon: Clock, value: String(pendingConversations), label: 'Aguardando atendimento' },
    {
      testid: 'now-row',
      tile: 'bg-dash-tile-red',
      icon: AlertTriangle,
      value: String(slaBreachedToday ?? 0),
      label: 'SLA violado hoje',
      tone: 'text-dash-red' as const,
    },
    {
      testid: 'now-row',
      tile: 'bg-dash-tile-violet',
      icon: Users,
      value: busiestQueue ? `${busiestQueue.name} (${busiestQueue.waiting + busiestQueue.inService})` : '—',
      label: 'Fila com maior volume',
    },
  ];

  return (
    <DashboardCard testid="now-card" className="min-h-[259px]">
      <SectionHeader
        icon={Activity}
        title="Agora"
        subtitle="Situação em tempo real"
        tileSize={44}
        right={<StatusChip label={realtime.isConnected ? 'Ao vivo' : 'Offline'} tone={realtime.isConnected ? 'success' : 'muted'} pulse={realtime.isConnected} />}
      />
      <div className="flex flex-col gap-0">
        {rows.map((row, i) => (
          <div key={i} data-testid={row.testid} className="h-11 flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-lg ${row.tile} flex items-center justify-center shrink-0`}>
              <row.icon className="w-4 h-4 text-white/90" />
            </div>
            <div className="min-w-0">
              <p className={`text-[18px] font-bold leading-none ${row.tone ?? 'text-foreground'}`}>{row.value}</p>
              <p className="text-[12px] text-foreground-secondary truncate">{row.label}</p>
            </div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}
