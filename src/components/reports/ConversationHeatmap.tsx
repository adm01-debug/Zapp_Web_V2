/**
 * ConversationHeatmap — reports/ version
 *
 * PURPOSE: Self-contained, zero-prop widget for embedding inside the
 * Reports page. Fetches its own data and exposes a period selector
 * that the dashboard version does not have.
 *
 * KEY DIFFERENCES from dashboard/ConversationHeatmap:
 *  - Named export (imported directly by AdvancedReportsView)
 *  - Zero props — fully self-contained, no external data injection
 *  - Period selector dropdown: 7 / 30 / 90 days  ← UNIQUE TO THIS FILE
 *  - Single metric: volume only (no response_time / satisfaction tabs)
 *  - useState + useEffect (no TanStack Query / no cache)
 *  - Simple Tailwind opacity classes for color (bg-primary/25 …/60, bg-warning/80, bg-destructive/80)
 *  - No animations (no framer-motion dependency)
 *  - No onCellClick callback
 *  - No hotspot detection, no stats summary row
 *
 * DO NOT merge with dashboard/ConversationHeatmap — that file is a
 * configurable, prop-driven widget with multi-metric tabs, Framer Motion
 * and TanStack Query caching. Both serve distinct UI contexts.
 */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Flame } from 'lucide-react';

interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function ConversationHeatmap() {
  const [data, setData] = useState<HeatmapCell[]>([]);
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [period]);

  const loadData = async () => {
    setLoading(true);
    const since = new Date();
    since.setDate(since.getDate() - parseInt(period));

    const { data: messages } = await supabase
      .from('messages')
      .select('created_at')
      .gte('created_at', since.toISOString())
      .eq('sender', 'contact')
      .limit(1000);

    if (messages) {
      const heatmap: Record<string, number> = {};
      messages.forEach((m) => {
        const date = new Date(m.created_at);
        const key = `${date.getDay()}-${date.getHours()}`;
        heatmap[key] = (heatmap[key] || 0) + 1;
      });

      const cells: HeatmapCell[] = [];
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          cells.push({ day: d, hour: h, count: heatmap[`${d}-${h}`] || 0 });
        }
      }
      setData(cells);
    }
    setLoading(false);
  };

  const maxCount = useMemo(() => Math.max(1, ...data.map(c => c.count)), [data]);

  const getIntensity = (count: number): string => {
    if (count === 0) return 'bg-muted/20';
    const ratio = count / maxCount;
    if (ratio > 0.75) return 'bg-destructive/80';
    if (ratio > 0.5) return 'bg-warning/80';
    if (ratio > 0.25) return 'bg-primary/60';
    return 'bg-primary/25';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" />
            Heatmap de Volume
          </CardTitle>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-28 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-40 bg-muted/20 rounded-xl animate-pulse" />
        ) : (
          <div className="space-y-1">
            {/* Header: hours */}
            <div className="flex gap-0.5 ml-10">
              {HOURS.filter(h => h % 3 === 0).map(h => (
                <div key={h} className="text-[9px] text-muted-foreground w-[calc((100%-40px)/8)] text-center">
                  {String(h).padStart(2, '0')}h
                </div>
              ))}
            </div>
            {/* Grid */}
            {DAYS.map((dayName, dayIdx) => (
              <div key={dayIdx} className="flex items-center gap-0.5">
                <span className="text-[10px] text-muted-foreground w-10 text-right pr-1">{dayName}</span>
                <div className="flex gap-0.5 flex-1">
                  {HOURS.map(h => {
                    const cell = data.find(c => c.day === dayIdx && c.hour === h);
                    return (
                      <div
                        key={h}
                        className={`aspect-square flex-1 rounded-sm transition-colors ${getIntensity(cell?.count || 0)}`}
                        title={`${dayName} ${h}h: ${cell?.count || 0} mensagens`}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center gap-2 justify-end pt-2">
              <span className="text-[9px] text-muted-foreground">Menos</span>
              <div className="flex gap-0.5">
                {['bg-muted/20', 'bg-primary/25', 'bg-primary/60', 'bg-warning/80', 'bg-destructive/80'].map((c, i) => (
                  <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
                ))}
              </div>
              <span className="text-[9px] text-muted-foreground">Mais</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
