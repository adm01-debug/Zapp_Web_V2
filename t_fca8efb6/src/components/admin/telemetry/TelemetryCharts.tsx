import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { CHART_TICK_FONT_SIZE, CHART_TOOLTIP_FONT_SIZE } from "@/lib/chart-theme";
import { Activity, TrendingUp, Timer } from "lucide-react";

interface TelemetryRow {
  id: string;
  operation: string;
  table_name: string | null;
  rpc_name: string | null;
  duration_ms: number;
  severity: string;
  created_at: string;
}

interface TelemetryChartsProps {
  rows: TelemetryRow[];
  timeFilter: string;
}

function formatBucketTime(ts: number, timeFilter: string): string {
  const d = new Date(ts);
  if (timeFilter === "7d" || timeFilter === "custom") {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function TelemetryCharts({ rows, timeFilter }: TelemetryChartsProps) {
  const bucketMs =
    timeFilter === "1h" ? 5 * 60_000
    : timeFilter === "6h" ? 30 * 60_000
    : timeFilter === "24h" ? 60 * 60_000
    : 6 * 60 * 60_000;

  // Build timeline buckets with severity breakdown + duration stats
  const bucketMap = new Map<number, {
    bucket: number;
    muitoLentas: number;
    lentas: number;
    erros: number;
    mediaMs: number;
    maxMs: number;
    totalMs: number;
    count: number;
  }>();

  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    const bucket = Math.floor(t / bucketMs) * bucketMs;
    const prev = bucketMap.get(bucket) || {
      bucket, muitoLentas: 0, lentas: 0, erros: 0,
      mediaMs: 0, maxMs: 0, totalMs: 0, count: 0,
    };
    prev.count += 1;
    prev.totalMs += r.duration_ms;
    prev.maxMs = Math.max(prev.maxMs, r.duration_ms);
    prev.mediaMs = Math.round(prev.totalMs / prev.count);

    if (r.severity === "very_slow") prev.muitoLentas += 1;
    else if (r.severity === "slow") prev.lentas += 1;
    else if (r.severity === "error") prev.erros += 1;

    bucketMap.set(bucket, prev);
  }

  const timelineData = [...bucketMap.values()]
    .sort((a, b) => a.bucket - b.bucket)
    .map(d => ({
      ...d,
      time: formatBucketTime(d.bucket, timeFilter),
    }));

  // Top tables bar chart
  const tableMap = new Map<string, number>();
  for (const r of rows) {
    const key = r.rpc_name || r.table_name || "unknown";
    tableMap.set(key, (tableMap.get(key) || 0) + 1);
  }
  const barData = [...tableMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  if (rows.length === 0) return null;

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: CHART_TOOLTIP_FONT_SIZE,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Stacked Area: Alerts by Severity */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Alertas por Severidade
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="time" tick={{ fontSize: CHART_TICK_FONT_SIZE }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: CHART_TICK_FONT_SIZE }} className="fill-muted-foreground" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
              <Area
                type="monotone" dataKey="muitoLentas" name="Muito Lentas"
                stackId="1" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))"
                fillOpacity={0.6}
              />
              <Area
                type="monotone" dataKey="erros" name="Erros"
                stackId="1" stroke="hsl(0 84% 60%)" fill="hsl(0 84% 60%)"
                fillOpacity={0.5}
              />
              <Area
                type="monotone" dataKey="lentas" name="Lentas"
                stackId="1" stroke="hsl(45 93% 47%)" fill="hsl(45 93% 47%)"
                fillOpacity={0.4}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Area: Avg / Max Duration */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Duração Média / Máxima (ms)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis dataKey="time" tick={{ fontSize: CHART_TICK_FONT_SIZE }} className="fill-muted-foreground" />
              <YAxis tick={{ fontSize: CHART_TICK_FONT_SIZE }} className="fill-muted-foreground" />
              <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "hsl(var(--foreground))" }} />
              <Area
                type="monotone" dataKey="maxMs" name="Máxima"
                stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))"
                fillOpacity={0.15} strokeWidth={1.5}
              />
              <Area
                type="monotone" dataKey="mediaMs" name="Média"
                stroke="hsl(var(--primary))" fill="hsl(var(--primary))"
                fillOpacity={0.25} strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Tables Bar */}
      {barData.length > 0 && (
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Top Tabelas com Alertas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: CHART_TICK_FONT_SIZE }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: CHART_TICK_FONT_SIZE }} width={120} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Alertas" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
