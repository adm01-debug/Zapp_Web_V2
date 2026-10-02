import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContactPurchase {
  id: string;
  title: string;
  description: string | null;
  amount: number | null;
  currency: string;
  status: string;
  purchase_type: string;
  purchased_at: string | null;
  created_at: string;
}

export const contactPurchasesKey = (contactId: string) => ['contact-purchases', contactId] as const;

export function useContactPurchases(contactId: string) {
  return useQuery({
    queryKey: contactPurchasesKey(contactId),
    queryFn: async () => {
      const { data } = await supabase
        .from('contact_purchases')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      return (data ?? []) as ContactPurchase[];
    },
    enabled: !!contactId,
  });
}
