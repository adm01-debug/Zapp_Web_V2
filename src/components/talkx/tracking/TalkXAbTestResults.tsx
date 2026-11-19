/**
 * X065 — painel "Teste A/B" da campanha em execução.
 *
 * Resgate da fatia de UI da branch claude/ga-ci-verde-261020 (nunca mergeada),
 * reescrita sobre o contrato que a migration 20261118190000 entregou: as taxas
 * vêm CALCULADAS do servidor (`talkx_campaign_variant_stats`), então a tela não
 * divide por tamanho de array nem reimplementa a regra.
 *
 * Fica sem comparação até a MENOR amostra entre as variantes atingir
 * `ab_min_sample`, e com menos de duas variantes não há o que comparar. Usava a
 * soma, o que divergia do banco: `decide_talkx_ab_winner` calcula `min(s.total)`
 * e recusa com `insufficient_data`. Com mínima 50 e A=99/B=1 a tela mostrava a
 * comparação e a decisão automática reprovava — tela e banco discordando no
 * fluxo normal de envio desigual.
 *
 * Um invólucro só, três conteúdos: o orçamento de bytes do build
 * (performance-budget.json, total-assets) não paga três cópias das classes.
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
  /** Falha da RPC. Sem isto, lista vazia por erro virava "Amostra: 0". */
  isError?: boolean;
  onRetry?: () => void;
  /** X065: decide a vencedora. Ausente = tela só de leitura (sem a ação). */
  onDecidir?: (variantId?: string | null) => void;
  decidindo?: boolean;
  /** Motivo devolvido por `decide_talkx_ab_winner` quando recusou decidir. */
  motivoNaoDecidiu?: string | null;
  className?: string;
}

const NOTA = 'text-2xs text-foreground-secondary';

export function TalkXAbTestResults({
  abEnabled,
  metric,
  minSample,
  winnerVariantId,
  variants,
  isLoading = false,
  isError = false,
  onRetry,
  onDecidir,
  decidindo = false,
  motivoNaoDecidiu = null,
  className,
}: TalkXAbTestResultsProps) {
  if (!abEnabled) return null;

  const rotuloMetrica = TALKX_AB_METRIC_LABEL[metric];
  const linhas = variants.map((v) => ({ ...v, rate: talkXAbRate(v, metric) }));
  const totais = linhas.map((v) => Number(v.total ?? 0));
  // `decide_talkx_ab_winner` exige a mínima em CADA variante (min(s.total)):
  // a tela libera a comparação pela mesma regra, nunca pela soma.
  const menorAmostra = totais.length > 0 ? Math.min(...totais) : 0;
  const somaAmostra = totais.reduce((soma, t) => soma + t, 0);
  const maiorTaxa = linhas.length > 0 ? Math.max(...linhas.map((v) => v.rate)) : 0;
  const comparar = !isLoading && !isError && linhas.length >= 2 && menorAmostra >= minSample;

  return (
    <div
      className={cn('space-y-3 rounded-2xl border border-border/50 bg-card p-4', className)}
      data-testid="talkx-ab-results"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Teste A/B</h3>
        {!isLoading && <span className={cn(NOTA, 'font-semibold')}>{rotuloMetrica}</span>}
      </div>

      {isLoading && <p className={NOTA} role="status">Carregando o resultado por variante…</p>}

      {!isLoading && isError && (
        <div className="space-y-2" role="alert">
          <p className={NOTA}>Não foi possível carregar o resultado por variante.</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-border/60 px-2 py-1 text-2xs font-semibold text-foreground hover:bg-muted/50"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {!isLoading && !isError && !comparar && (
        <p className={NOTA}>
          {linhas.length < 2
            ? 'Só há uma variante com dados: sem par, não há comparação.'
            : `Menor amostra: ${menorAmostra} de ${minSample} destinatários por variante. O resultado aparece quando a menor atingir a mínima.`}
        </p>
      )}

      {comparar && (
        <>
          <p className={NOTA}>
            Menor amostra: {menorAmostra} · total {somaAmostra} destinatários · mínima {minSample} por variante
          </p>
          {onDecidir && !winnerVariantId && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onDecidir(null)}
                disabled={decidindo}
                className="rounded-lg bg-primary px-2.5 py-1 text-2xs font-semibold text-primary-foreground disabled:opacity-60"
              >
                {decidindo ? 'Decidindo…' : 'Decidir vencedora'}
              </button>
              <span className={NOTA}>
                A decisão automática só aceita diferença acima do ruído (2 erros-padrão).
              </span>
            </div>
          )}

          {motivoNaoDecidiu && (
            <p className={cn(NOTA, 'font-medium')} role="status">{motivoNaoDecidiu}</p>
          )}

          <div className="space-y-2">
            {linhas.map((v, i) => {
              // Em produção o id é UUID: rótulo legível (o do catálogo, ou A/B/C
              // pela ordem), com o id completo só no `title`.
              const rotulo = v.label && v.label.trim() ? v.label : `Variante ${String.fromCharCode(65 + i)}`;
              const venceu = Boolean(winnerVariantId) && v.variant_id === winnerVariantId;
              return (
                <div key={v.variant_id} className="flex items-center gap-3">
                  <span title={v.variant_id} className={cn(NOTA, 'w-20 shrink-0 font-medium')}>{rotulo}</span>
                  <div
                    className="h-4 flex-1 overflow-hidden rounded-full bg-muted/50"
                    role="img"
                    aria-label={`${rotulo}: ${v.rate.toFixed(1)}% em ${rotuloMetrica.toLowerCase()}, sobre ${v.total} destinatários`}
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
                  {onDecidir && !winnerVariantId && (
                    <button
                      type="button"
                      onClick={() => onDecidir(v.variant_id)}
                      disabled={decidindo}
                      className="shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 text-2xs text-foreground-secondary hover:bg-muted/50 disabled:opacity-60"
                      title={`Escolher ${rotulo} como vencedora`}
                    >
                      Escolher
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
