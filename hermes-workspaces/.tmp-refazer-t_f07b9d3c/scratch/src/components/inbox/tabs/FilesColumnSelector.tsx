import { useRef } from 'react';
import type { FilesColumns } from '@/hooks/chat/useFilesViewState';
import type { ColumnOption } from '@/hooks/chat/useFilesContainerColumns';
import { cn } from '@/lib/utils';

/**
 * Seletor de colunas (etapa 13), portado do `ColumnSelector` do Promo Gifts com as duas
 * correções que o plano exige (G12): **puramente controlado** — nao le `window.innerWidth`,
 * nao escreve em `localStorage` e nao faz clamp por conta propria (quem decide o que cabe e
 * o hook de contêiner; quem persiste e o hook de estado).
 *
 * As 5 opcoes ficam **sempre visiveis**: a que nao cabe aparece `aria-disabled` com o motivo,
 * para o operador entender o que precisa recolher em vez de achar que a opcao nao existe.
 */

const ICON_SHAPE: Record<FilesColumns, { cols: number; rows: number }> = {
  3: { cols: 3, rows: 2 },
  4: { cols: 4, rows: 2 },
  5: { cols: 5, rows: 2 },
  6: { cols: 3, rows: 3 },
  8: { cols: 4, rows: 3 },
};

function GridIcon({ cols, rows = 2 }: { cols: number; rows?: number }) {
  const size = 18;
  const gap = 2;
  const cellW = (size - (cols - 1) * gap) / cols;
  const cellH = (size - (rows - 1) * gap) / rows;
  const rects: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push(
        <rect
          key={`${r}-${c}`}
          x={c * (cellW + gap)}
          y={r * (cellH + gap)}
          width={cellW}
          height={cellH}
          rx={1}
          fill="currentColor"
        />,
      );
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {rects}
    </svg>
  );
}

interface FilesColumnSelectorProps {
  value: FilesColumns;
  options: ColumnOption[];
  onChange: (columns: FilesColumns) => void;
}

export function FilesColumnSelector({ value, options, onChange }: FilesColumnSelectorProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const maxFits = options.reduce((maior, option) => (option.fits ? Math.max(maior, option.n) : maior), 0);

  /** Radio pattern: as setas movem o foco E selecionam, pulando o que nao cabe. */
  const mover = (passo: 1 | -1) => {
    const inicio = Math.max(0, options.findIndex((option) => option.n === value));
    for (let salto = 1; salto <= options.length; salto++) {
      const indice = (((inicio + passo * salto) % options.length) + options.length) % options.length;
      const candidato = options[indice];
      if (candidato?.fits) {
        onChange(candidato.n);
        refs.current[indice]?.focus();
        return;
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Número de colunas"
      className="inline-flex items-center gap-0.5 rounded-xl border border-border/40 bg-muted/60 p-1"
    >
      {options.map((option, indice) => {
        const ativo = value === option.n;
        const motivo = option.fits ? `${option.n} colunas` : `Não cabe na largura atual (máximo ${maxFits || 3})`;
        return (
          <button
            key={option.n}
            ref={(el) => { refs.current[indice] = el; }}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-disabled={option.fits ? undefined : true}
            aria-label={`${option.n} colunas`}
            title={motivo}
            data-testid={`files-columns-${option.n}`}
            tabIndex={ativo ? 0 : -1}
            onClick={() => { if (option.fits) onChange(option.n); }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); mover(1); }
              else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); mover(-1); }
            }}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              option.fits ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
              ativo ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <GridIcon {...ICON_SHAPE[option.n]} />
          </button>
        );
      })}
    </div>
  );
}
