import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useTeamPerformance } from '@/hooks/team-chat/useTeamPerformance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

interface Props { conversationId: string; }

export function TeamPerformancePanel({ conversationId }: Props) {
  const { data, isLoading } = useTeamPerformance(conversationId);

  const chartData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Mensagens', value: data.messageCount },
      { name: 'Ativos', value: data.activeParticipants },
      { name: 'Resp (s)', value: data.avgResponseTimeMs !== null ? Math.round(data.avgResponseTimeMs / 1000) : 0 },
    ];
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const json = JSON.stringify({ conversationId, ...data, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-performance-${conversationId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Carregando métricas...</div>;
  if (!data) return null;

  return (
    <Card className="m-3">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">Performance (últimos 30 min)</CardTitle>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleExport} title="Exportar JSON">
          <Download className="w-3.5 h-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/30 p-2">
            <div className="text-xl font-bold tabular-nums">{data.messageCount}</div>
            <div className="text-3xs text-muted-foreground uppercase tracking-wide">Mensagens</div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2">
            <div className="text-xl font-bold tabular-nums">{data.activeParticipants}</div>
            <div className="text-3xs text-muted-foreground uppercase tracking-wide">Ativos</div>
          </div>
          <div className="rounded-lg bg-muted/30 p-2">
            <div className="text-xl font-bold tabular-nums">
              {data.avgResponseTimeMs !== null ? `${Math.round(data.avgResponseTimeMs / 1000)}s` : '—'}
            </div>
            <div className="text-3xs text-muted-foreground uppercase tracking-wide">Resp. Média</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={chartData}>
            <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
