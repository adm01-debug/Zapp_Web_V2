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
 * - "Limpar", "Cancelar" e "Encaminhar N" — este ULTIMO desabilitado ate a PR G mergear,
 *   com o mesmo `title` da etapa 19 ("Disponivel em breve"). Sem ZIP e sem excluir em
 *   massa: essas acoes nao existem aqui de proposito.
 *
 * Toda acao habilitada tem handler real; o unico botao sem handler e o "Encaminhar N",
 * justamente porque esta desabilitado (nao ha servico de encaminhamento antes da PR G).
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
          disabled
          title="Disponível em breve"
        >
          {/* PR G: "Encaminhar N" so liga quando o servico real existir (etapa 38). */}
          Encaminhar {selectedCount}
        </Button>
      </div>
    </div>
  );
}
