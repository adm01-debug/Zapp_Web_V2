import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserX, MessageSquare, Clock, TrendingDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

export function AbandonmentRate() {
  const [data, setData] = useState({ total: 0, abandoned: 0, responded: 0 });
  const [period, setPeriod] = useState('7');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [period]);

  const loadData = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - parseInt(period));

    // Get contacts that sent messages in the period
    const { data: contactMessages } = await supabase
      .from('messages')
      .select('contact_id, sender')
      .gte('created_at', since.toISOString())
      .limit(1000);

    if (contactMessages) {
      const contactSet = new Set<string>();
      const respondedSet = new Set<string>();

      contactMessages.forEach(m => {
        if (m.sender === 'contact') contactSet.add(m.contact_id);
        if (m.sender === 'agent') respondedSet.add(m.contact_id);
      });

      const total = contactSet.size;
      const responded = [...contactSet].filter(id => respondedSet.has(id)).length;
      const abandoned = total - responded;

      setData({ total, abandoned, responded });
    }
    setLoading(false);
  };

  const rate = data.total > 0 ? Math.round((data.abandoned / data.total) * 100) : 0;

  const chartData = [
    { name: 'Respondidas', value: data.responded, color: 'hsl(var(--success))' },
    { name: 'Abandonadas', value: data.abandoned, color: 'hsl(var(--destructive))' },
  ].filter(d => d.value > 0);

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
          <div className="grid grid-cols-2 gap-4 items-center">
            <div className="space-y-3">
              <div className="text-center">
                <p className={`text-4xl font-bold ${rate > 30 ? 'text-destructive' : rate > 15 ? 'text-warning' : 'text-success'}`}>{rate}%</p>
                <p className="text-xs text-muted-foreground">taxa de abandono</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Total</span>
                  <span className="font-medium">{data.total}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-success">✓ Respondidas</span>
                  <span className="font-medium">{data.responded}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-destructive">✗ Abandonadas</span>
                  <span className="font-medium">{data.abandoned}</span>
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
                    <Tooltip formatter={(value: any) => [value, 'Conversas']} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
