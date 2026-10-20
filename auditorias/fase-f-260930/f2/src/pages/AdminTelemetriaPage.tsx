import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, RefreshCw, Trash2, CalendarIcon } from "lucide-react";
import { TelemetryCharts } from "@/components/admin/telemetry/TelemetryCharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import type { TelemetryRow, SeverityFilter, TimeFilter } from "./admin-telemetria/telemetryTypes";
import { formatDuration, computeTopOffenders } from "./admin-telemetria/telemetryUtils";
import { TelemetryStatsCards } from "./admin-telemetria/TelemetryStatsCards";
import { TelemetryTopOffenders } from "./admin-telemetria/TelemetryTopOffenders";
import { TelemetryTable } from "./admin-telemetria/TelemetryTable";

export default function AdminTelemetriaPage() {
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("24h");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();

  const getTimeThreshold = (): { from: string; to: string } => {
    const now = new Date();
    const to = now.toISOString();
    if (timeFilter === "custom" && customDateFrom && customDateTo) {
      const endOfDay = new Date(customDateTo);
      endOfDay.setHours(23, 59, 59, 999);
      return { from: customDateFrom.toISOString(), to: endOfDay.toISOString() };
    }
    const ms = timeFilter === "1h" ? 3600000
      : timeFilter === "6h" ? 21600000
      : timeFilter === "24h" ? 86400000
      : 604800000;
    return { from: new Date(now.getTime() - ms).toISOString(), to };
  };

  const { data: rows = [], isLoading, refetch, isRefetching } = useQuery<TelemetryRow[]>({
    queryKey: ["query-telemetry", severityFilter, timeFilter, customDateFrom?.toISOString(), customDateTo?.toISOString()],
    queryFn: async () => {
      const { from, to } = getTimeThreshold();
      let query = supabase
        .from("query_telemetry")
        .select("*")
        .gte("created_at", from)
        .lte("created_at", to)
        .order("created_at", { ascending: false })
        .limit(500);

      if (severityFilter !== "all") {
        query = query.eq("severity", severityFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown as TelemetryRow[]) || [];
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const handleCleanup = async () => {
    const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("query_telemetry").delete().lt("created_at", threshold);
    if (error) toast.error("Erro ao limpar dados antigos");
    else { toast.success("Dados com mais de 7 dias removidos"); refetch(); }
  };



  const verySlow = rows.filter(r => r.severity === "very_slow").length;
  const slow = rows.filter(r => r.severity === "slow").length;
  const errors = rows.filter(r => r.severity === "error").length;
  const avgDuration = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.duration_ms, 0) / rows.length) : 0;
  const topOffenders = computeTopOffenders(rows);

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Telemetria de Queries</h1>
            <p className="text-sm text-muted-foreground">Monitoramento de performance do banco externo</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">

          <Button variant="outline" size="sm" onClick={handleCleanup}><Trash2 className="h-3.5 w-3.5 mr-1.5" />Limpar +7d</Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />Atualizar
          </Button>
        </div>
      </div>

      <TelemetryStatsCards verySlow={verySlow} slow={slow} errors={errors} avgDuration={formatDuration(avgDuration)} />
      <TelemetryTopOffenders topOffenders={topOffenders} />
      <TelemetryCharts rows={rows} timeFilter={timeFilter} />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Severidade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="slow">🟡 Lentas</SelectItem>
            <SelectItem value="very_slow">🔴 Muito Lentas</SelectItem>
            <SelectItem value="error">❌ Erros</SelectItem>
          </SelectContent>
        </Select>
        <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">Última hora</SelectItem>
            <SelectItem value="6h">Últimas 6h</SelectItem>
            <SelectItem value="24h">Últimas 24h</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="custom">📅 Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {timeFilter === "custom" && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-36 justify-start text-left font-normal", !customDateFrom && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />{customDateFrom ? format(customDateFrom, "dd/MM/yyyy") : "De"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customDateFrom} onSelect={setCustomDateFrom} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("w-36 justify-start text-left font-normal", !customDateTo && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />{customDateTo ? format(customDateTo, "dd/MM/yyyy") : "Até"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customDateTo} onSelect={setCustomDateTo} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{rows.length} registros · auto-refresh 30s</span>
      </div>

      <TelemetryTable rows={rows} isLoading={isLoading} />
    </div>
  );
}
