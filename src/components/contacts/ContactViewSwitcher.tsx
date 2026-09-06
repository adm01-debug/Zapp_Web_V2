import { LayoutGrid, List, Table2, Settings2, MapPin, Kanban, BarChart3, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type ContactViewMode = 'grid' | 'list' | 'table' | 'map' | 'kanban' | 'analytics';

interface ContactViewSwitcherProps {
  viewMode: ContactViewMode;
  onViewModeChange: (mode: ContactViewMode) => void;
  gridColumns: number;
  onGridColumnsChange: (cols: number) => void;
}

const PRIMARY_MODES = [
  { value: 'grid' as const, label: 'Cards', icon: LayoutGrid },
  { value: 'list' as const, label: 'Lista', icon: List },
  { value: 'table' as const, label: 'Tabela', icon: Table2 },
];

const SECONDARY_MODES = [
  { value: 'kanban' as const, label: 'Pipeline', icon: Kanban },
  { value: 'map' as const, label: 'Mapa', icon: MapPin },
  { value: 'analytics' as const, label: 'Analytics', icon: BarChart3 },
];

const GRID_COLUMN_OPTIONS = [3, 4, 5, 6];

export function ContactViewSwitcher({
  viewMode, onViewModeChange, gridColumns, onGridColumnsChange,
}: ContactViewSwitcherProps) {
  const isSecondaryActive = SECONDARY_MODES.some(m => m.value === viewMode);

  return (
    <div className="flex items-center gap-1">
      {/* Primary view mode toggles */}
      <div className="flex items-center bg-muted/50 border border-border/30 rounded-lg p-0.5 gap-0.5">
        {PRIMARY_MODES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => onViewModeChange(value)}
            title={label}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
              viewMode === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}

        {/* More views dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
                isSecondaryActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
              title="Mais visualizações"
            >
              {isSecondaryActive
                ? (() => {
                    const active = SECONDARY_MODES.find(m => m.value === viewMode)!;
                    const Icon = active.icon;
                    return <><Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{active.label}</span></>;
                  })()
                : <><span className="hidden sm:inline text-[11px]">Mais</span><ChevronDown className="w-3 h-3" /></>
              }
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">Mais visualizações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SECONDARY_MODES.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem
                key={value}
                onClick={() => onViewModeChange(value)}
                className={cn("text-xs gap-2", viewMode === value && "bg-primary/10 text-primary")}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Grid columns selector (only in grid mode) */}
      {viewMode === 'grid' && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs border-border/40">
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Colunas</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Colunas</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {GRID_COLUMN_OPTIONS.map(cols => (
              <DropdownMenuItem
                key={cols}
                onClick={() => onGridColumnsChange(cols)}
                className={cn("text-xs gap-2", gridColumns === cols && "bg-primary/10 text-primary")}
              >
                <div className="flex gap-0.5">
                  {Array.from({ length: cols }).map((_, i) => (
                    <div key={i} className="w-1.5 h-3 rounded-[1px] bg-current opacity-60" />
                  ))}
                </div>
                {cols} colunas
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
