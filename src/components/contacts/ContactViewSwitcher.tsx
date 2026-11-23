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
  const className = 'absolute inset-0 rounded-[7px] bg-[linear-gradient(140deg,hsl(var(--primary)),hsl(var(--primary)/0.85))] shadow-[0_2px_7px_hsl(0_0%_0%/0.2)] -z-10';
  if (reduceMotion) return <span className={className} />;
  return (
    <motion.span
      layoutId="contacts-view-pill"
      className={className}
      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
    />
  );
}

/** Botão do `zc-view-switch`: raio 7px, texto 11px, ícone 15px. */
const SWITCH_BUTTON_CLASS = 'relative isolate h-[34px] px-[11px] rounded-[7px] text-[11px] font-medium flex items-center gap-[7px] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background max-[559px]:flex-1 max-[559px]:justify-center max-[559px]:px-2';

export function ContactViewSwitcher({
  viewMode, onViewModeChange, gridColumns, onGridColumnsChange,
  groupByCompany, onGroupByCompanyChange,
}: ContactViewSwitcherProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const isSecondaryActive = SECONDARY_MODES.some(m => m.value === viewMode);

  return (
    <div className="flex items-center gap-2 max-[559px]:flex-1" data-testid="view-switcher">
      {/* Segmentado de visões — `zc-view-switch`: trilho raio 9px, p3px, fundo escuro. */}
      <LayoutGroup id="contacts-view">
        <div data-testid="view-switcher" className="h-10 min-h-10 rounded-[9px] border border-border bg-card p-[3px] flex items-center gap-[3px] max-[559px]:flex-1 max-[559px]:justify-between">
          {PRIMARY_MODES.map(({ value, label, icon: Icon }) => {
            const active = viewMode === value;
            return (
              <button
                key={value}
                onClick={() => onViewModeChange(value)}
                title={label}
                aria-pressed={active}
                aria-label={`${label} de contatos`}
                className={cn(
                  SWITCH_BUTTON_CLASS,
                  active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                {active && <SegmentPill reduceMotion={reduceMotion} />}
                <Icon className="w-[15px] h-[15px]" />
                <span className="hidden md:inline">{label}</span>
              </button>
            );
          })}

          {/* Mais visualizações */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  SWITCH_BUTTON_CLASS,
                  isSecondaryActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
                title="Mais visualizações"
                aria-pressed={isSecondaryActive}
                aria-label="Mais visualizações de contatos"
              >
                {isSecondaryActive && <SegmentPill reduceMotion={reduceMotion} />}
                {isSecondaryActive
                  ? (() => {
                      const active = SECONDARY_MODES.find(m => m.value === viewMode)!;
                      const Icon = active.icon;
                      return <><Icon className="w-[15px] h-[15px]" /><span className="hidden md:inline">{active.label}</span></>;
                    })()
                  : <><span className="hidden md:inline">Mais</span><ChevronDown className="w-3.5 h-3.5" /></>
                }
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuLabel className="text-2xs text-muted-foreground">Mais visualizações</DropdownMenuLabel>
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

      {/* Colunas + Agrupamento — `zc-control` de 40px. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="Colunas" className="h-10 min-h-10 px-[11px] rounded-[9px] bg-input border-border text-[11px] font-medium gap-[7px]">
            <Settings2 className="w-[15px] h-[15px]" />
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
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Agrupamento{viewMode !== 'list' && ' (por empresa só na Lista)'}
          </DropdownMenuLabel>
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
