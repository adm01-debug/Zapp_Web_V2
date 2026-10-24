import { LayoutGrid, List, Settings2, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { FilesColumnSelector } from './FilesColumnSelector';
import type { ColumnOption } from '@/hooks/chat/useFilesContainerColumns';
import type { FilesColumns, FilesViewMode } from '@/hooks/chat/useFilesViewState';

/**
 * Popover de layout (etapa 12): Visualizacao (Grid/Lista/Tabela) e, so no Grid, colunas.
 *
 * Port do `LayoutPopover` do Promo Gifts com uma correcao deliberada: **sem** `Tooltip`
 * aninhado no `PopoverTrigger` (a composicao de la quebra o foco por teclado) — o texto
 * explicativo vai no `title` do gatilho. O componente nao guarda estado proprio: modo e
 * colunas vêm do `useFilesViewState`, o que cabe vem do hook de contêiner.
 */

const VIEW_MODES = [
  { value: 'grid' as const, label: 'Grid', icon: LayoutGrid },
  { value: 'list' as const, label: 'Lista', icon: List },
  { value: 'table' as const, label: 'Tabela', icon: Table2 },
];

interface FilesLayoutPopoverProps {
  viewMode: FilesViewMode;
  onViewModeChange: (mode: FilesViewMode) => void;
  columns: FilesColumns;
  columnOptions: ColumnOption[];
  onColumnsChange: (columns: FilesColumns) => void;
}

export function FilesLayoutPopover({
  viewMode,
  onViewModeChange,
  columns,
  columnOptions,
  onColumnsChange,
}: FilesLayoutPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          aria-label="Alterar layout"
          title="Alterar visualização (grid, lista, tabela) e colunas"
          data-testid="files-layout-trigger"
        >
          <Settings2 className="h-3.5 w-3.5" />
          <span className="text-xs">Layout</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-60 border-border p-4">
        <div className="space-y-4">
          <div>
            <p className="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Visualização
            </p>
            <div className="flex items-center gap-0.5 rounded-xl border border-border/40 bg-muted/60 p-1">
              {VIEW_MODES.map((mode) => {
                const Icone = mode.icon;
                const ativo = viewMode === mode.value;
                return (
                  <button
                    key={mode.value}
                    type="button"
                    aria-pressed={ativo}
                    data-testid={`files-view-${mode.value}`}
                    onClick={() => onViewModeChange(mode.value)}
                    className={cn(
                      'flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                      ativo
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-background/50 hover:text-foreground',
                    )}
                  >
                    <Icone className="h-3.5 w-3.5" />
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          {viewMode === 'grid' && (
            <>
              <Separator className="opacity-50" />
              <div>
                <p className="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Colunas
                </p>
                <FilesColumnSelector value={columns} options={columnOptions} onChange={onColumnsChange} />
              </div>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
