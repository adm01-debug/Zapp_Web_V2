/**
 * CV-105 — ProductRecommendationCard
 *
 * Card de recomendação de produto por IA. Ao contrário dos outros cards do
 * RADAR (que derivam de regra local e aparecem sozinhos), este custa uma
 * chamada de IA por uso: o atendente pede, o card responde. Por isso o estado
 * ocioso é um botão, não um resultado.
 */
import { Loader2, PackageSearch, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductRecommendationItem } from '@/hooks/copilot/useProductRecommendation';

export interface ProductRecommendationCardProps {
  recommendations: ProductRecommendationItem[];
  topPick: string;
  upsellOpportunity: string;
  isLoading: boolean;
  error: string | null;
  /** Dispara a chamada de IA. O painel monta o payload. */
  onRecommend: () => void;
  /** Sem destino para o texto, o card não oferece o botão de usar. */
  onUseSuggestion?: (text: string) => void;
  /** Sem mensagem do cliente não há o que recomendar. */
  disabled?: boolean;
  className?: string;
}

const URGENCIA_ROTULO: Record<ProductRecommendationItem['urgency'], string> = {
  low: 'sem pressa',
  medium: 'prazo médio',
  high: 'urgente',
};

/** Texto que entra no rascunho: produto, porquê e faixa de preço, na voz do vendedor. */
function scriptDaRecomendacao(item: ProductRecommendationItem): string {
  const preco = item.estimatedPrice ? ` A faixa de investimento fica em ${item.estimatedPrice}.` : '';
  return `Pelo que você me contou, eu sugiro ${item.product}. ${item.reasoning}${preco}`;
}

export function ProductRecommendationCard({
  recommendations,
  topPick,
  upsellOpportunity,
  isLoading,
  error,
  onRecommend,
  onUseSuggestion,
  disabled = false,
  className,
}: ProductRecommendationCardProps) {
  const jaRespondeu = recommendations.length > 0;
  const vazio = !isLoading && !error && !jaRespondeu;

  return (
    <div
      className={cn(
        'rounded-lg border border-emerald-500/30 bg-emerald-50/50 p-3 dark:bg-emerald-900/10',
        className,
      )}
      data-testid="cv105-recomendacao-produto"
    >
      <div className="flex items-center gap-1.5">
        <PackageSearch className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
          Recomendação de produto
        </span>
        {jaRespondeu && !isLoading && (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={onRecommend}
            disabled={disabled}
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Recalcular
          </button>
        )}
      </div>

      {isLoading && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden="true" />
          Consultando o catálogo…
        </p>
      )}

      {!isLoading && error && (
        <div className="mt-2">
          <p className="text-xs text-red-600 dark:text-red-400" role="alert">
            Não deu para recomendar agora: {error}
          </p>
          <button
            type="button"
            className="mt-1 text-xs text-primary hover:underline"
            onClick={onRecommend}
            disabled={disabled}
          >
            Tentar de novo
          </button>
        </div>
      )}

      {vazio && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">
            A IA lê a conversa e sugere até 3 brindes, com motivo e faixa de preço.
          </p>
          <button
            type="button"
            className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            onClick={onRecommend}
            disabled={disabled}
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Recomendar produtos
          </button>
        </div>
      )}

      {!isLoading && jaRespondeu && (
        <div className="mt-2 space-y-2">
          {recommendations.slice(0, 3).map((item, i) => {
            const destaque = Boolean(topPick) && item.product === topPick;
            return (
              <div key={`${item.product}-${i}`} className="text-xs">
                <div className="flex flex-wrap items-center gap-1">
                  {destaque && (
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-3xs font-medium text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200">
                      melhor escolha
                    </span>
                  )}
                  <span className="font-medium text-foreground/90">{item.product}</span>
                  {item.estimatedPrice && (
                    <span className="text-muted-foreground">· {item.estimatedPrice}</span>
                  )}
                  <span className="text-muted-foreground">· {URGENCIA_ROTULO[item.urgency]}</span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{item.reasoning}</p>
                {onUseSuggestion && (
                  <button
                    type="button"
                    className="mt-0.5 text-primary hover:underline"
                    onClick={() => onUseSuggestion(scriptDaRecomendacao(item))}
                  >
                    Usar no rascunho
                  </button>
                )}
              </div>
            );
          })}

          {upsellOpportunity && (
            <p className="border-t border-emerald-500/20 pt-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Para subir o ticket: </span>
              {upsellOpportunity}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
