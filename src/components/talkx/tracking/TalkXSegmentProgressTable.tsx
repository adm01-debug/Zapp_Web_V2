// X149 — card "Fila por Segmento" da campanha (tela 11; reutilizado na tela 13).
//
// Defeito que este card resolve: a tela não mostrava nada por público — não havia
// como ver quanto de cada segmento (VIP, Recompra…) já recebeu e quanto falta.
//
// Apresentação apenas: os números chegam PRONTOS da RPC
// `talkx_campaign_segment_progress` (N-096/X142); a tela ordena pela ordem de envio
// e formata. Nenhuma cor nova: só tokens do projeto (primary/success/muted/foreground).
// A única animação é a largura da barra e só roda com `motion-safe`.
//
// O componente NÃO consulta o banco (o lint proíbe componente importar o client): quem
// lê a RPC é o hook `useTalkXSegmentProgress` (X144) e passa `rows` para cá.
import { useMemo, useState } from 'react';
import { ArrowRight, ListOrdered } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { RailCard, Th, Td, fmtInt } from '../talkxShared';
import { TalkXEmptyState, TalkXQueryBoundary, TalkXSkeletonRows } from '../kit/states';
import {
  SEGMENT_PREVIEW_SIZE,
  toSegmentProgressItems,
  type TalkXSegmentProgressItem,
  type TalkXSegmentProgressRpcRow,
} from './talkxSegmentProgress';

export interface TalkXSegmentProgressTableProps {
  /** Linhas da RPC, na ordem de envio (o componente reordena por segurança). */
  rows?: TalkXSegmentProgressRpcRow[] | null;
  /** Nome do público por `segment_id` — a RPC devolve só o id. */
  segmentNames?: Record<string, string>;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Clique no público aplica o filtro "segmentação" do cabeçalho. */
  onSelectSegment?: (segmentId: string | null) => void;
  /** Quantas linhas no card antes do "Ver todos →" (tela 11: 4). */
  previewSize?: number;
}

/**
 * Barra + percentual do público. Verde quando o segmento está 100% processado.
 * `motion-safe:` porque a transição de largura é enfeite: com "reduzir movimento"
 * ligado, o valor aparece direto, sem animação.
 */
function SegmentProgressCell({ percent, done }: { percent: number; done: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div
        aria-hidden="true"
        className="h-1.5 min-w-[64px] flex-1 overflow-hidden rounded-full bg-muted/60"
      >
        {percent > 0 && (
          <div
            data-testid="talkx-segment-progress-bar"
            className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 ${
              done ? 'bg-success' : 'bg-primary'
            }`}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
      <span className="w-9 text-right text-2xs font-medium tabular-nums text-foreground-secondary">
        {percent}%
      </span>
    </div>
  );
}

function SegmentRow({
  item, onSelectSegment,
}: {
  item: TalkXSegmentProgressItem;
  onSelectSegment?: (segmentId: string | null) => void;
}) {
  return (
    <tr className="border-b border-border/40 last:border-0">
      <Td className="py-2">
        {onSelectSegment ? (
          <button
            type="button"
            onClick={() => onSelectSegment(item.segmentId)}
            className="text-left text-xs font-semibold text-foreground hover:text-primary"
          >
            {item.label}
          </button>
        ) : (
          <span className="text-xs font-semibold text-foreground">{item.label}</span>
        )}
      </Td>
      <Td className="py-2 text-right tabular-nums">{fmtInt(item.total)}</Td>
      <Td className="py-2 text-right tabular-nums">{fmtInt(item.sent)}</Td>
      <Td className="py-2 text-right tabular-nums">{fmtInt(item.remaining)}</Td>
      <Td className="py-2">
        <SegmentProgressCell percent={item.percent} done={item.done} />
      </Td>
    </tr>
  );
}

function SegmentTable({
  items, onSelectSegment,
}: {
  items: TalkXSegmentProgressItem[];
  onSelectSegment?: (segmentId: string | null) => void;
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <caption className="sr-only">Fila por segmento: total, enviadas, restante e progresso</caption>
      <thead>
        <tr className="border-b border-border/60">
          <Th>Segmento</Th>
          <Th className="text-right">Total</Th>
          <Th className="text-right">Enviadas</Th>
          <Th className="text-right">Restante</Th>
          <Th>Progresso</Th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <SegmentRow key={item.id} item={item} onSelectSegment={onSelectSegment} />
        ))}
      </tbody>
    </table>
  );
}

export function TalkXSegmentProgressTable({
  rows,
  segmentNames,
  isLoading = false,
  isError = false,
  onRetry,
  onSelectSegment,
  previewSize = SEGMENT_PREVIEW_SIZE,
}: TalkXSegmentProgressTableProps) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => toSegmentProgressItems(rows, segmentNames), [rows, segmentNames]);
  const preview = items.slice(0, previewSize);
  const hasMore = items.length > previewSize;

  return (
    <RailCard
      icon={ListOrdered}
      color="violet"
      title="Fila por Segmento"
      right={hasMore ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-2xs font-semibold text-[hsl(var(--primary-text))] hover:text-primary"
        >
          Ver todos
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : undefined}
    >
      <TalkXQueryBoundary
        query={{ isLoading, isFetching: isLoading, isError, error: null }}
        entity="informações dos segmentos"
        onRetry={onRetry}
        skeleton={<TalkXSkeletonRows rows={previewSize} />}
        isEmpty={items.length === 0}
        empty={(
          <TalkXEmptyState
            title="Nenhum segmento nesta campanha"
            description="A campanha ainda não tem públicos configurados."
          />
        )}
      >
        <SegmentTable items={preview} onSelectSegment={onSelectSegment} />
        {hasMore && (
          <p className="border-t border-border/40 pt-2 text-2xs text-muted-foreground">
            Mostrando os {previewSize} primeiros de {items.length} segmentos.
          </p>
        )}
      </TalkXQueryBoundary>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="space-y-1 border-b border-border/60 px-4 py-3 text-left">
            <SheetTitle className="text-sm">Fila por Segmento</SheetTitle>
            <p className="text-2xs text-muted-foreground">Todos os públicos, na ordem de envio.</p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <SegmentTable items={items} onSelectSegment={onSelectSegment} />
          </div>
        </SheetContent>
      </Sheet>
    </RailCard>
  );
}
