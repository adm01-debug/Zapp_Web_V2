import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Line,
} from 'recharts';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface DailyData {
  date: string;
  dateLabel: string;
  totalConversations: number;
  firstResponseBreaches: number;
  resolutionBreaches: number;
  totalBreaches: number;
  slaRate: number;
}

interface SLAChartsProps {
  dailyData: DailyData[];
  worstDays: DailyData[];
  bestDays: DailyData[];
}

export function SLARateChart({ dailyData }: { dailyData: DailyData[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Evolução da Taxa de SLA</CardTitle></CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="slaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="dateLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} tickFormatter={(v) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} formatter={(value: any) => [`${value.toFixed(1)}%`, 'Taxa SLA']} />
              <Area type="monotone" dataKey="slaRate" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#slaGradient)" />
              <Line type="monotone" dataKey={() => 90} stroke="hsl(var(--destructive))" strokeDasharray="5 5" strokeWidth={1} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function SLAViolationsChart({ dailyData }: { dailyData: DailyData[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Violações por Tipo</CardTitle></CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="dateLabel" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              <Legend />
              <Bar dataKey="firstResponseBreaches" name="1ª Resposta" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="resolutionBreaches" name="Resolução" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function SLABestWorstDays({ worstDays, bestDays }: { worstDays: DailyData[]; bestDays: DailyData[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Piores Dias</CardTitle>
        </CardHeader>
        <CardContent>
          {worstDays.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">Nenhuma violação registrada</p>
          ) : (
            <div className="space-y-3">
              {worstDays.map((day, i) => (
                <motion.div key={day.date} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                  <div>
                    <p className="font-medium">{day.dateLabel}</p>
                    <p className="text-sm text-muted-foreground">{day.totalBreaches} violações em {day.totalConversations} conversas</p>
                  </div>
                  <Badge variant="destructive">{day.slaRate.toFixed(0)}% SLA</Badge>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-success"><CheckCircle className="h-5 w-5" />Melhores Dias</CardTitle>
        </CardHeader>
        <CardContent>
          {bestDays.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">Nenhum dado disponível</p>
          ) : (
            <div className="space-y-3">
              {bestDays.map((day, i) => (
                <motion.div key={day.date} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                  className="flex items-center justify-between p-3 rounded-lg bg-success/5 border border-success/20">
                  <div>
                    <p className="font-medium">{day.dateLabel}</p>
                    <p className="text-sm text-muted-foreground">{day.totalConversations} conversas atendidas</p>
                  </div>
                  <Badge className="bg-success/20 text-success hover:bg-success/30">{day.slaRate.toFixed(0)}% SLA</Badge>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
