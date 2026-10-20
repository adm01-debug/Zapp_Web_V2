import { CheckSquare, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FilesLayoutPopover } from './FilesLayoutPopover';
import { PeriodFilterSelector, type AnalysisPeriod } from '@/components/inbox/ai-tools/PeriodFilterSelector';
import type { ColumnOption } from '@/hooks/chat/useFilesContainerColumns';
import type { FilesColumns, FilesSort, FilesViewMode } from '@/hooks/chat/useFilesViewState';

/**
 * Barra de ferramentas da aba Arquivos (etapa 11): busca, ordenacao, filtro por DATA, Selecionar
 * e Layout.
 *
 * `flex-wrap` em vez do limiar de 640 px do plano: o repo nao tem infra de container query
 * (G7) e o efeito que a etapa pede — nada de rolagem horizontal, o grupo desce para a linha
 * de baixo quando nao cabe — e o mesmo. A busca nunca encolhe abaixo de 220 px.
 *
 * O filtro por data (F04) reusa o MESMO seletor da aba IA, ao lado de "Maiores"; a unica
 * diferenca e esconder "Ultima interacao", que nao faz sentido para arquivos.
 */

const SORT_LABELS: Record<FilesSort, string> = {
  recent: 'Mais recentes',
  old: 'Mais antigos',
  biggest: 'Maiores',
  alpha: 'Nome (A–Z)',
};

interface FilesToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: FilesSort;
  onSortChange: (sort: FilesSort) => void;
  period: AnalysisPeriod;
  onPeriodChange: (period: AnalysisPeriod) => void;
  customFrom: Date | null;
  customTo: Date | null;
  onCustomFromChange: (date: Date | undefined) => void;
  onCustomToChange: (date: Date | undefined) => void;
  /** Zera só as datas personalizadas — é o `onClearCustom` do seletor, não "limpar o período". */
  onClearCustom: () => void;
  /** Itens do recorte atual e do carregado — o contador do gatilho, como na IA. */
  filteredCount: number;
  totalCount: number;
  viewMode: FilesViewMode;
  onViewModeChange: (mode: FilesViewMode) => void;
  columns: FilesColumns;
  columnOptions: ColumnOption[];
  onColumnsChange: (columns: FilesColumns) => void;
  selectionMode: boolean;
  selectedCount: number;
  onToggleSelectionMode: () => void;
}

export function FilesToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  period,
  onPeriodChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  onClearCustom,
  filteredCount,
  totalCount,
  viewMode,
  onViewModeChange,
  columns,
  columnOptions,
  onColumnsChange,
  selectionMode,
  selectedCount,
  onToggleSelectionMode,
}: FilesToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="files-toolbar">
      <div className="relative min-w-[220px] flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar arquivos..."
          aria-label="Buscar arquivos"
          className="h-9 pl-9"
        />
      </div>

      <Select value={sort} onValueChange={(value) => onSortChange(value as FilesSort)}>
        <SelectTrigger className="h-9 w-[160px]" aria-label="Ordenar arquivos">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABELS) as FilesSort[]).map((modo) => (
            <SelectItem key={modo} value={modo}>
              {SORT_LABELS[modo]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* F04: filtro por data (F05/F06) — mesmo seletor da aba IA, ao lado de "Maiores".
          Largura mínima + `flex-1` (com teto) porque o gatilho e `w-full` e o rotulo longo
          ("05/03/26 — 07/03/26") nao cabe fixo; `flex-wrap` da barra cuida do celular. */}
      <div className="min-w-[180px] flex-1 max-w-[280px]" data-testid="files-period-filter">
        <PeriodFilterSelector
          period={period}
          onPeriodChange={onPeriodChange}
          customFrom={customFrom ?? undefined}
          customTo={customTo ?? undefined}
          onCustomFromChange={onCustomFromChange}
          onCustomToChange={onCustomToChange}
          onClearCustom={onClearCustom}
          filteredCount={filteredCount}
          totalCount={totalCount}
          hiddenPeriods={['last_interaction']}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={selectionMode ? 'default' : 'outline'}
          className="h-9 gap-1.5"
          aria-pressed={selectionMode}
          data-testid="files-select-toggle"
          onClick={onToggleSelectionMode}
        >
          <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
          {selectionMode ? 'Cancelar' : 'Selecionar'}
          {selectionMode && selectedCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1 tabular-nums">
              {selectedCount}
            </Badge>
          )}
        </Button>

        <FilesLayoutPopover
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          columns={columns}
          columnOptions={columnOptions}
          onColumnsChange={onColumnsChange}
        />
      </div>
    </div>
  );
}
