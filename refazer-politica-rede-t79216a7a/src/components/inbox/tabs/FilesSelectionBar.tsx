import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Barra contextual de selecao da aba Arquivos (etapas 32 e 33).
 *
 * Aparece no topo da area de arquivos enquanto `selectionMode`. Traz:
 * - "N selecionados" com `aria-live="polite"` (o leitor de tela ouve cada mudanca);
 * - o checkbox geral de "Selecionar todos (M visiveis)", com `indeterminate` quando ha
 *   selecao parcial — M e o recorte atual (`filtered`), nunca a colecao inteira;
 * - "k selecionados fora do filtro" quando o operador troca o filtro e deixa itens
 *   marcados que sumiram do recorte (etapa 33);
 * - "Limpar", "Cancelar" e "Encaminhar N" — este ultimo abre o dialogo de encaminhamento
 *   real (etapa 38). Sem ZIP e sem excluir em massa: essas acoes nao existem aqui de
 *   proposito.
 *
 * Toda acao habilitada tem handler real. Quando `forwardLimitReason` vem preenchido (etapa
 * 39), o botao fica desabilitado e o motivo aparece ao lado dele.
 */

interface FilesSelectionBarProps {
  selectedCount: number;
  /** M: quantos itens o recorte atual (`filtered`) tem. */
  visibleCount: number;
  /** k: selecionados que nao estao no recorte atual. */
  outsideFilterCount: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  onSelectAllVisible: () => void;
  onClear: () => void;
  onCancel: () => void;
  /** Etapa 38: abre o dialogo de encaminhamento com os N selecionados. */
  onForward: () => void;
  /** Etapa 39: motivo pelo qual o encaminhamento excede o limite (desabilita o botao). */
  forwardLimitReason?: string | null;
}

export function FilesSelectionBar({
  selectedCount,
  visibleCount,
  outsideFilterCount,
  allVisibleSelected,
  someVisibleSelected,
  onSelectAllVisible,
  onClear,
  onCancel,
  onForward,
  forwardLimitReason = null,
}: FilesSelectionBarProps) {
  const checkedState: boolean | 'indeterminate' = allVisibleSelected
    ? true
    : someVisibleSelected
      ? 'indeterminate'
      : false;

  return (
    <div
      data-testid="files-selection-bar"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/40 bg-primary/5 px-3 py-2"
    >
      <p className="text-sm font-semibold text-foreground tabular-nums" aria-live="polite">
        {selectedCount} {selectedCount === 1 ? 'selecionado' : 'selecionados'}
      </p>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox
          checked={checkedState}
          aria-label="Selecionar todos"
          onCheckedChange={(checked) => {
            if (checked) onSelectAllVisible();
            else onClear();
          }}
        />
        <span className="tabular-nums">Selecionar todos ({visibleCount} visíveis)</span>
      </label>

      {outsideFilterCount > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {outsideFilterCount} selecionados fora do filtro
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {forwardLimitReason && (
          <span className="text-xs text-destructive" role="status">{forwardLimitReason}</span>
        )}
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onClear}>
          Limpar
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={selectedCount === 0 || forwardLimitReason !== null}
          title={forwardLimitReason ?? undefined}
          onClick={onForward}
        >
          {/* Etapa 38: "Encaminhar N" abre o mesmo diálogo com os N itens da seleção. */}
          Encaminhar {selectedCount}
        </Button>
      </div>
    </div>
  );
}
