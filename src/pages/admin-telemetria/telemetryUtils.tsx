import { Badge } from '@/components/ui/badge';

export function formatDuration(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "2-digit", month: "2-digit",
  });
}

export function getSeverityBadge(severity: string) {
  switch (severity) {
    case "very_slow":
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-3xs">🔴 Muito Lenta</Badge>;
    case "slow":
      return <Badge className="bg-warning/20 text-warning border-warning/30 text-3xs">🟡 Lenta</Badge>;
    case "error":
      return <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-3xs">❌ Erro</Badge>;
    default:
      return <Badge variant="secondary" className="text-3xs">{severity}</Badge>;
  }
}

export function computeTopOffenders(rows: { rpc_name: string | null; table_name: string | null; duration_ms: number }[]) {
  const tableStats = new Map<string, { count: number; totalMs: number; maxMs: number }>();
  for (const r of rows) {
    const key = r.rpc_name || r.table_name || "unknown";
    const prev = tableStats.get(key) || { count: 0, totalMs: 0, maxMs: 0 };
    tableStats.set(key, {
      count: prev.count + 1,
      totalMs: prev.totalMs + r.duration_ms,
      maxMs: Math.max(prev.maxMs, r.duration_ms),
    });
  }
  return [...tableStats.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 8);
}
