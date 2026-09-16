import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CommandItem } from '@/components/ui/command-palette';

/**
 * E38: hook para busca rapida de produtos no command palette (CmdK).
 */
export function useCatalogQuickSearch() {
  return useCallback(async (query: string): Promise<CommandItem[]> => {
    if (query.length < 2) return [];
    try {
      const { data, error } = await supabase.functions.invoke('promogifts-catalog', {
        body: { action: 'list_products', search: query, limit: 8, compact: true },
      });
      if (error || !data?.products) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.products as any[]).map((p: any) => ({
        id: 'catalog-' + String(p.id),
        title: String(p.name),
        description: [
          p.sku ? 'SKU ' + String(p.sku) : null,
          p.sale_price ? 'R$ ' + Number(p.sale_price).toFixed(2).replace('.', ',') : null,
        ].filter(Boolean).join(' · ') || undefined,
        category: 'search' as const,
        href: '/?view=catalog&product=' + String(p.id),
        keywords: [p.sku, p.brand].filter(Boolean) as string[],
      }));
    } catch {
      return [];
    }
  }, []);
}
