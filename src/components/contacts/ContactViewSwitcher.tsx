import { LayoutGrid, List, Table2, Settings2, MapPin, Kanban, BarChart3, ChevronDown, Check } from 'lucide-react';
import { motion, LayoutGroup, useReducedMotion } from 'framer-motion';
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
  groupByCompany: boolean;
  onGroupByCompanyChange: (val: boolean) => void;
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

function SegmentPill({ reduceMotion }: { reduceMotion: boolean }) {
  if (reduceMotion) return <span className="absolute inset-0 rounded-[10px] bg-primary -z-10" />;
  return (
    <motion.span
      layoutId="contacts-view-pill"
      className="absolute inset-0 rounded-[10px] bg-primary -z-10"
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    />
  );
}

export function ContactViewSwitcher({
  viewMode, onViewModeChange, gridColumns, onGridColumnsChange,
  groupByCompany, onGroupByCompanyChange,
}: ContactViewSwitcherProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const isSecondaryActive = SECONDARY_MODES.some(m => m.value === viewMode);

  return (
    <div className="flex items-center gap-2">
      {/* Segmented view mode toggles */}
      <LayoutGroup id="contacts-view">
        <div className="h-11 rounded-xl border border-border bg-card p-1 flex items-center gap-1">
          {PRIMARY_MODES.map(({ value, label, icon: Icon }) => {
            const active = viewMode === value;
            return (
              <button
                key={value}
                onClick={() => onViewModeChange(value)}
                title={label}
                className={cn(
                  'relative h-9 px-4 rounded-[10px] text-[15px] font-medium flex items-center gap-2 transition-colors',
                  active ? 'text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                {active && <SegmentPill reduceMotion={reduceMotion} />}
                <Icon className="w-[18px] h-[18px]" />
                <span className="hidden md:inline">{label}</span>
              </button>
            );
          })}

          {/* More views dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'relative h-9 px-4 rounded-[10px] text-[15px] font-medium flex items-center gap-2 transition-colors',
                  isSecondaryActive ? 'text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
                title="Mais visualizações"
              >
                {isSecondaryActive && <SegmentPill reduceMotion={reduceMotion} />}
                {isSecondaryActive
                  ? (() => {
                      const active = SECONDARY_MODES.find(m => m.value === viewMode)!;
                      const Icon = active.icon;
                      return <><Icon className="w-[18px] h-[18px]" /><span className="hidden md:inline">{active.label}</span></>;
                    })()
                  : <><span className="hidden md:inline">Mais</span><ChevronDown className="w-4 h-4" /></>
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
      </LayoutGroup>

      {/* Colunas + Agrupamento */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-11 px-4 rounded-xl bg-input border-border text-[15px] font-medium gap-2">
            <Settings2 className="w-[18px] h-[18px]" />
            <span className="hidden sm:inline">Colunas</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {viewMode === 'grid' && (
            <>
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
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel className="text-xs text-muted-foreground">Agrupamento</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onGroupByCompanyChange(!groupByCompany)} className="gap-2 text-xs">
            <span className={cn("w-3.5 h-3.5 flex items-center justify-center", groupByCompany ? "text-primary" : "text-transparent")}>
              <Check className="w-3.5 h-3.5" />
            </span>
            Por empresa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
