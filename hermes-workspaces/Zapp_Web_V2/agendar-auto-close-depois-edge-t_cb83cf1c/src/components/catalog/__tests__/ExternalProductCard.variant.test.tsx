import './catalogMocks';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ExternalProductCard } from '../ExternalProductCard';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';

vi.mock('@/hooks/ui/use-mobile', () => ({
  useIsMobile: () => false,
  MOBILE_BREAKPOINT: 768,
}));

const mockUseExternalProduct = vi.fn(() => ({ data: undefined, isFetching: false }));
vi.mock('@/hooks/integrations/useExternalCatalog', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/integrations/useExternalCatalog')>(
    '@/hooks/integrations/useExternalCatalog',
  );
  return {
    ...actual,
    useExternalProduct: () => mockUseExternalProduct(),
  };
});

const product = {
  id: 'p414',
  name: 'Caneta com variações',
  sku: 'CAN-414',
  sale_price: 12.5,
  stock_quantity: 20,
  primary_image_url: null,
  colors: ['Azul', 'Vermelho'],
  variants: [
    {
      id: 'v-azul',
      sku: 'CAN-414-AZ',
      color_name: 'Azul',
      color_hex: '#0000ff',
      stock_quantity: 8,
      is_active: true,
    },
    {
      id: 'v-vermelho',
      sku: 'CAN-414-VM',
      color_name: 'Vermelho',
      color_hex: '#ff0000',
      stock_quantity: 12,
      is_active: true,
    },
  ],
  is_stockout: false,
  suppliers: null,
} as unknown as ExternalProduct;

describe('#414 — ExternalProductCard preserva a cor da variação', () => {
  it('seleciona Vermelho no detalhe e chama onSend com produto e cor', async () => {
    const onSend = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <ExternalProductCard product={product} onSend={onSend} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    const detail = await screen.findByTestId('product-detail-sheet');
    fireEvent.click(within(detail).getByRole('button', { name: /^Cor Vermelho:/ }));
    fireEvent.click(within(detail).getByRole('button', { name: 'Enviar variação (Vermelho)' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith(product, 'Vermelho'));
  });
});
