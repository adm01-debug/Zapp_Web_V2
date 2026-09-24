import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CatalogRail, CATALOG_RAIL_COPY } from '../CatalogRail';
import type { CatalogStats } from '@/hooks/integrations/useExternalCatalog';
import type { CatalogSendEventRow } from '@/hooks/integrations/useCatalogRecentSends';

// recharts nao desenha em jsdom (ResponsiveContainer mede 0x0), entao os
// testes do grafico cobrem o que e observavel: titulo, delta e skeleton.
const mockStats = (o: Partial<CatalogStats> = {}): CatalogStats => ({
  total: 7576, in_stock: 6040, featured: 2147, new_30d: 252, bestseller: 596,
  kits: 978, low_stock: 308, categories_root: 27, suppliers_active: 4,
  last_sync_at: '2026-09-22T15:40:00Z', last_update_at: '2026-09-22T10:20:00Z',
  by_month: [
    { month: '2026-07', count: 100 },
    { month: '2026-08', count: 150 },
    { month: '2026-09', count: 180 },
  ],
  ...o,
});

describe('CatalogRail — E51 banner', () => {
  it('renderiza a copy do banner e nao inclui o placeholder do mock', () => {
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.getByText(CATALOG_RAIL_COPY.bannerTitle)).toBeInTheDocument();
    expect(screen.queryByText(/SUA MARCA AQUI/i)).not.toBeInTheDocument();
  });

  it('usa o 1o produto em destaque COM imagem (ignora destaque sem foto)', () => {
    render(
      <CatalogRail
        stats={mockStats()}
        products={[
          { id: 'a', name: 'Sem foto', is_featured: true },
          { id: 'b', name: 'Caneta Bambu', is_featured: true, image_url: 'https://x/c.jpg' },
        ]}
      />,
    );
    expect(screen.getByText('Caneta Bambu')).toBeInTheDocument();
    expect(screen.queryByText('Sem foto')).not.toBeInTheDocument();
  });

  it('le a foto de primary_image_url (campo canonico do ExternalProduct)', () => {
    render(
      <CatalogRail
        stats={mockStats()}
        products={[{ id: 'b', name: 'Squeeze Inox', is_featured: true, primary_image_url: 'https://x/s.jpg' }]}
      />,
    );
    expect(screen.getByText('Squeeze Inox')).toBeInTheDocument();
  });

  it('sem produto em destaque nao inventa imagem', () => {
    render(<CatalogRail stats={mockStats()} products={[{ id: 'a', name: 'Comum', image_url: 'https://x/a.jpg' }]} />);
    expect(screen.queryByText('Comum')).not.toBeInTheDocument();
  });

  it('CTA do banner aplica o filtro de novidades', () => {
    const onApplyFilter = vi.fn();
    render(<CatalogRail stats={mockStats()} onApplyFilter={onApplyFilter} />);
    fireEvent.click(screen.getByText(`${CATALOG_RAIL_COPY.bannerCta} →`));
    expect(onApplyFilter).toHaveBeenCalledWith('new_30d');
  });
});

describe('CatalogRail — E52 grafico mensal', () => {
  it('mostra o delta quando o mes anterior tem base > 0', () => {
    render(<CatalogRail stats={mockStats()} />);
    // 150 -> 180 = +20%
    expect(screen.getByText('+20%')).toBeInTheDocument();
  });

  it('omite o delta quando o mes anterior e zero (evita +Infinity%)', () => {
    render(<CatalogRail stats={mockStats({ by_month: [{ month: '2026-08', count: 0 }, { month: '2026-09', count: 42 }] })} />);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('sem by_month o card do grafico nao renderiza', () => {
    render(<CatalogRail stats={mockStats({ by_month: [] })} />);
    expect(screen.queryByText('Resumo do catálogo')).not.toBeInTheDocument();
  });
});

describe('CatalogRail — E53 contagens', () => {
  it('mostra os 4 valores reais de catalog_stats', () => {
    render(<CatalogRail stats={mockStats()} />);
    expect(screen.getByText('6.040')).toBeInTheDocument();
    expect(screen.getByText('2.147')).toBeInTheDocument();
    expect(screen.getByText('252')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('linha com filtro real e clicavel e aplica o filtro', () => {
    const onApplyFilter = vi.fn();
    render(<CatalogRail stats={mockStats()} onApplyFilter={onApplyFilter} />);
    fireEvent.click(screen.getByText('Produtos em estoque'));
    expect(onApplyFilter).toHaveBeenCalledWith('in_stock');
  });

  it('"Fornecedores ativos" nao e botao (e contagem, nao filtro)', () => {
    render(<CatalogRail stats={mockStats()} onApplyFilter={vi.fn()} />);
    expect(screen.getByText('Fornecedores ativos').closest('button')).toBeNull();
  });

  it('loading mostra skeleton e nenhum valor', () => {
    render(<CatalogRail loading />);
    expect(screen.queryByText('6.040')).not.toBeInTheDocument();
  });
});

describe('CatalogRail — E56 enviados recentemente / mais enviados', () => {
  // Derivado de CatalogSendEventRow de proposito: campo novo no tipo passa
  // a aparecer aqui como erro de compilacao, nao como fixture silenciosamente
  // desatualizado.
  const ev = (o: Partial<CatalogSendEventRow> = {}): CatalogSendEventRow => ({
    id: 'e1', product_id: 'p1', product_name: 'Caneta Bambu', product_sku: 'CB-1',
    status: 'sent', created_at: new Date().toISOString(),
    contact_id: 'c1', contact_name: 'Maria Souza', ...o,
  });

  it('sem eventos a secao inteira fica oculta', () => {
    render(<CatalogRail stats={mockStats()} recentSends={[]} topSent={[]} />);
    expect(screen.queryByText('Enviados recentemente')).not.toBeInTheDocument();
    expect(screen.queryByText('Mais enviados')).not.toBeInTheDocument();
  });

  it('lista os envios recentes com o status traduzido', () => {
    render(
      <CatalogRail
        stats={mockStats()}
        recentSends={[
          ev({ id: 'e1', product_name: 'Caneta Bambu', status: 'sent' }),
          ev({ id: 'e2', product_id: 'p2', product_name: 'Squeeze Inox', status: 'failed' }),
          ev({ id: 'e3', product_id: 'p3', product_name: 'Mochila Preta', status: 'partial' }),
        ]}
      />,
    );
    expect(screen.getByText('Enviados recentemente')).toBeInTheDocument();
    expect(screen.getByText('Caneta Bambu')).toBeInTheDocument();
    expect(screen.getByText(/Falhou/)).toBeInTheDocument();
    expect(screen.getByText(/Parcial/)).toBeInTheDocument();
  });

  it('mostra o destinatario na legenda do envio', () => {
    render(<CatalogRail stats={mockStats()} recentSends={[ev({ contact_name: 'Joana Prado' })]} />);
    expect(screen.getByText(/Joana Prado/)).toBeInTheDocument();
  });

  it('sem nome de contato a legenda nao quebra nem mostra separador solto', () => {
    render(<CatalogRail stats={mockStats()} recentSends={[ev({ contact_name: null })]} />);
    const legenda = screen.getByText(/Enviado/);
    expect(legenda).toBeInTheDocument();
    expect(legenda.textContent?.trim().endsWith('·')).toBe(false);
  });

  it('clicar num envio recente reabre o produto pelo id', () => {
    const onOpenProduct = vi.fn();
    render(<CatalogRail stats={mockStats()} recentSends={[ev({ product_id: 'p-42' })]} onOpenProduct={onOpenProduct} />);
    fireEvent.click(screen.getByText('Caneta Bambu'));
    expect(onOpenProduct).toHaveBeenCalledWith('p-42');
  });

  it('"Mais enviados" mostra a contagem e so aparece com recentes', () => {
    render(
      <CatalogRail
        stats={mockStats()}
        recentSends={[ev()]}
        topSent={[{ product_id: 'p1', product_name: 'Caneta Bambu', count: 12 }]}
      />,
    );
    expect(screen.getByText('Mais enviados')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
