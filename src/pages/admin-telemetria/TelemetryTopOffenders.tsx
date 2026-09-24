import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Database } from 'lucide-react';
import { formatDuration } from './telemetryUtils';

interface OffenderStats {
  count: number;
  totalMs: number;
  maxMs: number;
}

interface TelemetryTopOffendersProps {
  topOffenders: [string, OffenderStats][];
}

export function TelemetryTopOffenders({ topOffenders }: TelemetryTopOffendersProps) {
  if (topOffenders.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4" />
          Tabelas Mais Problemáticas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {topOffenders.map(([name, stats]) => (
            <div key={name} className="p-3 rounded-lg border border-border/50 bg-muted/30">
              <p className="font-mono text-sm font-medium truncate" title={name}>{name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">{stats.count}× alertas</span>
                <span className="text-xs text-destructive">max {formatDuration(stats.maxMs)}</span>
              </div>
              <p className="text-3xs text-muted-foreground mt-0.5">
                média: {formatDuration(Math.round(stats.totalMs / stats.count))}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
