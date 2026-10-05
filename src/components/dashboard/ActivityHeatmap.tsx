import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Calendar, Activity, TrendingUp, Flame } from 'lucide-react';
import { format, subDays, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useActivityHeatmapData, type ActivityData, type ActivityMetric, type ActivityPeriod } from '@/hooks/analytics/useActivityHeatmapData';

interface ActivityHeatmapProps {
  title?: string;
  data?: ActivityData[];
  metric?: ActivityMetric;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const getLevelColor = (level: number, isDark: boolean = false) => {
  const colors = isDark
    ? ['bg-muted/30', 'bg-success/20/50', 'bg-success/60', 'bg-success/70', 'bg-success']
    : ['bg-muted', 'bg-success/20', 'bg-success/30', 'bg-success', 'bg-success'];
  return colors[level] || colors[0];
};

export const ActivityHeatmap = ({
  title = 'Atividade',
  data: propData,
  metric = 'messages',
}: ActivityHeatmapProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<ActivityPeriod>('3m');
  const [hoveredDay, setHoveredDay] = useState<ActivityData | null>(null);

  // A métrica decide a fonte de verdade (messages/conversations/resolutions) —
  // antes o queryFn ignorava `metric` e sempre contava mensagens.
  const { data: realData } = useActivityHeatmapData(selectedPeriod, metric, !propData);

  // Use provided data, real data, or empty array
  const data = useMemo(() => {
    return propData || realData || [];
  }, [propData, realData]);

  // Group data by weeks
  const weeks = useMemo(() => {
    const grouped: ActivityData[][] = [];
    let currentWeek: ActivityData[] = [];

    data.forEach((day, index) => {
      const dayOfWeek = getDay(day.date);
      
      if (index === 0) {
        // Fill empty days at the start of the first week
        for (let i = 0; i < dayOfWeek; i++) {
          currentWeek.push({ date: subDays(day.date, dayOfWeek - i), count: 0, level: 0 });
        }
      }

      currentWeek.push(day);

      if (dayOfWeek === 6 || index === data.length - 1) {
        // Fill empty days at the end of the last week
        if (index === data.length - 1 && dayOfWeek < 6) {
          for (let i = dayOfWeek + 1; i <= 6; i++) {
            currentWeek.push({ date: subDays(day.date, dayOfWeek - i), count: 0, level: 0 });
          }
        }
        grouped.push(currentWeek);
        currentWeek = [];
      }
    });

    return grouped;
  }, [data]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    const activeDays = data.filter(d => d.count > 0).length;
    const maxCount = Math.max(...data.map(d => d.count));
    const avgCount = Math.round(total / activeDays) || 0;

    // Calculate current streak
    let streak = 0;
    for (let i = data.length - 1; i >= 0; i--) {
      if (data[i].count > 0) streak++;
      else break;
    }

    return { total, activeDays, maxCount, avgCount, streak };
  }, [data]);

  const getMetricLabel = () => {
    switch (metric) {
      case 'messages': return 'mensagens';
      case 'conversations': return 'conversas';
      case 'resolutions': return 'resoluções';
      default: return 'atividades';
    }
  };

  // Get month labels
  const monthLabels = useMemo(() => {
    const labels: { month: string; weekIndex: number }[] = [];
    let lastMonth = -1;

    weeks.forEach((week, weekIndex) => {
      const firstDayOfWeek = week[0];
      if (firstDayOfWeek) {
        const month = firstDayOfWeek.date.getMonth();
        if (month !== lastMonth) {
          labels.push({ month: MONTHS[month], weekIndex });
          lastMonth = month;
        }
      }
    });

    return labels;
  }, [weeks]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <Select value={selectedPeriod} onValueChange={(v) => setSelectedPeriod(v as ActivityPeriod)}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3m">3 meses</SelectItem>
              <SelectItem value="6m">6 meses</SelectItem>
              <SelectItem value="1y">1 ano</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Total:</span>
            <span className="font-medium">{stats.total.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Dias ativos:</span>
            <span className="font-medium">{stats.activeDays}</span>
          </div>
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-warning" />
            <span className="text-muted-foreground">Streak:</span>
            <Badge variant="secondary">{stats.streak} dias</Badge>
          </div>
        </div>

        {/* Heatmap */}
        <div className="overflow-x-auto">
          <div className="min-w-max">
            {/* Month labels */}
            <div className="flex mb-1 ml-8">
              {monthLabels.map(({ month, weekIndex }, i) => (
                <div
                  key={i}
                  className="text-xs text-muted-foreground"
                  style={{ 
                    marginLeft: i === 0 ? weekIndex * 14 : (weekIndex - (monthLabels[i-1]?.weekIndex || 0)) * 14 - 20
                  }}
                >
                  {month}
                </div>
              ))}
            </div>

            <div className="flex gap-0.5">
              {/* Weekday labels */}
              <div className="flex flex-col gap-0.5 mr-1">
                {WEEKDAYS.map((day, i) => (
                  <div
                    key={day}
                    className="h-3 text-3xs text-muted-foreground flex items-center"
                    style={{ visibility: i % 2 === 1 ? 'visible' : 'hidden' }}
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Grid */}
              <div className="flex gap-0.5">
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} className="flex flex-col gap-0.5">
                    {week.map((day, dayIndex) => (
                      <TooltipProvider key={dayIndex}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <motion.div
                              whileHover={{ scale: 1.3 }}
                              className={`w-3 h-3 rounded-sm cursor-pointer ${getLevelColor(day.level)}`}
                              onMouseEnter={() => setHoveredDay(day)}
                              onMouseLeave={() => setHoveredDay(null)}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="text-xs">
                              <div className="font-medium">
                                {format(day.date, "d 'de' MMMM, yyyy", { locale: ptBR })}
                              </div>
                              <div className="text-muted-foreground">
                                {day.count} {getMetricLabel()}
                              </div>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center justify-end gap-1 mt-2 text-xs text-muted-foreground">
              <span>Menos</span>
              {[0, 1, 2, 3, 4].map(level => (
                <div
                  key={level}
                  className={`w-3 h-3 rounded-sm ${getLevelColor(level)}`}
                />
              ))}
              <span>Mais</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
