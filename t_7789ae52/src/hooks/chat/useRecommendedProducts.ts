import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RecommendedProduct {
  id: string;
  name: string;
  price: number | null;
  currency: string | null;
  image_url: string | null;
  category: string | null;
}

/** Até 3 produtos ativos do catálogo — prioriza os que casam com as tags/interesses do contato, com fallback para os mais recentes (2.7). */
export function useRecommendedProducts(contactId: string | null | undefined, interesses: string[]) {
  return useQuery({
    queryKey: ['ai-tab-products', contactId, interesses],
    queryFn: async (): Promise<RecommendedProduct[]> => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, price, currency, image_url, category')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const all = (data ?? []) as RecommendedProduct[];
      const lowerInteresses = interesses.map((i) => i.toLowerCase());
      const matching = lowerInteresses.length
        ? all.filter((p) => p.category && lowerInteresses.some((i) => p.category!.toLowerCase().includes(i)))
        : [];
      return (matching.length ? matching : all).slice(0, 3);
    },
    enabled: !!contactId,
    staleTime: 60_000,
  });
}
