import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Linha do catálogo autorizado (`products`) de onde a recomendação lê os atributos. */
export interface CatalogProductRow {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  category: string | null;
  /** Estoque declarado no catálogo; `null` = atributo AUSENTE na fonte autorizada. */
  stock_quantity: number | null;
}

/**
 * Disponibilidade conferida contra um atributo AUTORIZADO do catálogo:
 *  - `disponivel`: estoque informado e maior que zero (pode ser oferecido);
 *  - `confirmar`: estoque ausente — dado que falta exige confirmação humana,
 *    nunca presunção de que o produto existe.
 */
export type ProductAvailability = 'disponivel' | 'confirmar';

export interface RecommendedProduct extends CatalogProductRow {
  availability: ProductAvailability;
}

/**
 * Seleciona o que pode ser recomendado (IA-152, "recomendar produtos com
 * restrições reais"). Antes a recomendação casava só por categoria e não lia o
 * estoque: um produto esgotado (`stock_quantity` 0) era apresentado ao
 * atendente como se fosse viável. Agora só entra produto cuja restrição
 * CONHECIDA é compatível — estoque zerado/negativo fica fora — e estoque
 * ausente NÃO vira "disponível": entra marcado `confirmar`.
 *
 * As demais restrições do aceite (quantidade mínima, técnica, orçamento e
 * prazo) não têm fonte autorizada no catálogo; não são afirmadas aqui em vez de
 * inventadas.
 *
 * SL-217 (refazer 1): o critério de disponibilidade é aplicado ANTES da escolha
 * entre "casa com o interesse" e "catálogo recente". Antes ele rodava depois, e
 * um match esgotado ocupava as vagas da lista: com todos os produtos da
 * categoria do contato zerados, o filtro final esvaziava o resultado em vez de
 * cair para os recentes disponíveis (regressão em relação ao comportamento
 * anterior).
 */
export function selectRecommendableProducts(
  all: CatalogProductRow[],
  interesses: string[],
): RecommendedProduct[] {
  const lowerInteresses = interesses.map((i) => i.toLowerCase());
  const recomendaveis = all.filter((p) => p.stock_quantity == null || p.stock_quantity > 0);
  const matching = lowerInteresses.length
    ? recomendaveis.filter((p) => p.category && lowerInteresses.some((i) => p.category!.toLowerCase().includes(i)))
    : [];
  const ordered = matching.length ? matching : recomendaveis;
  return ordered
    .slice(0, 3)
    .map((p) => ({
      ...p,
      availability: p.stock_quantity == null ? 'confirmar' : 'disponivel',
    }));
}

/**
 * Até 3 produtos ativos do catálogo — prioriza os que casam com as
 * tags/interesses do contato, com fallback para os mais recentes (2.7) —
 * sem recomendar como viável o que já se sabe incompatível.
 */
export function useRecommendedProducts(contactId: string | null | undefined, interesses: string[]) {
  return useQuery({
    queryKey: ['ai-tab-products', contactId, interesses],
    queryFn: async (): Promise<RecommendedProduct[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, currency, image_url, category, stock_quantity')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const all = (data ?? []) as CatalogProductRow[];
      return selectRecommendableProducts(all, interesses);
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });
}
