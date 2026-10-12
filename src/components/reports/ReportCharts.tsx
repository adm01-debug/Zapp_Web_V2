import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend, LineChart, Line,
} from 'recharts';
import { format } from 'date-fns';
import { GitCompare } from 'lucide-react';
import { motion } from 'framer-motion';

const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
};

// N-092: número seguro para rótulos gerados dos dados (ignora ausente/NaN).
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

// N-092: item de maior valor para o aria-label gerado dos dados.
// Devolve undefined com lista vazia (o chamador usa o rótulo estático).
function maxItem<T>(rows: Array<T>, pick: (r: T) => number): T | undefined {
  let best: T | undefined;
  let bestValue = -Infinity;
  for (const r of rows) {
    const v = pick(r);
    if (v > bestValue) {
      bestValue = v;
      best = r;
    }
  }
  return best;
}

interface ChartData {
  daily: Array<Record<string, unknown>>;
  bySender: Array<{ name: string; value: number }>;
  byAgent: Array<{ name: string; mensagens: number }>;
}

interface ContactsChartData {
  daily: Array<Record<string, unknown>>;
  byType: Array<{ name: string; value: number }>;
  byTag: Array<{ name: string; contatos: number }>;
}

// ─── Comparison Summary ───
export function ComparisonSummaryChart({ data, isLoading }: { data: Array<Record<string, unknown>>; isLoading: boolean }) {
  const top = maxItem(data, (r) => num(r.atual));
  const aria = top
    ? `Gráfico de comparação de métricas: período atual versus anterior. Maior valor atual: ${num(top.atual)} em ${String(top.name ?? '—')}.`
    : 'Gráfico de comparação de métricas: período atual versus anterior.';
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-primary" />
            Comparação de Métricas: Atual vs Anterior
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[250px] w-full" /> : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data} layout="vertical" aria-label={aria} title="Gráfico de comparação de métricas" desc="Barras horizontais comparando o período atual com o período anterior por métrica.">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend />
                <Bar dataKey="atual" name="Período Atual" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                <Bar dataKey="anterior" name="Período Anterior" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Period Area Chart ───
export function PeriodAreaChart({ data, label, dateLabel, gradientId, color, total, isLoading, variant = 'primary' }: {
  data: Array<Record<string, unknown>>; label: string; dateLabel: string;
  gradientId: string; color: string; total: number; isLoading: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const top = maxItem(data, (r) => num(r.total));
  const aria = `Gráfico de área ${label}. Total ${total}${top ? `, máximo ${num(top.total)} em ${String(top.date ?? '—')}` : ''}.`;
  return (
    <Card className={variant === 'primary' ? 'border-primary/30' : 'border-muted-foreground/30'}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          <Badge variant={variant === 'primary' ? 'outline' : 'secondary'} className={variant === 'primary' ? 'bg-primary/20 text-primary border-primary/30' : ''}>
            {dateLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-[250px] w-full" /> : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data} aria-label={aria} title={label} desc={`Evolução de ${label} ao longo do período ${dateLabel}.`}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="total" stroke={color} fill={`url(#${gradientId})`} strokeWidth={2} name="Total" />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div className="mt-3 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-muted-foreground">Total:</span>
            <span className="font-bold">{total}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Distribution Pie Chart ───
export function DistributionPieChart({ data, label, isLoading, colors, variant = 'primary' }: {
  data: Array<{ name: string; value: number }>; label: string; isLoading: boolean;
  colors?: string[]; variant?: 'primary' | 'secondary';
}) {
  const finalColors = colors || COLORS;
  const top = maxItem(data, (r) => r.value);
  const aria = top
    ? `Gráfico de pizza ${label}. Maior fatia: ${top.name} com ${top.value}.`
    : `Gráfico de pizza ${label}.`;
  return (
    <Card className={variant === 'primary' ? 'border-primary/30' : 'border-muted-foreground/30'}>
      <CardHeader className="pb-2"><CardTitle className="text-base">{label}</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-[200px] w-full" /> : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart aria-label={aria} title={label} desc={`Distribuição proporcional de ${label} por categoria.`}>
              <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value">
                {data.map((_, index) => <Cell key={`cell-${index}`} fill={finalColors[index % finalColors.length]} />)}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Daily Messages Chart (non-comparison) ───
export function DailyMessagesChart({ data, isLoading }: { data: ChartData; isLoading: boolean }) {
  const topEnv = maxItem(data.daily, (r) => num(r.enviadas));
  const topRec = maxItem(data.daily, (r) => num(r.recebidas));
  const ariaArea = `Gráfico de mensagens enviadas e recebidas por dia${topEnv ? `. Máximo de enviadas: ${num(topEnv.enviadas)} em ${String(topEnv.date ?? '—')}` : ''}${topRec ? `, de recebidas: ${num(topRec.recebidas)} em ${String(topRec.date ?? '—')}` : ''}.`;
  const topRem = maxItem(data.bySender, (r) => r.value);
  const ariaPie = topRem
    ? `Gráfico de distribuição de remetentes. Maior remetente: ${topRem.name} com ${topRem.value}.`
    : 'Gráfico de distribuição de remetentes.';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Mensagens por Dia</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[300px] w-full" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.daily} aria-label={ariaArea} title="Mensagens por dia" desc="Evolução diária de mensagens enviadas e recebidas.">
                <defs>
                  <linearGradient id="colorEnviadas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRecebidas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="enviadas" stroke="hsl(var(--primary))" fill="url(#colorEnviadas)" strokeWidth={2} />
                <Area type="monotone" dataKey="recebidas" stroke="hsl(var(--chart-2))" fill="url(#colorRecebidas)" strokeWidth={2} />
                <Legend />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Distribuição</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[300px] w-full" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart aria-label={ariaPie} title="Distribuição por remetente" desc="Distribuição proporcional de mensagens por remetente.">
                <Pie data={data.bySender} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {data.bySender.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Agents Chart ───
export function AgentsChart({ data, isLoading }: { data: Array<{ name: string; mensagens: number }>; isLoading: boolean }) {
  const top = maxItem(data, (r) => r.mensagens);
  const aria = top
    ? `Gráfico de mensagens por agente. Maior volume: ${top.name} com ${top.mensagens} mensagens.`
    : 'Gráfico de mensagens por agente.';
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Mensagens por Agente</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-[400px] w-full" /> : data.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} layout="vertical" aria-label={aria} title="Mensagens por agente" desc="Total de mensagens por agente em barras horizontais.">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="mensagens" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground">Nenhum dado disponível para o período selecionado</div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Contacts Charts ───
export function ContactsCharts({ data, isLoading }: { data: ContactsChartData; isLoading: boolean }) {
  const topNovos = maxItem(data.daily, (r) => num(r.novos));
  const ariaLine = `Gráfico de novos contatos por dia${topNovos ? `. Máximo de novos contatos: ${num(topNovos.novos)} em ${String(topNovos.date ?? '—')}` : ''}.`;
  const topTipo = maxItem(data.byType, (r) => r.value);
  const ariaPie = topTipo
    ? `Gráfico de contatos por tipo. Maior tipo: ${topTipo.name} com ${topTipo.value}.`
    : 'Gráfico de contatos por tipo.';
  const topTag = maxItem(data.byTag, (r) => r.contatos);
  const ariaBar = topTag
    ? `Gráfico de contatos por tag. Maior etiqueta: ${topTag.name} com ${topTag.contatos}.`
    : 'Gráfico de contatos por tag.';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Novos Contatos por Dia</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[300px] w-full" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.daily} aria-label={ariaLine} title="Novos contatos por dia" desc="Evolução diária de novos contatos.">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="novos" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Contatos por Tipo</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[300px] w-full" /> : data.byType.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart aria-label={ariaPie} title="Contatos por tipo" desc="Distribuição proporcional de contatos por tipo.">
                <Pie data={data.byType} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {data.byType.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Nenhum dado disponível</div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle className="text-base">Contatos por Tag</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-[300px] w-full" /> : data.byTag.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.byTag} aria-label={ariaBar} title="Contatos por tag" desc="Total de contatos por etiqueta em barras verticais.">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="contatos" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">Nenhum dado de tags disponível</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
