import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserX, MessageSquare, Clock } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useAbandonmentRate } from '@/hooks/business/useAbandonmentRate';
import { ReportsIntegrityNotice } from './ReportsIntegrityNotice';

export function AbandonmentRate() {
  const [period, setPeriod] = useState('7');
  // R2-MOD-020: a conta mora no hook (ordem temporal, sessão e prazo explícitos). Enquanto a
  // leitura não chegou — ou falhou — não há número: a tela mostra "—", não zero confirmado.
  const { metric, loading, error, incomplete } = useAbandonmentRate(period);

  const rate = metric?.rate ?? 0;

  const chartData = metric
    ? [
        { name: 'Respondidas', value: metric.responded, color: 'hsl(var(--success))' },
        { name: 'Aguardando', value: metric.waiting, color: 'hsl(var(--warning))' },
        { name: 'Abandonadas', value: metric.abandoned, color: 'hsl(var(--destructive))' },
      ].filter(d => d.value > 0)
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <UserX className="w-4 h-4 text-destructive" />
            Taxa de Abandono
          </CardTitle>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Hoje</SelectItem>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-40 bg-muted/20 rounded-xl animate-pulse" />
        ) : (
          <div className="space-y-3">
            <ReportsIntegrityNotice error={error} incomplete={incomplete} />
            <div className="grid grid-cols-2 gap-4 items-center">
              <div className="space-y-3">
                <div className="text-center">
                  <p className={`text-4xl font-bold ${!metric ? 'text-muted-foreground' : rate > 30 ? 'text-destructive' : rate > 15 ? 'text-warning' : 'text-success'}`}>{metric ? `${rate}%` : '—'}</p>
                  <p className="text-xs text-muted-foreground">taxa de abandono</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Total</span>
                    <span className="font-medium">{metric ? metric.total : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-success">✓ Respondidas</span>
                    <span className="font-medium">{metric ? metric.responded : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-muted-foreground"><Clock className="w-3 h-3" /> Aguardando</span>
                    <span className="font-medium">{metric ? metric.waiting : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-destructive">✗ Abandonadas</span>
                    <span className="font-medium">{metric ? metric.abandoned : '—'}</span>
                  </div>
                </div>
              </div>
              <div className="h-40">
                {chartData.length > 0 && (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                        {chartData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [v, 'Sessões']} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
