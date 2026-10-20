import { Clock, Filter, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DashboardToolbarProps {
  onRefresh?: () => void;
  onExport?: () => void;
  onFilter?: () => void;
  isLoading?: boolean;
  lastUpdated?: Date;
}

export function DashboardToolbar({ onRefresh, onExport, onFilter, isLoading, lastUpdated }: DashboardToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>
          Atualizado {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'agora'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {onFilter && (
          <Button variant="outline" size="sm" onClick={onFilter} className="gap-2">
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filtrar</span>
          </Button>
        )}
        {onExport && (
          <Button variant="outline" size="sm" onClick={onExport} className="gap-2">
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
        )}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading} className="gap-2">
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            <span className="hidden sm:inline">Atualizar</span>
          </Button>
        )}
      </div>
    </div>
  );
}
