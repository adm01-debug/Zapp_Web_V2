/**
 * TODO: hook de links de pagamento — não implementado.
 *
 * Este arquivo é um stub mínimo criado para que `PaymentLinksView` e seus
 * testes compilem. A implementação real deve integrar com o provider de
 * pagamentos escolhido (Stripe, Asaas, etc.) e acessar a tabela correspondente
 * no Supabase.
 */

export interface PaymentLink {
  id: string;
  title: string;
  status: 'active' | 'paid' | 'expired' | 'cancelled';
  amount: number;
  payment_method: string;
  created_at: string;
  payment_url?: string;
  description?: string | null;
  expires_at?: string | null;
}

export interface CreatePaymentLinkInput {
  title: string;
  description?: string | null;
  amount: number;
  paymentMethod: string;
  paymentUrl: string;
}

export interface UsePaymentLinksResult {
  links: PaymentLink[] | undefined;
  isLoading: boolean;
  isError: boolean;
  createLink: (input: CreatePaymentLinkInput) => Promise<void>;
  deleteLink: (id: string) => Promise<void>;
}

/**
 * Hook stub — sempre retorna lista vazia e lança ao tentar criar/excluir.
 * Substitua pela implementação real quando o módulo de pagamentos for criado.
 */
export function usePaymentLinks(): UsePaymentLinksResult {
  return {
    links: [],
    isLoading: false,
    isError: false,
    createLink: async (_input: CreatePaymentLinkInput) => {
      throw new Error('usePaymentLinks: não implementado');
    },
    deleteLink: async (_id: string) => {
      throw new Error('usePaymentLinks: não implementado');
    },
  };
}
