/**
 * X065 — painel "Teste A/B" da campanha em execução.
 *
 * Resgate da fatia de UI da branch claude/ga-ci-verde-261020 (nunca mergeada),
 * reescrita sobre o contrato que a migration 20261118190000 entregou: as taxas
 * vêm CALCULADAS do servidor (`talkx_campaign_variant_stats`), então a tela não
 * divide por tamanho de array nem reimplementa a regra.
 *
 * Fica escondido até a amostra somada atingir `ab_min_sample` — antes disso o
 * número engana mais do que informa, e é a mesma barreira que a decisão
 * automática usa no banco.
 */
import { cn } from '@/lib/utils';
import {
  TALKX_AB_METRIC_LABEL,
  talkXAbRate,
  type TalkXAbMetric,
  type TalkXAbVariantStat,
} from '@/hooks/integrations/useTalkXAbStats';

export interface TalkXAbTestResultsProps {
  abEnabled: boolean | null | undefined;
  metric: TalkXAbMetric;
  minSample: number;
  winnerVariantId: string | null | undefined;
  variants: TalkXAbVariantStat[];
  isLoading?: boolean;
  className?: string;
}

export function TalkXAbTestResults({
  abEnabled,
  metric,
  minSample,
  winnerVariantId,
  variants,
  isLoading = false,
  className,
}: TalkXAbTestResultsProps) {
  if (!abEnabled) return null;

  const linhas = variants.map((v) => ({ ...v, rate: talkXAbRate(v, metric) }));
  const amostra = linhas.reduce((soma, v) => soma + Number(v.total ?? 0), 0);
  const maiorTaxa = linhas.length > 0 ? Math.max(...linhas.map((v) => v.rate)) : 0;

  if (isLoading) {
    return (
      <div className={cn('rounded-2xl border border-border/50 bg-card p-4', className)} data-testid="talkx-ab-results">
        <h3 className="text-sm font-bold text-foreground">Teste A/B</h3>
        <p className="mt-2 text-2xs text-foreground-secondary" role="status">Carregando o resultado por variante…</p>
      </div>
    );
  }

  if (amostra < minSample) {
    return (
      <div className={cn('rounded-2xl border border-border/50 bg-card p-4', className)} data-testid="talkx-ab-results">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Teste A/B</h3>
          <span className="text-2xs font-semibold text-foreground-secondary">{TALKX_AB_METRIC_LABEL[metric]}</span>
        </div>
        <p className="mt-2 text-2xs text-foreground-secondary">
          Amostra: {amostra} de {minSample} destinatários. O resultado aparece quando houver base para comparar.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-2xl border border-border/50 bg-card p-4 space-y-3', className)} data-testid="talkx-ab-results">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Teste A/B</h3>
        <span className="text-2xs font-semibold text-foreground-secondary">{TALKX_AB_METRIC_LABEL[metric]}</span>
      </div>
      <p className="text-2xs text-foreground-secondary">
        Amostra: {amostra} destinatários · mínima {minSample}
      </p>
      <div className="space-y-2">
        {linhas.map((v, i) => {
          // Em produção o id é UUID: rótulo legível (o do catálogo, ou A/B/C pela
          // ordem), com o id completo só no `title`.
          const rotulo = v.label && v.label.trim() ? v.label : `Variante ${String.fromCharCode(65 + i)}`;
          const venceu = Boolean(winnerVariantId) && v.variant_id === winnerVariantId;
          return (
            <div key={v.variant_id} className="flex items-center gap-3">
              <span title={v.variant_id} className="w-20 shrink-0 text-2xs font-medium text-foreground-secondary">
                {rotulo}
              </span>
              <div
                className="h-4 flex-1 overflow-hidden rounded-full bg-muted/50"
                role="img"
                aria-label={`${rotulo}: ${v.rate.toFixed(1)}% em ${TALKX_AB_METRIC_LABEL[metric].toLowerCase()}, sobre ${v.total} destinatários`}
              >
                <div
                  className="h-full rounded-full motion-safe:transition-all"
                  style={{
                    width: `${maiorTaxa > 0 ? (v.rate / maiorTaxa) * 100 : 0}%`,
                    backgroundColor: venceu ? 'hsl(var(--success))' : 'hsl(var(--primary))',
                  }}
                />
              </div>
              <span className="w-12 text-right text-2xs font-bold text-foreground">{v.rate.toFixed(1)}%</span>
              {venceu && <span className="shrink-0 text-2xs font-bold text-success">Vencedora</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
