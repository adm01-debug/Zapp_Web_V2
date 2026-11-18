import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { contactCrm360Key } from './useContactCrm360';

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

/** Dados que a tela Nova Compra/Proposta manda para gravar. */
export interface NovoRegistroCompra {
  contactId: string;
  title: string;
  amount: number | null;
  purchaseType: string;
  profileId?: string | null;
}

/**
 * Escrita das compras do contato. O erro do insert NÃO é engolido: vira toast
 * pt-BR e a mutation rejeita, então quem chama só fecha/limpa o formulário quando
 * a gravação deu certo (`onSuccess`) — no erro os dados digitados permanecem.
 */
export function useCreateContactPurchase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (registro: NovoRegistroCompra) => {
      const { error } = await supabase.from('contact_purchases').insert({
        contact_id: registro.contactId,
        title: registro.title.trim(),
        amount: registro.amount,
        purchase_type: registro.purchaseType,
        created_by: registro.profileId ?? null,
      });
      if (error) throw error;
      return registro;
    },
    onSuccess: (_registro, variaveis) => {
      void queryClient.invalidateQueries({ queryKey: contactCrm360Key(variaveis.contactId) });
      void queryClient.invalidateQueries({ queryKey: contactPurchasesKey(variaveis.contactId) });
    },
    onError: (error) => {
      log.error('Falha ao registrar compra/proposta:', error);
      toast.error('Não foi possível registrar. Tente novamente.');
    },
  });
}

export function useContactPurchases(contactId: string) {
  return useQuery({
    queryKey: contactPurchasesKey(contactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_purchases')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactPurchase[];
    },
    enabled: !!contactId,
  });
}
