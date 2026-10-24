import { CheckSquare, Filter, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { FilesLayoutPopover } from './FilesLayoutPopover';
import { PeriodFilterSelector, type AnalysisPeriod } from '@/components/inbox/ai-tools/PeriodFilterSelector';
import type { ColumnOption } from '@/hooks/chat/useFilesContainerColumns';
import type { FilesColumns, FilesSort, FilesViewMode } from '@/hooks/chat/useFilesViewState';

/**
 * Barra de ferramentas da aba Arquivos (etapa 11): busca, ordenacao, o FUNIL (R08), Selecionar
 * e Layout.
 *
 * `flex-wrap` em vez do limiar de 640 px do plano: o repo nao tem infra de container query
 * (G7) e o efeito que a etapa pede — nada de rolagem horizontal, o grupo desce para a linha
 * de baixo quando nao cabe — e o mesmo. A busca nunca encolhe abaixo de 220 px.
 *
 * R08/D08: o seletor de periodo do F04 e o filtro de remetente moram no MESMO painel, atras do
 * botao de funil — o recorte por data continua com o estado de sempre
 * (`useFilesViewState`), so mudou de lugar na tela. O painel monta as opcoes a partir dos itens
 * ja resolvidos pelo `FilesTab` (quem monta/rotula cada remetente e a regra D01, la), entao
 * aqui so ha "chave, rotulo e contagem".
 */

const SORT_LABELS: Record<FilesSort, string> = {
  recent: 'Mais recentes',
  old: 'Mais antigos',
  biggest: 'Maiores',
  alpha: 'Nome (A–Z)',
};

/** R08/S56: uma opcao do filtro de remetente do painel (a chave vem resolvida pelo `FilesTab`). */
export interface SenderFilterOption {
  /** `self` | `contact` | `team` | `agent:<id>` — a mesma chave que o `FilesTab` usa ao filtrar. */
  key: string;
  label: string;
  /** Itens deste remetente no recorte contado (o mesmo recorte dos chips: o periodo). */
  count: number;
}

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
  /** R08: opções do funil (Você, contato, atendentes e Equipe) já com a contagem. */
  senderOptions: SenderFilterOption[];
  /** R08: chaves marcadas; lista vazia = todos os remetentes. */
  selectedSenders: string[];
  onToggleSender: (key: string) => void;
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
  senderOptions,
  selectedSenders,
  onToggleSender,
  viewMode,
  onViewModeChange,
  columns,
  columnOptions,
  onColumnsChange,
  selectionMode,
  selectedCount,
  onToggleSelectionMode,
}: FilesToolbarProps) {
  // R08: o funil conta os recortes ATIVOS (periodo = 1, cada remetente marcado = 1) — o mesmo
  // numero que o operador ve marcado dentro do painel.
  const activeFilterCount = (period !== 'all' ? 1 : 0) + selectedSenders.length;

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

      {/* R08/S55: botão de filtro (funil). O período do F04 (mesmo seletor da aba IA, com
          "Última interação" escondida, que não faz sentido para arquivos) passou a morar AQUI,
          ao lado do filtro de remetente, mantendo o mesmo estado. */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={activeFilterCount > 0 ? 'default' : 'outline'}
            className="h-9 gap-1.5"
            aria-label="Filtrar arquivos"
            title="Filtrar arquivos por período e por remetente"
            data-testid="files-filter-trigger"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-xs">Filtros</span>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1 tabular-nums">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="w-72 border-border p-4" data-testid="files-filter-panel">
          <div className="space-y-4">
            <div>
              <p className="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Período
              </p>
              <div data-testid="files-period-filter">
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
            </div>

            <Separator className="opacity-50" />

            <div>
              <p className="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Remetente
              </p>
              {senderOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground" data-testid="files-sender-empty">
                  Nenhum remetente no recorte atual.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5" data-testid="files-sender-options">
                  <p className="px-2 pb-1 text-3xs text-muted-foreground">Nenhum marcado = todos</p>
                  {senderOptions.map((option) => {
                    const id = `files-sender-option-${option.key}`;
                    const marcado = selectedSenders.includes(option.key);
                    return (
                      <div
                        key={option.key}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
                        data-testid={`files-sender-${option.key}`}
                      >
                        <Checkbox
                          id={id}
                          checked={marcado}
                          onCheckedChange={() => onToggleSender(option.key)}
                          aria-label={option.label}
                        />
                        <label
                          htmlFor={id}
                          className={cn(
                            'min-w-0 flex-1 cursor-pointer truncate text-[13px]',
                            marcado ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {option.label}
                        </label>
                        <span className="tabular-nums text-3xs text-muted-foreground">{option.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>

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
