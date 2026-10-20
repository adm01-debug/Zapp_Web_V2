import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useParticipantStats } from '@/hooks/team-chat/useParticipantStats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface Props {
  conversationId: string;
  simulationMode?: boolean;
}

const SIMULATION_DATA = [
  { name: 'Ana', sent: 42, delivered: 38, read: 30 },
  { name: 'Bruno', sent: 31, delivered: 29, read: 25 },
  { name: 'Carla', sent: 27, delivered: 25, read: 20 },
];

export function ParticipantStatsGraph({ conversationId, simulationMode = false }: Props) {
  const { data: realData, isLoading } = useParticipantStats(conversationId);

  const chartData = simulationMode
    ? SIMULATION_DATA
    : (realData ?? []).map(p => ({
        name: p.senderName.split(' ')[0],
        sent: p.sent,
        delivered: p.delivered,
        read: p.read,
      }));

  return (
    <Card className="m-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Participantes{simulationMode && <span className="ml-1 text-3xs text-muted-foreground">(simulação)</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && !simulationMode ? (
          <div className="flex items-center justify-center h-24">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6">Sem dados disponíveis</div>
        ) : (
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="sent" name="Enviadas" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              <Bar dataKey="delivered" name="Entregues" fill="hsl(var(--primary) / 0.6)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="read" name="Lidas" fill="hsl(var(--primary) / 0.3)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
