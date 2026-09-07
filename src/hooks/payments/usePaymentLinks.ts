import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PaymentLink {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  payment_url: string | null;
  contact_id: string | null;
  paid_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface CreatePaymentLinkInput {
  title: string;
  description: string | null;
  amount: number;
  paymentMethod: string;
  paymentUrl: string;
}

const QUERY_KEY = ['payment-links'] as const;

export function usePaymentLinks() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PaymentLink[];
    },
    // O canal realtime existe apenas enquanto a tela está montada. Revalidar
    // no retorno fecha a janela em que mudanças externas poderiam ficar em cache.
    refetchOnMount: 'always',
  });

  useEffect(() => {
    const channel = supabase
      .channel('payment-links-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_links' }, () => {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const createLink = useCallback(async (input: CreatePaymentLinkInput) => {
    const { error } = await supabase.from('payment_links').insert({
      title: input.title,
      description: input.description,
      amount: input.amount,
      payment_method: input.paymentMethod,
      payment_url: input.paymentUrl,
    });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  const deleteLink = useCallback(async (id: string) => {
    const { error } = await supabase.from('payment_links').delete().eq('id', id);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }, [queryClient]);

  return {
    ...query,
    links: query.data ?? [],
    createLink,
    deleteLink,
  };
}
