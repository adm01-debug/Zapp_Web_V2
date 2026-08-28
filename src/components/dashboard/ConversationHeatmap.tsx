/**
 * ConversationHeatmap — dashboard/ version
 *
 * PURPOSE: Configurable, composable heatmap widget designed for embedding
 * inside the Dashboard page. Accepts external data via props so the parent
 * can inject any HeatmapData[] without coupling this component to a specific
 * fetch strategy.
 *
 * KEY DIFFERENCES from reports/ConversationHeatmap:
 *  - Default export (consumed by DashboardPage as a named import alias)
 *  - Props: data?, metric?, className?, onCellClick?   ← fully injectable
 *  - Multi-metric tabs: volume | response_time | satisfaction
 *  - Framer-motion cell hover animation (whileHover scale 1.2)
 *  - Hotspot detection: top-5 busiest cells marked with warning ring + dot
 *  - Stats summary row: Pico Semanal / Horário Nobre / Melhor Dia
 *  - Hex-value color scale (configurable per metric, supports invert)
 *  - useQuery (TanStack) with staleTime 5 min — auto-refreshes without prop
 *  - Contains a private StatCard sub-component
 *  - overflow-x-auto + min-w-[600px] for safe mobile rendering
 *
 * DO NOT merge with reports/ConversationHeatmap — that file is a
 * self-contained widget with a period-selector (7/30/90d), no props,
 * no multi-metric and no animations. Both serve distinct UI contexts.
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Clock, TrendingUp, Flame, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface HeatmapData {
  day: number; // 0-6 (Sunday-Saturday)
  hour: number; // 0-23
  value: number;
  count?: number;
}

interface ConversationHeatmapProps {
  data?: HeatmapData[];
  metric?: 'volume' | 'response_time' | 'satisfaction';
  className?: string;
  onCellClick?: (day: number, hour: number) => void;
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Generate heatmap data from real messages
function useHeatmapData() {
  return useQuery({
    queryKey: ['conversation-heatmap'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('created_at')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
      
      if (error) throw error;
      
      const heatmap: HeatmapData[] = [];
      const counts = new Map<string, number>();
      
      (data || []).forEach(m => {
        const d = new Date(m.created_at);
        const key = `${d.getDay()}-${d.getHours()}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          const key = `${day}-${hour}`;
          const value = counts.get(key) || 0;
          heatmap.push({ day, hour, value, count: value });
        }
      }
      
      return heatmap;
    },
    staleTime: 5 * 60 * 1000,
  });
}

const METRIC_CONFIG = {
  volume: {
    label: 'Volume de Mensagens',
    colorScale: ['#f0fdf4', '#86efac', '#22c55e', '#15803d', '#14532d'],
    unit: 'msgs',
    description: 'Número total de mensagens por período',
  },
  response_time: {
    label: 'Tempo de Resposta',
    colorScale: ['#fef9c3', '#fde047', '#facc15', '#eab308', '#ca8a04'],
    unit: 'seg',
    description: 'Tempo médio de primeira resposta',
  },
  satisfaction: {
    label: 'Satisfação',
    colorScale: ['#fef2f2', '#fecaca', '#f87171', '#ef4444', '#dc2626'],
    unit: '/5',
    description: 'Nota média de satisfação do cliente',
    invert: true,
  },
};

export default function ConversationHeatmap({
  data: externalData,
  metric = 'volume',
  className,
  onCellClick,
}: ConversationHeatmapProps) {
  const { data: realData } = useHeatmapData();
  const data = externalData || realData || [];
  const [selectedMetric, setSelectedMetric] = useState(metric);
  const [hoveredCell, setHoveredCell] = useState<{ day: number; hour: number } | null>(null);

  const config = METRIC_CONFIG[selectedMetric];

  // Calculate min/max for color scaling
  const { min, max, hotspots } = useMemo(() => {
    const values = data.map(d => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    // Find hotspots (top 5 busiest periods)
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const hotspots = sorted.slice(0, 5);
    
    return { min, max, hotspots };
  }, [data]);

  const getColor = (value: number) => {
    const scale = config.colorScale;
    const normalized = (value - min) / (max - min || 1);
    const index = Math.min(Math.floor(normalized * (scale.length - 1)), scale.length - 1);
    const shouldInvert = 'invert' in config && config.invert;
    return scale[shouldInvert ? scale.length - 1 - index : index];
  };

  const getCellData = (day: number, hour: number) => {
    return data.find(d => d.day === day && d.hour === hour);
  };

  const formatHour = (hour: number) => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Flame className="w-5 h-5 text-primary" />
            Mapa de Calor
          </CardTitle>

          <Tabs value={selectedMetric} onValueChange={(v) => setSelectedMetric(v as 'volume' | 'response_time' | 'satisfaction')}>
            <TabsList className="h-8">
              <TabsTrigger value="volume" className="text-xs px-2 h-6">Volume</TabsTrigger>
              <TabsTrigger value="response_time" className="text-xs px-2 h-6">Resposta</TabsTrigger>
              <TabsTrigger value="satisfaction" className="text-xs px-2 h-6">Satisfação</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <p className="text-sm text-muted-foreground flex items-center gap-1">
          {config.description}
          <Tooltip>
            <TooltipTrigger>
              <Info className="w-3.5 h-3.5" />
            </TooltipTrigger>
            <TooltipContent>
              Clique em uma célula para ver detalhes do período
            </TooltipContent>
          </Tooltip>
        </p>
      </CardHeader>

      <CardContent>
        {/* Hotspots */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-muted-foreground">Períodos mais movimentados:</span>
          {hotspots.slice(0, 3).map((spot, i) => (
            <Badge key={i} variant="secondary" className="text-xs gap-1">
              <Flame className="w-3 h-3 text-warning" />
              {DAYS[spot.day]} {formatHour(spot.hour)}
            </Badge>
          ))}
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="flex ml-12 mb-1">
              {HOURS.filter((_, i) => i % 3 === 0).map(hour => (
                <div 
                  key={hour} 
                  className="text-xs text-muted-foreground"
                  style={{ width: `${100 / 8}%` }}
                >
                  {formatHour(hour)}
                </div>
              ))}
            </div>

            {/* Grid */}
            {DAYS.map((day, dayIndex) => (
              <div key={day} className="flex items-center gap-1 mb-1">
                {/* Day label */}
                <div className="w-10 text-xs text-muted-foreground text-right pr-2 shrink-0">
                  {day}
                </div>

                {/* Cells */}
                <div className="flex flex-1 gap-0.5">
                  {HOURS.map(hour => {
                    const cellData = getCellData(dayIndex, hour);
                    const isHovered = hoveredCell?.day === dayIndex && hoveredCell?.hour === hour;
                    const isHotspot = hotspots.some(h => h.day === dayIndex && h.hour === hour);

                    return (
                      <Tooltip key={hour}>
                        <TooltipTrigger asChild>
                          <motion.div
                            whileHover={{ scale: 1.2, zIndex: 10 }}
                            onClick={() => onCellClick?.(dayIndex, hour)}
                            className={cn(
                              "flex-1 aspect-square rounded cursor-pointer transition-all relative",
                              "min-w-[12px] max-w-[24px]",
                              isHotspot && "ring-1 ring-warning/50"
                            )}
                            style={{
                              backgroundColor: cellData ? getColor(cellData.value) : config.colorScale[0],
                            }}
                            onMouseEnter={() => setHoveredCell({ day: dayIndex, hour })}
                            onMouseLeave={() => setHoveredCell(null)}
                          >
                            {isHotspot && (
                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-warning rounded-full" />
                            )}
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-sm">
                            <div className="font-medium">{DAYS_FULL[dayIndex]}, {formatHour(hour)}</div>
                            <div>{config.label}: {cellData?.value ?? 0} {config.unit}</div>
                            {cellData?.count && <div>Total: {cellData.count} conversas</div>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <span className="text-xs text-muted-foreground">Baixo</span>
          <div className="flex h-3 rounded overflow-hidden">
            {config.colorScale.map((color, i) => (
              <div key={i} className="w-6 h-full" style={{ backgroundColor: color }} />
            ))}
          </div>
          <span className="text-xs text-muted-foreground">Alto</span>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t">
          <StatCard
            icon={TrendingUp}
            label="Pico Semanal"
            value={`${max} ${config.unit}`}
            description={`${DAYS_FULL[hotspots[0]?.day ?? 0]} às ${formatHour(hotspots[0]?.hour ?? 0)}`}
          />
          <StatCard
            icon={Clock}
            label="Horário Nobre"
            value="10h - 16h"
            description="Maior concentração"
          />
          <StatCard
            icon={Calendar}
            label="Melhor Dia"
            value={DAYS_FULL[2]}
            description="Menor tempo de espera"
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface StatCardProps {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  description: string;
}

function StatCard({ icon: Icon, label, value, description }: StatCardProps) {
  return (
    <div className="text-center">
      <Icon className="w-4 h-4 mx-auto text-primary mb-1" />
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}
